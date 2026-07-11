import { useCallback, useEffect, useRef } from 'react'

/**
 * Owns the lifecycle of a single sound-effect clip: playing a new clip stops
 * the previous one, and any in-flight clip is stopped on unmount. Callers that
 * end a "session" early (results screen, intro) should call stop() themselves.
 *
 * @returns {{ play: (url: ?string) => void, stop: () => void }}
 *   `play` is a no-op for falsy urls and swallows audio.play() rejections
 *   (autoplay policy, missing file). Both functions are referentially stable.
 */
export default function useSoundPlayer() {
  const audioRef = useRef(null)

  const stop = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current = null
  }, [])

  const play = useCallback(url => {
    if (!url) return
    stop()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { play, stop }
}
