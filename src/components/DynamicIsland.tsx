import React, { useState, useEffect, useRef } from 'react'
import { useMediaPlayer } from '../hooks/useMediaPlayer'

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

interface BatteryInfo {
  capacity: number
  status: string
  isPlugged: boolean
}

interface BatteryAlert {
  type: 'plugged' | 'unplugged' | 'low'
  capacity: number
  isPlugged: boolean
}

interface VolumeAlert {
  volume: number
  isMuted: boolean
}

interface BrightnessAlert {
  brightness: number
}

export const DynamicIsland = () => {
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [battery, setBattery] = useState<BatteryInfo | null>(null)
  const [batteryAlert, setBatteryAlert] = useState<BatteryAlert | null>(null)
  const [volumeAlert, setVolumeAlert] = useState<VolumeAlert | null>(null)
  const [brightnessAlert, setBrightnessAlert] = useState<BrightnessAlert | null>(null)

  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const { currentTrack, isPlaying, controls, position, duration } = useMediaPlayer()

  const isExpanded = isHovered || isPinned
  const hasTrack = Boolean(currentTrack?.title && currentTrack.title !== 'Not Playing' && currentTrack.title !== 'Unknown')

  // Realtime Clock timer
  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Battery, Volume & Brightness listeners
  useEffect(() => {
    const electron = (window as any).electron
    if (!electron?.ipcRenderer) return

    const unsubscribeBatteryUpdate = electron.ipcRenderer.on('battery-update', (data: BatteryInfo) => {
      setBattery(data)
    })

    const unsubscribeBatteryAlert = electron.ipcRenderer.on('battery-alert', (alert: BatteryAlert) => {
      setBatteryAlert(alert)
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
      alertTimeoutRef.current = setTimeout(() => {
        setBatteryAlert(null)
      }, 3500)
    })

    const unsubscribeVolume = electron.ipcRenderer.on('volume-alert', (data: VolumeAlert) => {
      setBrightnessAlert(null)
      setVolumeAlert(data)
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current)
      hudTimeoutRef.current = setTimeout(() => {
        setVolumeAlert(null)
      }, 1800)
    })

    const unsubscribeBrightness = electron.ipcRenderer.on('brightness-alert', (data: BrightnessAlert) => {
      setVolumeAlert(null)
      setBrightnessAlert(data)
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current)
      hudTimeoutRef.current = setTimeout(() => {
        setBrightnessAlert(null)
      }, 1800)
    })

    electron.ipcRenderer.send('get-battery-info')

    return () => {
      if (unsubscribeBatteryUpdate) unsubscribeBatteryUpdate()
      if (unsubscribeBatteryAlert) unsubscribeBatteryAlert()
      if (unsubscribeVolume) unsubscribeVolume()
      if (unsubscribeBrightness) unsubscribeBrightness()
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current)
    }
  }, [])

  // Reset img error when track changes
  useEffect(() => {
    setImgError(false)
  }, [currentTrack?.artUrl, currentTrack?.title])

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    controls.seek(Math.floor(percent * duration))
  }

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0
  const remainingTime = duration > 0 ? Math.max(0, duration - position) : 0

  // Date & Time formatting (Indonesian)
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const fullDayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  const fullMonthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

  const hours = currentTime ? String(currentTime.getHours()).padStart(2, '0') : '--'
  const minutes = currentTime ? String(currentTime.getMinutes()).padStart(2, '0') : '--'
  const seconds = currentTime ? String(currentTime.getSeconds()).padStart(2, '0') : '--'
  const timeString = `${hours}:${minutes}`
  const dateString = currentTime ? `${currentTime.getDate()} ${monthNames[currentTime.getMonth()]}` : ''
  const dayName = currentTime ? dayNames[currentTime.getDay()] : ''
  const fullDayName = currentTime ? fullDayNames[currentTime.getDay()] : ''
  const fullDateString = currentTime ? `${currentTime.getDate()} ${fullMonthNames[currentTime.getMonth()]} ${currentTime.getFullYear()}` : ''

  // Minimal battery icon with dynamic fill level and charging badge
  const renderBatteryIcon = (capacity: number, isPlugged: boolean) => {
    const isLow = capacity <= 20
    const color = isPlugged ? '#10b981' : isLow ? '#f87171' : '#ffffff'

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {isPlugged && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#10b981" style={{ flexShrink: 0 }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        )}
        <div
          style={{
            width: '18px',
            height: '9px',
            borderRadius: '2.5px',
            border: `1.2px solid ${color}`,
            padding: '1px',
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            flexShrink: 0
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, capacity))}%`,
              backgroundColor: color,
              borderRadius: '1px',
              transition: 'width 0.3s ease'
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-2.5px',
              top: '2px',
              width: '1.5px',
              height: '3px',
              backgroundColor: color,
              borderRadius: '0 1px 1px 0'
            }}
          />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
          {capacity}%
        </span>
      </div>
    )
  }

  // Strictly sized Cover Art with inline dimensions to prevent any layout blowout
  const renderCoverArt = (size: number, borderRadius: number, iconSize: number) => {
    if (currentTrack?.artUrl && !imgError) {
      return (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            minWidth: `${size}px`,
            minHeight: `${size}px`,
            maxWidth: `${size}px`,
            maxHeight: `${size}px`,
            borderRadius: `${borderRadius}px`,
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            border: 'none',
            outline: 'none'
          }}
        >
          <img
            src={currentTrack.artUrl}
            alt={currentTrack.title || 'Cover'}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              userSelect: 'none',
              pointerEvents: 'none',
              border: 'none',
              outline: 'none'
            }}
          />
        </div>
      )
    }

    // Modern fallback gradient
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          maxWidth: `${size}px`,
          maxHeight: `${size}px`,
          borderRadius: `${borderRadius}px`,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          border: 'none',
          outline: 'none'
        }}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.95 }}
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="white" />
          <circle cx="18" cy="16" r="3" fill="white" />
        </svg>
      </div>
    )
  }

  // Cyan audio visualizer bars
  const renderVisualizer = (isMini = false) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2.5px',
        height: isMini ? '14px' : '20px',
        flexShrink: 0
      }}
    >
      <span
        className={isPlaying ? 'anim-bar-1' : ''}
        style={{
          width: '2.5px',
          height: isPlaying ? undefined : '4px',
          backgroundColor: '#38bdf8',
          borderRadius: '9999px',
          opacity: isPlaying ? 1 : 0.4
        }}
      />
      <span
        className={isPlaying ? 'anim-bar-2' : ''}
        style={{
          width: '2.5px',
          height: isPlaying ? undefined : '8px',
          backgroundColor: '#38bdf8',
          borderRadius: '9999px',
          opacity: isPlaying ? 1 : 0.4
        }}
      />
      <span
        className={isPlaying ? 'anim-bar-3' : ''}
        style={{
          width: '2.5px',
          height: isPlaying ? undefined : '5px',
          backgroundColor: '#38bdf8',
          borderRadius: '9999px',
          opacity: isPlaying ? 1 : 0.4
        }}
      />
      <span
        className={isPlaying ? 'anim-bar-4' : ''}
        style={{
          width: '2.5px',
          height: isPlaying ? undefined : '10px',
          backgroundColor: '#38bdf8',
          borderRadius: '9999px',
          opacity: isPlaying ? 1 : 0.4
        }}
      />
      <span
        className={isPlaying ? 'anim-bar-5' : ''}
        style={{
          width: '2.5px',
          height: isPlaying ? undefined : '6px',
          backgroundColor: '#38bdf8',
          borderRadius: '9999px',
          opacity: isPlaying ? 1 : 0.4
        }}
      />
    </div>
  )

  const isAlerting = Boolean(batteryAlert)
  const isHudActive = Boolean(volumeAlert || brightnessAlert)

  return (
    <div
      id="island"
      style={{
        margin: '8px auto 0 auto',
        width: isExpanded ? '380px' : isHudActive ? '280px' : isAlerting ? '280px' : hasTrack ? '220px' : '255px',
        height: isExpanded ? '165px' : (isHudActive || isAlerting) ? '44px' : '36px',
        backgroundColor: '#000000',
        borderRadius: isExpanded ? '32px' : (isHudActive || isAlerting) ? '22px' : '20px',
        padding: isExpanded ? '15px 18px 13px 18px' : (isHudActive || isAlerting) ? '8px 14px' : '6px 14px',
        border: isAlerting
          ? batteryAlert?.type === 'plugged'
            ? '1px solid rgba(16, 185, 129, 0.4)'
            : batteryAlert?.type === 'low'
            ? '1px solid rgba(239, 68, 68, 0.4)'
            : '1px solid rgba(255, 255, 255, 0.2)'
          : isHudActive
          ? volumeAlert?.isMuted
            ? '1px solid rgba(239, 68, 68, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.22)'
          : '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: isExpanded
          ? '0 12px 28px -4px rgba(0, 0, 0, 0.45), 0 4px 10px -2px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
          : isAlerting && batteryAlert?.type === 'plugged'
          ? '0 4px 16px -2px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
          : '0 4px 12px -2px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        transition:
          'width 0.38s cubic-bezier(0.16, 1, 0.3, 1), height 0.38s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.38s cubic-bezier(0.16, 1, 0.3, 1), padding 0.38s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease, border-color 0.3s ease',
        cursor: 'default',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#ffffff',
        userSelect: 'none',
        boxSizing: 'border-box'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        const electron = (window as any).electron
        electron?.ipcRenderer?.send('toggle-visibility')
      }}
      title="Alt+D atau Klik Kanan untuk Sembunyikan / Munculkan"
    >
      {/* ================= HUD ALERT (Volume / Brightness Slider) ================= */}
      {isHudActive && !isExpanded ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          {/* Left Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {volumeAlert ? (
              volumeAlert.isMuted || volumeAlert.volume === 0 ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : volumeAlert.volume < 50 ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )
            ) : (
              /* Sun / Brightness Icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </div>

          {/* Center Capsule Slider */}
          <div
            style={{
              width: '145px',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '9999px',
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${volumeAlert ? (volumeAlert.isMuted ? 0 : volumeAlert.volume) : (brightnessAlert?.brightness ?? 0)}%`,
                backgroundColor: volumeAlert?.isMuted ? '#f87171' : '#ffffff',
                borderRadius: '9999px',
                transition: 'width 0.12s linear'
              }}
            />
          </div>

          {/* Right Value Text */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: volumeAlert?.isMuted ? '#f87171' : '#ffffff',
              fontVariantNumeric: 'tabular-nums',
              minWidth: '34px',
              textAlign: 'right',
              flexShrink: 0
            }}
          >
            {volumeAlert ? (volumeAlert.isMuted ? 'Mute' : `${volumeAlert.volume}%`) : `${brightnessAlert?.brightness ?? 0}%`}
          </span>
        </div>
      ) : isAlerting && !isExpanded ? (
        /* ================= BATTERY ALERT BANNER ================= */
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor:
                  batteryAlert?.type === 'plugged'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : batteryAlert?.type === 'low'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {batteryAlert?.type === 'plugged' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#10b981">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              ) : batteryAlert?.type === 'low' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="16" height="10" rx="2" ry="2" />
                  <line x1="22" y1="11" x2="22" y2="13" />
                </svg>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color:
                    batteryAlert?.type === 'plugged'
                      ? '#10b981'
                      : batteryAlert?.type === 'low'
                      ? '#ef4444'
                      : '#ffffff',
                  lineHeight: '1.2'
                }}
              >
                {batteryAlert?.type === 'plugged'
                  ? 'Mengisi Daya'
                  : batteryAlert?.type === 'low'
                  ? 'Baterai Lemah!'
                  : 'Charger Dilepas'}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.2' }}>
                {batteryAlert?.capacity}% tersisa
              </span>
            </div>
          </div>
          {renderBatteryIcon(batteryAlert?.capacity ?? 80, batteryAlert?.isPlugged ?? false)}
        </div>
      ) : (
        /* ================= COLLAPSED / KECIL VIEW ================= */
        <div
          style={{
            width: '100%',
            height: '100%',
            display: isExpanded ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: isExpanded ? 0 : 1,
            transition: 'opacity 0.2s ease-out'
          }}
        >
          {hasTrack ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {renderCoverArt(22, 6, 11)}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.95)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '120px',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {currentTrack?.title || 'Playing'}
                </span>
              </div>
              {renderVisualizer(true)}
            </>
          ) : (
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.85)', letterSpacing: '-0.01em' }}>
                {dayName ? `${dayName}, ${dateString}` : 'Memuat...'}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>
                {timeString}
              </span>
              {renderBatteryIcon(battery?.capacity ?? 80, battery?.isPlugged ?? true)}
            </div>
          )}
        </div>
      )}

      {/* ================= EXPANDED / MEMBESAR VIEW ================= */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: isExpanded ? 'flex' : 'none',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: isExpanded ? 1 : 0,
          transition: 'opacity 0.2s ease-out'
        }}
      >
        {hasTrack ? (
          <>
            {/* ROW 1: Cover + Title/Artist + Equalizer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                {/* 52x52 Album Cover */}
                {renderCoverArt(52, 14, 24)}

                {/* Title & Artist */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      color: '#ffffff',
                      fontSize: '15px',
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      lineHeight: '1.2',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '200px'
                    }}
                  >
                    {currentTrack?.title || 'No Media Playing'}
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0 0',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: '13px',
                      fontWeight: 400,
                      lineHeight: '1.2',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '200px'
                    }}
                  >
                    {currentTrack?.artist || 'Unknown Artist'}
                  </p>
                </div>
              </div>

              {/* Cyan Soundwave Visualizer on Right */}
              <div style={{ paddingLeft: '4px', flexShrink: 0 }}>
                {renderVisualizer(false)}
              </div>
            </div>

            {/* ROW 2: Scrubber Bar + Timestamps */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {/* Scrubber progress bar */}
              <div
                ref={progressRef}
                onClick={handleSeekClick}
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    backgroundColor: '#ffffff',
                    borderRadius: '9999px',
                    transition: 'width 0.15s linear'
                  }}
                />
              </div>

              {/* Timestamps */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1
                }}
              >
                <span>{formatTime(position)}</span>
                <span>{duration > 0 ? `-${formatTime(remainingTime)}` : '--:--'}</span>
              </div>
            </div>

            {/* ROW 3: Star + Controls (Prev, Play/Pause, Next) + AirPlay */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
              {/* Star / Favorite Button */}
              <button
                type="button"
                aria-label="Favorite"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsStarred(!isStarred)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  margin: '0 0 0 -4px',
                  cursor: 'pointer',
                  color: isStarred ? '#facc15' : 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none'
                }}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill={isStarred ? '#facc15' : 'none'}
                  stroke={isStarred ? '#facc15' : 'currentColor'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>

              {/* Center Playback Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                {/* Previous Track */}
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={(e) => {
                    e.stopPropagation()
                    controls.previous()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 6L3 12l8 6V6zm9 0l-8 6 8 6V6z" />
                  </svg>
                </button>

                {/* Play / Pause Primary Button */}
                <button
                  type="button"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  onClick={(e) => {
                    e.stopPropagation()
                    controls.playPause()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  {isPlaying ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Next Track */}
                <button
                  type="button"
                  aria-label="Next"
                  onClick={(e) => {
                    e.stopPropagation()
                    controls.next()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 6l8 6-8 6V6zm9 0l8 6-8 6V6z" />
                  </svg>
                </button>
              </div>

              {/* AirPlay / Output Button */}
              <button
                type="button"
                aria-label="Audio Output"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsPinned(!isPinned)
                }}
                title={isPinned ? 'Unpin' : 'Pin Open'}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  margin: '0 -4px 0 0',
                  cursor: 'pointer',
                  color: isPinned ? '#38bdf8' : 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none'
                }}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                  <polygon points="12 15 17 21 7 21 12 15" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Widget Jam, Kalender, & Status Baterai saat tidak ada media diputar */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.95)' }}>
                  {fullDayName}, {fullDateString}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)' }}>
                  Standby
                </span>
              </div>
            </div>

            {/* Jam Digital Besar */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px', margin: '4px 0' }}>
              <span style={{ fontSize: '42px', fontWeight: 700, letterSpacing: '-0.03em', color: '#ffffff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {timeString}
              </span>
              <span style={{ fontSize: '20px', fontWeight: 500, color: '#38bdf8', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                :{seconds}
              </span>
            </div>

            {/* Bottom Row: Status Baterai & Pin */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {renderBatteryIcon(battery?.capacity ?? 80, battery?.isPlugged ?? true)}
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  {battery?.isPlugged ? '• Mengisi Daya' : '• Daya Baterai'}
                </span>
              </div>
              <button
                type="button"
                aria-label="Toggle Pin"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsPinned(!isPinned)
                }}
                title={isPinned ? 'Unpin' : 'Pin Open'}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  color: isPinned ? '#38bdf8' : 'rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none'
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
                  <polygon points="12 15 17 21 7 21 12 15" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default DynamicIsland
