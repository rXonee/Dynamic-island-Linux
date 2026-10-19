import { useState, useEffect } from 'react'

export interface ProcessedMediaInfo {
  title: string
  artist: string
  artUrl: string
  duration: number
  position: number
}

// Accepts plain values or DBus-style { signature, value } wrappers
const unwrap = (v: any) =>
  v && typeof v === 'object' && !Array.isArray(v) && 'value' in v ? v.value : v

const firstString = (v: any): string => {
  const u = unwrap(v)
  if (Array.isArray(u)) return u[0] ?? ''
  return typeof u === 'string' ? u : ''
}

export const useMediaPlayer = () => {
  const [currentTrack, setCurrentTrack] = useState<ProcessedMediaInfo | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) {
      setError('Electron not found in window object')
      return
    }

    const { ipcRenderer } = electron

    const mediaInfoHandler = (data: any) => {
      if (!data) return
      const trackDuration = typeof data.duration === 'number' ? data.duration : 0
      const trackPos = typeof data.position === 'number' ? data.position : 0

      setCurrentTrack({
        title: firstString(data.title) || 'Not Playing',
        artist: firstString(data.artist),
        artUrl: firstString(data.artUrl),
        duration: trackDuration,
        position: trackPos
      })
      setDuration(trackDuration)
      setPosition(trackPos)
    }

    const playbackStatusHandler = (status: any) => {
      const s = unwrap(status)
      if (typeof s === 'string') setIsPlaying(s === 'Playing')
    }

    const offInfo = ipcRenderer.on('media-info-update', mediaInfoHandler)
    const offStatus = ipcRenderer.on('playback-status-update', playbackStatusHandler)

    ipcRenderer.send('get-media-info')
    const pollInterval = setInterval(() => ipcRenderer.send('get-media-info'), 2000)

    return () => {
      if (typeof offInfo === 'function') offInfo()
      if (typeof offStatus === 'function') offStatus()
      clearInterval(pollInterval)
    }
  }, [])

  // Local ticker to smoothly advance playback timer when playing
  useEffect(() => {
    if (!isPlaying || duration <= 0) return

    const timer = setInterval(() => {
      setPosition((prev) => {
        if (prev >= duration) return duration
        return prev + 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isPlaying, duration])

  const send = (action: string, data?: any) => {
    const electron = (window as any).electron
    electron?.ipcRenderer?.send(action, data)
  }

  const controls = {
    playPause: () => send('media-control', 'PlayPause'),
    next: () => send('media-control', 'Next'),
    previous: () => send('media-control', 'Previous'),
    seek: (seconds: number) => {
      setPosition(seconds)
      send('media-seek', seconds)
    }
  }

  return { currentTrack, isPlaying, controls, error, position, duration }
}
