import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import computeBadgeAwards from '../utils/computeBadgeAwards'
import computeGameBadgeAwards from '../utils/computeGameBadgeAwards'
import { BADGE_CATALOG, GAME_BADGE_CATALOGS } from '../lib/badges'

const EMPTY = { awards: {}, lifetimeQuestions: {}, lifetimeCounters: {} }

export default function useBadges() {
  const [badgeData, setBadgeData] = useState(EMPTY)
  const dataRef = useRef(EMPTY)

  useEffect(() => {
    adapter.getBadgeData().then(data => {
      const normalized = { ...EMPTY, ...data }
      dataRef.current = normalized
      setBadgeData(normalized)
    })
  }, [])

  async function awardSession(gameId, { peakStreak, isPerfect, questionsAnswered, sessionStats, counterIncrements } = {}) {
    const gameCatalog = GAME_BADGE_CATALOGS[gameId]
    let earnedIds
    let nextData

    if (gameCatalog) {
      const prevCounters = dataRef.current.lifetimeCounters?.[gameId] ?? {}
      const nextCounters = { ...prevCounters }
      for (const [counter, inc] of Object.entries(counterIncrements ?? {})) {
        nextCounters[counter] = (nextCounters[counter] ?? 0) + inc
      }
      earnedIds = computeGameBadgeAwards({ catalog: gameCatalog, sessionStats: sessionStats ?? {}, prevCounters, nextCounters })
      nextData = {
        ...dataRef.current,
        lifetimeCounters: { ...(dataRef.current.lifetimeCounters ?? {}), [gameId]: nextCounters },
      }
    } else {
      const prevLifetimeTotal = dataRef.current.lifetimeQuestions[gameId] ?? 0
      const newLifetimeTotal = prevLifetimeTotal + (questionsAnswered ?? 0)
      earnedIds = computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal })
      nextData = {
        ...dataRef.current,
        lifetimeQuestions: { ...dataRef.current.lifetimeQuestions, [gameId]: newLifetimeTotal },
      }
    }

    const gameAwards = { ...(dataRef.current.awards[gameId] ?? {}) }
    for (const id of earnedIds) {
      gameAwards[id] = (gameAwards[id] ?? 0) + 1
    }
    nextData.awards = { ...dataRef.current.awards, [gameId]: gameAwards }

    dataRef.current = nextData
    setBadgeData(nextData)
    await adapter.saveBadgeData(nextData)

    const catalog = gameCatalog ?? BADGE_CATALOG
    return earnedIds.map(id => catalog.find(b => b.id === id))
  }

  return { badgeData, awardSession }
}
