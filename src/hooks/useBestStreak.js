import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'

export default function useBestStreak(gameId) {
  const [bestStreak, setBestStreak] = useState(0)
  const streaksRef = useRef({})

  useEffect(() => {
    adapter.getBestStreaks().then(streaks => {
      streaksRef.current = streaks
      setBestStreak(streaks[gameId] || 0)
    })
  }, [gameId])

  async function recordStreak(streak) {
    const current = streaksRef.current[gameId] || 0
    if (streak <= current) return
    const next = { ...streaksRef.current, [gameId]: streak }
    streaksRef.current = next
    setBestStreak(streak)
    await adapter.saveBestStreaks(next)
  }

  return { bestStreak, recordStreak }
}
