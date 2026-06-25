import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'

export default function useGameSession({ gameId, items }) {
  const { settings } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)

  const { numChoices, feedbackMode, questionsPerSession, animationsEnabled } = settings

  const [queue,    setQueue]    = useState([])
  const [index,    setIndex]    = useState(0)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState(null)
  const [score,    setScore]    = useState(0)
  const [streak,   setStreak]   = useState(0)
  const [missed,   setMissed]   = useState([])
  const [done,     setDone]     = useState(false)

  // Refs avoid stale closures in setTimeout callbacks
  const scoreRef  = useRef(0)
  const streakRef = useRef(0)
  const missedRef = useRef([])
  const indexRef  = useRef(0)
  const queueRef  = useRef([])

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession])

  const current = queue[index]

  function handleChoice(item) {
    if (answered) return
    setAnswered(true)
    setSelected(item.id)

    const isCorrect = item.id === current.correct.id
    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)
      streakRef.current += 1
      setStreak(streakRef.current)
      recordStreak(streakRef.current)
      if (animationsEnabled) fireConfetti()
    } else {
      streakRef.current = 0
      setStreak(0)
      missedRef.current = [...missedRef.current, current.correct]
      setMissed(missedRef.current)
    }

    if (feedbackMode === 'immediate') {
      setTimeout(advance, 1500)
    }
  }

  function advance() {
    const nextIndex = indexRef.current + 1
    if (nextIndex >= queueRef.current.length) {
      finishGame()
    } else {
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setAnswered(false)
      setSelected(null)
    }
  }

  async function finishGame() {
    const result = {
      gameId,
      score: scoreRef.current,
      total: queueRef.current.length,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
    }
    await addScore(result)
    setDone(true)
  }

  function restart() {
    scoreRef.current = 0
    streakRef.current = 0
    missedRef.current = []
    indexRef.current = 0
    const q = buildQueue(items, numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setAnswered(false)
    setSelected(null)
    setScore(0)
    setStreak(0)
    setMissed([])
    setDone(false)
  }

  return {
    current, index, total: queue.length, answered, selected,
    score, streak, bestStreak, missed, done, feedbackMode,
    handleChoice, advance, restart,
  }
}
