import { useState, useEffect, useRef } from 'react'
import adapter from '../storage/index'
import evaluatePersonalBest from '../utils/evaluatePersonalBest'

export default function usePersonalBest(gameId) {
  const [personalBest, setPersonalBest] = useState(null)
  const bestsRef = useRef({})

  useEffect(() => {
    adapter.getPersonalBests().then(bests => {
      bestsRef.current = bests
      setPersonalBest(bests[gameId] ?? null)
    })
  }, [gameId])

  async function recordSession({ score, total, timings, minAccuracyPct }) {
    const previous = bestsRef.current[gameId] ?? null
    const { accuracy, speed, updatedBests } = evaluatePersonalBest({ score, total, timings, minAccuracyPct, previous })

    const nextBests = { ...bestsRef.current, [gameId]: updatedBests }
    bestsRef.current = nextBests
    setPersonalBest(updatedBests)
    await adapter.savePersonalBests(nextBests)

    return { accuracy, speed }
  }

  return { personalBest, recordSession }
}
