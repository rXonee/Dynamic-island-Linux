import React, { useState, useEffect, useRef } from 'react'
import { useMediaPlayer } from '../hooks/useMediaPlayer'

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const DynamicIsland = () => {
  const [isHovered, setIsHovered] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [imgError, setImgError] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)
  const collapseTimer = useRef<NodeJS.Timeout | null>(null)

  const { currentTrack, isPlaying, controls, position, duration } = useMediaPlayer()

  const isExpanded = isHovered || isPinned
  const hasTrack = Boolean(currentTrack?.title && currentTrack.title !== 'Not Playing' && currentTrack.title !== 'Unknown')

  const handleMouseEnter = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    setIsHovered(true)
    const electron = (window as any).electron
    electron?.ipcRenderer?.send('set-island-expanded', true)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (!isPinned) {
      collapseTimer.current = setTimeout(() => {
        const electron = (window as any).electron
        electron?.ipcRenderer?.send('set-island-expanded', false)
      }, 500)
    }
  }

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextPinned = !isPinned
    setIsPinned(nextPinned)
    const electron = (window as any).electron
    if (nextPinned) {
      electron?.ipcRenderer?.send('set-island-expanded', true)
    } else if (!isHovered) {
      collapseTimer.current = setTimeout(() => {
        electron?.ipcRenderer?.send('set-island-expanded', false)
      }, 500)
    }
  }

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

  // Strictly sized Cover Art with smooth CSS transitions for fluid morphing
  const renderCoverArt = (size: number, borderRadius: number, iconSize: number) => {
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
          border: '1px solid rgba(255,255,255,0.12)',
          transition:
            'width 0.46s cubic-bezier(0.22, 1, 0.36, 1), height 0.46s cubic-bezier(0.22, 1, 0.36, 1), min-width 0.46s cubic-bezier(0.22, 1, 0.36, 1), min-height 0.46s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.46s cubic-bezier(0.22, 1, 0.36, 1), max-height 0.46s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.46s cubic-bezier(0.22, 1, 0.36, 1)',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
      >
        {currentTrack?.artUrl && !imgError ? (
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
              pointerEvents: 'none'
            }}
          />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.95, transition: 'width 0.46s ease, height 0.46s ease' }}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" fill="white" />
            <circle cx="18" cy="16" r="3" fill="white" />
          </svg>
        )}
      </div>
    )
  }

  // Cyan audio visualizer bars matching the reference photo
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

  return (
    <div
      id="island"
      style={{
        margin: '6px auto 0 auto',
        width: isExpanded ? '380px' : hasTrack ? '220px' : '120px',
        height: isExpanded ? '165px' : '36px',
        backgroundColor: '#000000',
        borderRadius: isExpanded ? '32px' : '20px',
        padding: isExpanded ? '14px 18px 12px 18px' : '7px 12px',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: isExpanded
          ? '0 6px 16px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
          : '0 2px 8px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        transition:
          'width 0.46s cubic-bezier(0.22, 1, 0.36, 1), height 0.46s cubic-bezier(0.22, 1, 0.36, 1), border-radius 0.46s cubic-bezier(0.22, 1, 0.36, 1), padding 0.46s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease',
        cursor: 'default',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        color: '#ffffff',
        userSelect: 'none',
        boxSizing: 'border-box'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {!hasTrack && !isExpanded ? (
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#171717', border: '1px solid #333' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
        </div>
      ) : (
        <>
          {/* ================= ROW 1: PERSISTENT MORPHING (Cover + Title/Artist + Equalizer) ================= */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: isExpanded ? '14px' : '8px',
              transition: 'gap 0.46s cubic-bezier(0.22, 1, 0.36, 1)',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: isExpanded ? '14px' : '8px', minWidth: 0, flex: 1, transition: 'gap 0.46s cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {/* Morphing Album Cover */}
              {renderCoverArt(isExpanded ? 52 : 22, isExpanded ? 14 : 6, isExpanded ? 24 : 11)}

              {/* Title & Artist */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    color: '#ffffff',
                    fontSize: isExpanded ? '15px' : '11px',
                    fontWeight: isExpanded ? 600 : 500,
                    letterSpacing: '-0.02em',
                    lineHeight: isExpanded ? '1.2' : '1.1',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: isExpanded ? '200px' : '120px',
                    transition: 'font-size 0.46s cubic-bezier(0.22, 1, 0.36, 1), max-width 0.46s cubic-bezier(0.22, 1, 0.36, 1)'
                  }}
                >
                  {currentTrack?.title || (hasTrack ? 'Playing' : 'No Media Playing')}
                </p>

                {/* Subtitle Artist Name */}
                <div
                  style={{
                    maxHeight: isExpanded ? '22px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: isExpanded
                      ? 'max-height 0.46s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease 0.1s'
                      : 'max-height 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.15s ease'
                  }}
                >
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
            </div>

            {/* Cyan Soundwave Visualizer on Right */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexShrink: 0,
                transform: isExpanded ? 'scale(1.15)' : 'scale(1)',
                transformOrigin: 'right center',
                transition: 'transform 0.46s cubic-bezier(0.22, 1, 0.36, 1)'
              }}
            >
              {renderVisualizer(true)}
            </div>
          </div>

          {/* ================= BOTTOM SECTION: Scrubber + Controls (revealed on expand) ================= */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: isExpanded ? '14px' : '0px',
              maxHeight: isExpanded ? '90px' : '0px',
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded ? 'translateY(0px) scale(1)' : 'translateY(6px) scale(0.96)',
              transformOrigin: 'top center',
              pointerEvents: isExpanded ? 'auto' : 'none',
              overflow: 'hidden',
              flexShrink: 0,
              transition: isExpanded
                ? 'max-height 0.46s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.46s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease 0.1s, transform 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.1s'
                : 'max-height 0.42s cubic-bezier(0.22, 1, 0.36, 1), margin-top 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)'
            }}
          >

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
            onClick={handleTogglePin}
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
          </div>
        </>
      )}
    </div>
  )
}

export default DynamicIsland
