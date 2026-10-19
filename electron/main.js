const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const dbus = require('dbus-next')

// Enable transparent visuals on Linux compositors
app.commandLine.appendSwitch('enable-transparent-visuals')

let mainWindow
let bus
let dbusConnection = null
let onPropsChanged = null

const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player'
const ALLOWED_ACTIONS = ['PlayPause', 'Play', 'Pause', 'Next', 'Previous']

// dbus-next wraps values in Variant objects: unwrap them
const unwrap = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v)

// Resolves file:// or local disk paths to Base64 data URLs so Chromium never blocks them
function resolveArtUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  try {
    let filePath = rawUrl
    if (rawUrl.startsWith('file://')) {
      filePath = decodeURIComponent(new URL(rawUrl).pathname)
    }
    if (filePath.startsWith('/') && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).slice(1).toLowerCase() || 'jpeg'
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg'
      const data = fs.readFileSync(filePath)
      return `data:${mime};base64,${data.toString('base64')}`
    }
  } catch (e) {
    console.warn('Failed to resolve artUrl file to base64:', e)
  }
  return rawUrl
}

// Ukuran window tetap (agar posisi tengah tidak pernah loncat dan tidak ada glitch kotak hitam di Linux)
const WIN_WIDTH = 440
const WIN_HEIGHT = 220

// Jarak turun dari tepi atas layar (dalam pixel)
const TOP_MARGIN = 10

function toggleVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const screenWidth = primaryDisplay.bounds.width
  const posX = Math.round(primaryDisplay.bounds.x + (screenWidth - WIN_WIDTH) / 2)
  const posY = primaryDisplay.bounds.y + TOP_MARGIN

  mainWindow = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    type: 'toolbar', // Disables KWin window decorations, borders, and shadows on Linux
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '..', 'out', 'index.html'))
    })
    // Set DEVTOOLS=1 if you ever want the inspector back
    if (process.env.DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'out', 'index.html'))
  }
}

// ---------- MPRIS / DBus ----------

async function listPlayers() {
  const obj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
  const names = await obj.getInterface('org.freedesktop.DBus').ListNames()
  return names.filter(
    (n) => n.startsWith('org.mpris.MediaPlayer2.') && !n.endsWith('.playerctld')
  )
}

// Prefer a player that is currently Playing (Spotify app, Brave, Firefox...)
async function pickPlayer() {
  let fallback = null
  for (const name of await listPlayers()) {
    try {
      const proxy = await bus.getProxyObject(name, '/org/mpris/MediaPlayer2')
      const props = proxy.getInterface('org.freedesktop.DBus.Properties')
      const status = (await props.Get(PLAYER_IFACE, 'PlaybackStatus')).value
      if (status === 'Playing') return name
      fallback = fallback || name
    } catch {}
  }
  return fallback
}

function detach() {
  if (dbusConnection?.properties && onPropsChanged) {
    dbusConnection.properties.off('PropertiesChanged', onPropsChanged)
  }
  dbusConnection = null
  onPropsChanged = null
}

async function attach(name) {
  detach()
  const proxy = await bus.getProxyObject(name, '/org/mpris/MediaPlayer2')
  const player = proxy.getInterface(PLAYER_IFACE)
  const properties = proxy.getInterface('org.freedesktop.DBus.Properties')

  onPropsChanged = (iface) => {
    if (iface === PLAYER_IFACE) updateMediaInfo()
  }
  properties.on('PropertiesChanged', onPropsChanged)

  dbusConnection = { name, proxy, player, properties }
  console.log('Connected to player:', name)
  await updateMediaInfo()
}

async function refreshPlayer() {
  try {
    const name = await pickPlayer()
    if (name === dbusConnection?.name) return
    if (!name) {
      detach()
      mainWindow?.webContents.send('media-info-update', {
        title: 'Not Playing',
        artist: '',
        artUrl: ''
      })
      return
    }
    await attach(name)
  } catch (error) {
    console.error('refreshPlayer failed:', error)
  }
}

async function initializeDBus() {
  try {
    bus = dbus.sessionBus()
    await refreshPlayer()
    // Pick up players starting/stopping or switching (Spotify <-> Brave)
    setInterval(refreshPlayer, 3000)
  } catch (error) {
    console.error('Failed to initialize DBus:', error)
    mainWindow?.webContents.send('media-info-update', {
      title: 'Connection Error',
      artist: 'Check DBus connection',
      artUrl: ''
    })
  }
}

async function updateMediaInfo() {
  if (!dbusConnection?.properties) return // nothing connected yet, not an error
  try {
    const [metaV, statusV, posV] = await Promise.all([
      dbusConnection.properties.Get(PLAYER_IFACE, 'Metadata'),
      dbusConnection.properties.Get(PLAYER_IFACE, 'PlaybackStatus'),
      dbusConnection.properties.Get(PLAYER_IFACE, 'Position').catch(() => null)
    ])
    const metadata = metaV.value || {}
    const artist = unwrap(metadata['xesam:artist'])
    const rawArt = unwrap(metadata['mpris:artUrl']) || ''
    const lengthMicro = unwrap(metadata['mpris:length']) || 0
    const duration = lengthMicro ? Math.floor(Number(lengthMicro) / 1000000) : 0
    const posMicro = posV ? unwrap(posV) : 0
    const position = posMicro ? Math.floor(Number(posMicro) / 1000000) : 0

    mainWindow?.webContents.send('media-info-update', {
      title: unwrap(metadata['xesam:title']) || 'Unknown',
      artist: Array.isArray(artist) ? artist[0] : artist || 'Unknown Artist',
      artUrl: resolveArtUrl(rawArt),
      duration,
      position
    })
    mainWindow?.webContents.send('playback-status-update', statusV.value)
  } catch (error) {
    console.error('Failed to update media info:', error)
  }
}

// ---------- IPC ----------

ipcMain.on('media-control', async (event, action) => {
  console.log('Received media-control request:', action)
  if (!ALLOWED_ACTIONS.includes(action)) {
    console.error('Unsupported action (must be PlayPause/Next/Previous...):', action)
    return
  }
  try {
    if (dbusConnection?.player) {
      await dbusConnection.player[action]()
      setTimeout(updateMediaInfo, 500)
    }
  } catch (error) {
    console.error(`Failed to execute ${action}:`, error)
  }
})

ipcMain.on('media-seek', async (event, seconds) => {
  try {
    if (dbusConnection?.player) {
      const metaV = await dbusConnection.properties.Get(PLAYER_IFACE, 'Metadata')
      const trackId = unwrap(metaV.value?.['mpris:trackid']) || '/org/mpris/MediaPlayer2/CurrentTrack'
      const micro = Math.floor(Number(seconds) * 1000000)
      if (typeof dbusConnection.player.SetPosition === 'function') {
        await dbusConnection.player.SetPosition(trackId, BigInt(micro))
      }
      setTimeout(updateMediaInfo, 200)
    }
  } catch (error) {
    console.error('Failed to seek:', error)
  }
})

ipcMain.on('set-island-expanded', (event, isExpanded) => {
  // Ukuran window dibiarkan tetap (fixed) agar Linux GTK/Wayland tidak memunculkan glitch kotak hitam
})

ipcMain.on('toggle-visibility', () => {
  toggleVisibility()
})

ipcMain.on('get-media-info', async () => {
  await updateMediaInfo()
})

// ---------- Battery Monitoring ----------
let lastBatteryState = null
let batteryCheckTimer = null

function getBatteryInfo() {
  const base = '/sys/class/power_supply'
  if (!fs.existsSync(base)) return null
  try {
    const entries = fs.readdirSync(base)
    const batName = entries.find((e) => e.startsWith('BAT'))
    if (!batName) return null

    const batDir = path.join(base, batName)
    const capacityStr = fs.readFileSync(path.join(batDir, 'capacity'), 'utf8').trim()
    const statusStr = fs.readFileSync(path.join(batDir, 'status'), 'utf8').trim()
    const capacity = parseInt(capacityStr, 10) || 0

    let isPlugged = statusStr.toLowerCase() === 'charging' || statusStr.toLowerCase() === 'full'
    const acName = entries.find((e) => e.startsWith('AC') || e.startsWith('ADP'))
    if (acName) {
      try {
        const onlineStr = fs.readFileSync(path.join(base, acName, 'online'), 'utf8').trim()
        if (onlineStr === '1') isPlugged = true
      } catch {}
    }

    return {
      capacity,
      status: statusStr,
      isPlugged
    }
  } catch (err) {
    return null
  }
}

function checkBattery() {
  const info = getBatteryInfo()
  if (!info || !mainWindow || mainWindow.isDestroyed()) return

  if (!lastBatteryState) {
    lastBatteryState = info
    mainWindow.webContents.send('battery-update', info)
    return
  }

  // Cek jika status colokan charger berubah
  if (lastBatteryState.isPlugged !== info.isPlugged) {
    mainWindow.webContents.send('battery-alert', {
      type: info.isPlugged ? 'plugged' : 'unplugged',
      capacity: info.capacity,
      isPlugged: info.isPlugged
    })
  } else if (!info.isPlugged && info.capacity <= 20 && lastBatteryState.capacity > 20) {
    // Peringatan baterai lemah
    mainWindow.webContents.send('battery-alert', {
      type: 'low',
      capacity: info.capacity,
      isPlugged: info.isPlugged
    })
  }

  // Kirim update berkala jika ada perubahan kapasitas / status
  if (
    lastBatteryState.capacity !== info.capacity ||
    lastBatteryState.status !== info.status ||
    lastBatteryState.isPlugged !== info.isPlugged
  ) {
    mainWindow.webContents.send('battery-update', info)
  }

  lastBatteryState = info
}

function startBatteryMonitor() {
  checkBattery()
  batteryCheckTimer = setInterval(checkBattery, 2000)
}

ipcMain.on('get-battery-info', (event) => {
  const info = getBatteryInfo()
  if (info) {
    event.reply('battery-update', info)
  }
})

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  createWindow()
  initializeDBus()
  startBatteryMonitor()

  try {
    globalShortcut.register('Alt+D', () => {
      toggleVisibility()
    })
    console.log('Registered global shortcut Alt+D')
  } catch (err) {
    console.warn('Failed to register global shortcut Alt+D:', err)
  }
})

app.on('will-quit', () => {
  if (batteryCheckTimer) clearInterval(batteryCheckTimer)
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})