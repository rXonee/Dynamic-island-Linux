const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const { spawn, exec } = require('child_process')
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

    const trackTitle = unwrap(metadata['xesam:title']) || 'Unknown'
    const artistName = Array.isArray(artist) ? artist[0] : artist || 'Unknown Artist'

    mainWindow?.webContents.send('media-info-update', {
      title: trackTitle,
      artist: artistName,
      artUrl: resolveArtUrl(rawArt),
      duration,
      position
    })
    mainWindow?.webContents.send('playback-status-update', statusV.value)

    if (trackTitle !== 'Unknown' && trackTitle !== 'Not Playing') {
      fetchLyrics(trackTitle, artistName, duration)
    }
  } catch (error) {
    console.error('Failed to update media info:', error)
  }
}

// ---------- Synced Lyrics (LRCLIB) ----------
let lastLyricsKey = ''

function cleanSongTitle(str) {
  if (!str) return ''
  return str
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/ - .*/g, '')
    .trim()
}

function parseLRC(lrcText) {
  if (!lrcText) return []
  const lines = lrcText.split('\n')
  const result = []
  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/)
    if (match) {
      const min = parseInt(match[1], 10)
      const sec = parseInt(match[2], 10)
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
      const time = min * 60 + sec + ms / 1000
      const text = match[4].trim()
      if (text) {
        result.push({ time, text })
      }
    }
  }
  return result.sort((a, b) => a.time - b.time)
}

async function fetchLyrics(rawTitle, rawArtist, duration) {
  const trackKey = `${rawTitle}-${rawArtist}`
  if (trackKey === lastLyricsKey || !rawTitle || rawTitle === 'Unknown' || rawTitle === 'Not Playing') {
    return
  }
  lastLyricsKey = trackKey

  try {
    const cleanT = cleanSongTitle(rawTitle) || rawTitle
    const cleanA = cleanSongTitle(rawArtist) || rawArtist

    let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanT)}&artist_name=${encodeURIComponent(cleanA)}`
    if (duration > 0) url += `&duration=${duration}`

    let res = await fetch(url)
    let data = null
    if (res.ok) {
      data = await res.json()
    } else {
      const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanT} ${cleanA}`)}`)
      if (searchRes.ok) {
        const results = await searchRes.json()
        if (Array.isArray(results) && results.length > 0) {
          data = results.find((r) => r.syncedLyrics) || results[0]
        }
      }
    }

    if (data && (data.syncedLyrics || data.plainLyrics)) {
      let lines = parseLRC(data.syncedLyrics)
      if (lines.length === 0 && data.plainLyrics) {
        lines = data.plainLyrics
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((text) => ({ time: -1, text }))
      }
      mainWindow?.webContents.send('lyrics-update', {
        title: rawTitle,
        artist: rawArtist,
        lines,
        plainLyrics: data.plainLyrics || '',
        notFound: lines.length === 0
      })
    } else {
      mainWindow?.webContents.send('lyrics-update', {
        title: rawTitle,
        artist: rawArtist,
        lines: [],
        plainLyrics: '',
        notFound: true
      })
    }
  } catch (err) {
    console.warn('Failed to fetch lyrics:', err.message)
    mainWindow?.webContents.send('lyrics-update', {
      title: rawTitle,
      artist: rawArtist,
      lines: [],
      plainLyrics: '',
      notFound: true
    })
  }
}

ipcMain.on('get-lyrics', (event, { title, artist, duration }) => {
  lastLyricsKey = ''
  fetchLyrics(title, artist, duration)
})

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

// ---------- Volume Monitoring (PipeWire / PulseAudio) ----------
let lastVolume = null
let lastMuted = false
let pactlSubProcess = null

function fetchVolume() {
  exec('pactl get-sink-volume @DEFAULT_SINK@ && pactl get-sink-mute @DEFAULT_SINK@', (err, stdout) => {
    if (err || !stdout) return
    const volMatch = stdout.match(/(\d+)%/)
    const muteMatch = stdout.match(/Mute:\s*(yes|no)/i)
    if (!volMatch) return

    const volume = parseInt(volMatch[1], 10)
    const isMuted = muteMatch ? muteMatch[1].toLowerCase() === 'yes' : false

    if (lastVolume === null) {
      lastVolume = volume
      lastMuted = isMuted
      return
    }

    if (lastVolume !== volume || lastMuted !== isMuted) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('volume-alert', { volume, isMuted })
      }
      lastVolume = volume
      lastMuted = isMuted
    }
  })
}

function startVolumeMonitor() {
  fetchVolume()
  try {
    pactlSubProcess = spawn('pactl', ['subscribe'])
    pactlSubProcess.stdout.on('data', (buf) => {
      const text = buf.toString()
      if (text.includes('on sink ') || text.includes('on server')) {
        fetchVolume()
      }
    })
    pactlSubProcess.on('error', (err) => {
      console.warn('pactl subscribe error:', err.message)
    })
  } catch (e) {
    console.warn('Failed to start pactl subscribe:', e)
  }
}

// ---------- Brightness Monitoring (KDE DBus Signal + Fast Sysfs Fallback) ----------
let lastBrightness = null
let brightnessCheckTimer = null
let kdeBrightnessIface = null

async function initKdeBrightness() {
  try {
    if (!bus) return
    const proxy = await bus.getProxyObject(
      'org.kde.Solid.PowerManagement',
      '/org/kde/Solid/PowerManagement/Actions/BrightnessControl'
    )
    kdeBrightnessIface = proxy.getInterface('org.kde.Solid.PowerManagement.Actions.BrightnessControl')

    let max = 10000
    try {
      max = await kdeBrightnessIface.brightnessMax()
    } catch {}

    kdeBrightnessIface.on('brightnessChanged', (val) => {
      const cur = Math.round((Number(val) / Number(max)) * 100)
      if (lastBrightness !== cur) {
        lastBrightness = cur
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('brightness-alert', { brightness: cur })
        }
      }
    })
    console.log('KDE BrightnessControl DBus signal connected')
  } catch (err) {
    console.warn('KDE Brightness DBus not available:', err.message)
  }
}

function getBrightnessInfo() {
  const base = '/sys/class/backlight'
  if (!fs.existsSync(base)) return null
  try {
    const entries = fs.readdirSync(base)
    if (!entries.length) return null
    const blDir = path.join(base, entries[0])
    const cur = parseInt(fs.readFileSync(path.join(blDir, 'brightness'), 'utf8').trim(), 10)
    const max = parseInt(fs.readFileSync(path.join(blDir, 'max_brightness'), 'utf8').trim(), 10)
    if (isNaN(cur) || isNaN(max) || max <= 0) return null
    return Math.round((cur / max) * 100)
  } catch {
    return null
  }
}

function checkBrightness() {
  const cur = getBrightnessInfo()
  if (cur === null) return
  if (lastBrightness === null) {
    lastBrightness = cur
    return
  }
  if (lastBrightness !== cur) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('brightness-alert', { brightness: cur })
    }
    lastBrightness = cur
  }
}

function startBrightnessMonitor() {
  checkBrightness()
  initKdeBrightness()
  brightnessCheckTimer = setInterval(checkBrightness, 80)
}

// ---------- System Notification Monitor (DBus Monitor) ----------
let notificationMonitorProcess = null
let lastNotificationHash = ''
let lastNotificationTime = 0

function startNotificationMonitor() {
  try {
    if (notificationMonitorProcess) {
      try { notificationMonitorProcess.kill() } catch {}
      notificationMonitorProcess = null
    }

    notificationMonitorProcess = spawn('dbus-monitor', [
      "interface='org.freedesktop.Notifications',member='Notify'"
    ])

    let buffer = ''

    notificationMonitorProcess.stdout.on('data', (data) => {
      buffer += data.toString()

      while (true) {
        const startIdx = buffer.indexOf('member=Notify')
        if (startIdx === -1) {
          if (buffer.length > 8192) buffer = buffer.slice(-2048)
          break
        }

        const nextMsgIdx = buffer.indexOf('\nmethod call', startIdx + 13)
        const nextSignalIdx = buffer.indexOf('\nsignal', startIdx + 13)
        const int32Idx = buffer.indexOf('\n   int32', startIdx)

        let endIdx = -1
        if (int32Idx !== -1) {
          endIdx = int32Idx + 12
        } else if (nextMsgIdx !== -1) {
          endIdx = nextMsgIdx
        } else if (nextSignalIdx !== -1) {
          endIdx = nextSignalIdx
        }

        if (endIdx === -1) {
          if (buffer.length - startIdx > 12000) {
            buffer = buffer.slice(startIdx + 13)
          }
          break
        }

        const fullBlock = buffer.slice(startIdx, endIdx)
        buffer = buffer.slice(endIdx)

        // Only parse the header part before array [ for strings
        const arrayIdx = fullBlock.indexOf('array [')
        const headerBlock = arrayIdx !== -1 ? fullBlock.slice(0, arrayIdx) : fullBlock

        const strings = []
        let idx = 0
        while (true) {
          const sPos = headerBlock.indexOf('string "', idx)
          if (sPos === -1) break
          const contentStart = sPos + 8
          let endPos = contentStart
          while (endPos < headerBlock.length) {
            if (headerBlock[endPos] === '"' && headerBlock[endPos - 1] !== '\\') {
              const after = headerBlock.slice(endPos + 1, endPos + 20)
              if (/^\s*(\n|$)/.test(after)) break
            }
            endPos++
          }
          strings.push(headerBlock.slice(contentStart, endPos))
          idx = endPos + 1
        }

        let appName = (strings[0] || 'Aplikasi').trim()
        const icon = (strings[1] || '').trim()
        const summary = (strings[2] || '').trim()
        const body = (strings[3] || '').trim()

        if (!summary && !body) continue

        // Auto-detect web apps (WhatsApp Web, Telegram Web, Discord Web) from browsers
        const isBrowser = /^(brave|chrome|google-chrome|chromium|firefox|opera|vivaldi|edge)/i.test(appName)
        if (isBrowser) {
          const lowerBlock = fullBlock.toLowerCase()
          if (lowerBlock.includes('web.whatsapp.com') || lowerBlock.includes('whatsapp')) {
            appName = 'WhatsApp'
          } else if (lowerBlock.includes('telegram.org') || lowerBlock.includes('web.telegram.org') || lowerBlock.includes('webk.telegram.org') || lowerBlock.includes('webz.telegram.org') || lowerBlock.includes('telegram')) {
            appName = 'Telegram'
          } else if (lowerBlock.includes('discord.com') || lowerBlock.includes('discord')) {
            appName = 'Discord'
          }
        }

        // Clean & normalize appName (e.g. telegram-desktop, org.telegram.desktop -> Telegram)
        const lowerApp = appName.toLowerCase()
        if (lowerApp.includes('telegram')) {
          appName = 'Telegram'
        } else if (lowerApp.includes('whatsapp')) {
          appName = 'WhatsApp'
        } else if (lowerApp.includes('discord')) {
          appName = 'Discord'
        } else if (lowerApp.includes('spotify')) {
          appName = 'Spotify'
        }

        const hash = `${appName}:${summary}:${body}`
        const now = Date.now()
        if (hash === lastNotificationHash && now - lastNotificationTime < 800) {
          continue
        }
        lastNotificationHash = hash
        lastNotificationTime = now

        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('Notification intercepted:', { appName, summary, body })
          mainWindow.webContents.send('notification-alert', {
            id: String(now),
            appName,
            icon,
            summary,
            body
          })
        }
      }
    })

    notificationMonitorProcess.on('error', (err) => {
      console.warn('Notification monitor error:', err.message)
    })

    notificationMonitorProcess.on('close', () => {
      notificationMonitorProcess = null
      setTimeout(() => {
        if (!app.isQuitting) startNotificationMonitor()
      }, 3000)
    })

    console.log('Started system notification monitor')
  } catch (err) {
    console.warn('Failed to start notification monitor:', err.message)
  }
}

// ---------- App lifecycle ----------

app.whenReady().then(() => {
  createWindow()
  initializeDBus()
  startBatteryMonitor()
  startVolumeMonitor()
  startBrightnessMonitor()
  startNotificationMonitor()

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
  if (brightnessCheckTimer) clearInterval(brightnessCheckTimer)
  if (pactlSubProcess) {
    try { pactlSubProcess.kill() } catch {}
  }
  if (notificationMonitorProcess) {
    try { notificationMonitorProcess.kill() } catch {}
  }
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})