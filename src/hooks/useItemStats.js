import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'

export default function useItemStats(gameId) {
  const [itemStats, setItemStats] = useState({})
  const allStatsRef = useRef({})

  useEffect(() => {
    adapter.getItemStats().then(all => {
      allStatsRef.current = all
      setItemStats(all[gameId] ?? {})
    })
  }, [gameId])

  async function recordMisses(missedItemIds) {
    if (missedItemIds.length === 0) return

    const now = Date.now()
    const current = allStatsRef.current[gameId] ?? {}
    const updated = { ...current }
    for (const id of missedItemIds) {
      const prevCount = updated[id]?.missCount ?? 0
      updated[id] = { missCount: prevCount + 1, lastMissedAt: now }
    }

    const nextAll = { ...allStatsRef.current, [gameId]: updated }
    allStatsRef.current = nextAll
    setItemStats(updated)
    await adapter.saveItemStats(nextAll)
  }

  return { itemStats, recordMisses }
}
