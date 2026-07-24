import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Owns the lifecycle of a single sound-effect clip: playing a new clip stops
 * the previous one, and any in-flight clip is stopped on unmount. Callers that
 * end a "session" early (results screen, intro) should call stop() themselves.
 *
 * @returns {{ play: (url: ?string) => void, stop: () => void, blocked: boolean }}
 *   `play` is a no-op for falsy urls. `blocked` reflects whether the most
 *   recent play() attempt's audio.play() rejected (autoplay policy, missing
 *   file) — callers can use it to surface a recovery hint (AU-8). It resets
 *   to false at the start of every play() call, so a stale hint from a
 *   previous clip never lingers into the next attempt.
 */
export default function useSoundPlayer() {
  const audioRef = useRef(null)
  const [blocked, setBlocked] = useState(false)

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
    setBlocked(false)
    audio.play()
      .then(() => { if (audioRef.current === audio) setBlocked(false) })
      .catch(() => { if (audioRef.current === audio) setBlocked(true) })
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { play, stop, blocked }
}
