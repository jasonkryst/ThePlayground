import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import computeBadgeAwards from '../utils/computeBadgeAwards'
import { BADGE_CATALOG } from '../lib/badges'

const EMPTY = { awards: {}, lifetimeQuestions: {} }

export default function useBadges() {
  const [badgeData, setBadgeData] = useState(EMPTY)
  const dataRef = useRef(EMPTY)

  useEffect(() => {
    adapter.getBadgeData().then(data => {
      dataRef.current = data
      setBadgeData(data)
    })
  }, [])

  async function awardSession(gameId, { peakStreak, isPerfect, questionsAnswered }) {
    const prevLifetimeTotal = dataRef.current.lifetimeQuestions[gameId] ?? 0
    const newLifetimeTotal = prevLifetimeTotal + questionsAnswered
    const earnedIds = computeBadgeAwards({ peakStreak, isPerfect, prevLifetimeTotal, newLifetimeTotal })

    const gameAwards = { ...(dataRef.current.awards[gameId] ?? {}) }
    for (const id of earnedIds) {
      gameAwards[id] = (gameAwards[id] ?? 0) + 1
    }

    const nextData = {
      awards: { ...dataRef.current.awards, [gameId]: gameAwards },
      lifetimeQuestions: { ...dataRef.current.lifetimeQuestions, [gameId]: newLifetimeTotal },
    }
    dataRef.current = nextData
    setBadgeData(nextData)
    await adapter.saveBadgeData(nextData)

    return earnedIds.map(id => BADGE_CATALOG.find(b => b.id === id))
  }

  return { badgeData, awardSession }
}
