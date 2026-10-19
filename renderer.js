const dbus = require('dbus-next');

// DOM elements
const island = document.getElementById('island');
const minTitle = document.getElementById('min-title');
const minArt = document.getElementById('min-art');
const minVis = document.getElementById('min-vis');
const albumArt = document.getElementById('album-art');
const titleElem = document.getElementById('title');
const artistElem = document.getElementById('artist');
const mainVis = document.getElementById('main-vis');
const progressFill = document.getElementById('progress-fill');
const timePos = document.getElementById('time-pos');
const timeRem = document.getElementById('time-rem');
const playIcon = document.getElementById('play-icon');
const starBtn = document.getElementById('star-btn');
const airplayBtn = document.getElementById('airplay-btn');

let activePlayerName = null;
let isPinned = false;
let isStarred = false;
let currentPosition = 0;
let currentDuration = 0;
let isPlaying = false;

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function getActivePlayer() {
    try {
        const bus = dbus.sessionBus();
        const obj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
        const iface = obj.getInterface('org.freedesktop.DBus');
        const names = await iface.ListNames();
        const mprisServices = names.filter(n => n.startsWith('org.mpris.MediaPlayer2.') && !n.endsWith('.playerctld'));

        for (const name of mprisServices) {
            try {
                const proxy = await bus.getProxyObject(name, '/org/mpris/MediaPlayer2');
                const props = proxy.getInterface('org.freedesktop.DBus.Properties');
                const statusV = await props.Get('org.mpris.MediaPlayer2.Player', 'PlaybackStatus');
                if (statusV.value === 'Playing') return name;
            } catch {}
        }
        return mprisServices[0] || null;
    } catch (error) {
        return null;
    }
}

async function updateMediaInfo() {
    try {
        const player = await getActivePlayer();
        activePlayerName = player;

        if (!player) {
            minTitle.textContent = 'No Media Playing';
            titleElem.textContent = 'No Media Playing';
            artistElem.textContent = 'Unknown Artist';
            albumArt.style.backgroundImage = '';
            minArt.style.backgroundImage = '';
            minVis.classList.remove('playing');
            mainVis.classList.remove('playing');
            progressFill.style.width = '0%';
            timePos.textContent = '0:00';
            timeRem.textContent = '--:--';
            return;
        }

        const bus = dbus.sessionBus();
        const obj = await bus.getProxyObject(player, '/org/mpris/MediaPlayer2');
        const props = obj.getInterface('org.freedesktop.DBus.Properties');

        const [metaV, statusV, posV] = await Promise.all([
            props.Get('org.mpris.MediaPlayer2.Player', 'Metadata'),
            props.Get('org.mpris.MediaPlayer2.Player', 'PlaybackStatus'),
            props.Get('org.mpris.MediaPlayer2.Player', 'Position').catch(() => null)
        ]);

        const metadata = metaV.value || {};
        const title = metadata['xesam:title']?.value || metadata['xesam:title'] || 'Unknown';
        const artistRaw = metadata['xesam:artist']?.value || metadata['xesam:artist'];
        const artist = Array.isArray(artistRaw) ? artistRaw[0] : (artistRaw || 'Unknown Artist');
        const artUrl = metadata['mpris:artUrl']?.value || metadata['mpris:artUrl'] || '';
        const lengthMicro = metadata['mpris:length']?.value || metadata['mpris:length'] || 0;

        currentDuration = lengthMicro ? Math.floor(Number(lengthMicro) / 1000000) : 0;
        const posMicro = posV ? (posV.value || posV) : 0;
        currentPosition = posMicro ? Math.floor(Number(posMicro) / 1000000) : 0;
        isPlaying = (statusV.value === 'Playing');

        minTitle.textContent = title;
        titleElem.textContent = title;
        artistElem.textContent = artist;

        if (artUrl) {
            albumArt.style.backgroundImage = `url("${artUrl}")`;
            minArt.style.backgroundImage = `url("${artUrl}")`;
        } else {
            albumArt.style.backgroundImage = '';
            minArt.style.backgroundImage = '';
        }

        // Equalizer animations
        if (isPlaying) {
            minVis.classList.add('playing');
            mainVis.classList.add('playing');
            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        } else {
            minVis.classList.remove('playing');
            mainVis.classList.remove('playing');
            playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        }

        // Progress
        if (currentDuration > 0) {
            const pct = Math.min(100, Math.max(0, (currentPosition / currentDuration) * 100));
            progressFill.style.width = `${pct}%`;
            timePos.textContent = formatTime(currentPosition);
            timeRem.textContent = `-${formatTime(Math.max(0, currentDuration - currentPosition))}`;
        } else {
            progressFill.style.width = '0%';
            timePos.textContent = '0:00';
            timeRem.textContent = '--:--';
        }

    } catch (error) {
        console.error('Error updating media info:', error);
    }
}

// Media controls
async function handleMediaControl(action) {
    if (!activePlayerName) return;
    try {
        const bus = dbus.sessionBus();
        const player = await bus.getProxyObject(activePlayerName, '/org/mpris/MediaPlayer2');
        const iface = player.getInterface('org.mpris.MediaPlayer2.Player');
        await iface[action]();
        setTimeout(updateMediaInfo, 300);
    } catch (error) {
        console.error(`Error executing ${action}:`, error);
    }
}

// Event listeners
document.getElementById('prev').addEventListener('click', (e) => {
    e.stopPropagation();
    handleMediaControl('Previous');
});

document.getElementById('play').addEventListener('click', (e) => {
    e.stopPropagation();
    handleMediaControl('PlayPause');
});

document.getElementById('next').addEventListener('click', (e) => {
    e.stopPropagation();
    handleMediaControl('Next');
});

starBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isStarred = !isStarred;
    const poly = starBtn.querySelector('polygon');
    if (poly) {
        poly.style.fill = isStarred ? '#facc15' : 'none';
        poly.style.stroke = isStarred ? '#facc15' : 'currentColor';
    }
});

airplayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    island.classList.toggle('expanded', isPinned);
    airplayBtn.style.color = isPinned ? '#38bdf8' : 'rgba(255, 255, 255, 0.7)';
});

// Click on progress bar to seek
document.getElementById('progress-bg').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activePlayerName || currentDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSeconds = Math.floor(percent * currentDuration);
    try {
        const bus = dbus.sessionBus();
        const proxy = await bus.getProxyObject(activePlayerName, '/org/mpris/MediaPlayer2');
        const player = proxy.getInterface('org.mpris.MediaPlayer2.Player');
        const props = proxy.getInterface('org.freedesktop.DBus.Properties');
        const metaV = await props.Get('org.mpris.MediaPlayer2.Player', 'Metadata');
        const trackId = metaV.value?.['mpris:trackid']?.value || metaV.value?.['mpris:trackid'] || '/';
        if (typeof player.SetPosition === 'function') {
            await player.SetPosition(trackId, BigInt(targetSeconds * 1000000));
        }
        setTimeout(updateMediaInfo, 200);
    } catch {}
});

// Periodic update
setInterval(updateMediaInfo, 1500);
updateMediaInfo();
