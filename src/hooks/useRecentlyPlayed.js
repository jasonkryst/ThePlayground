import { useState, useEffect } from 'react'
import adapter from '../storage/index'

export default function useRecentlyPlayed() {
  const [recentlyPlayed, setRecentlyPlayed] = useState(new Map())

  useEffect(() => {
    adapter.getScores().then(scores => {
      const map = new Map()
      for (const s of scores) {
        if (!s.timestamp) continue
        const existing = map.get(s.gameId)
        map.set(s.gameId, {
          lastPlayed: new Date(
            existing ? Math.max(existing.lastPlayed.getTime(), s.timestamp) : s.timestamp
          ),
          playCount: (existing?.playCount ?? 0) + 1,
        })
      }
      setRecentlyPlayed(map)
    })
  }, [])

  return recentlyPlayed
}
