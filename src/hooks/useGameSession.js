import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'

export default function useGameSession({ gameId, items, timeLimitMs, onTimeout }) {
  const { settings } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)

  const { numChoices, feedbackMode, questionsPerSession, animationsEnabled } = settings

  const [queue,             setQueue]             = useState([])
  const [index,             setIndex]             = useState(0)
  const [answered,          setAnswered]          = useState(false)
  const [selected,          setSelected]          = useState(null)
  const [score,             setScore]             = useState(0)
  const [streak,            setStreak]            = useState(0)
  const [missed,            setMissed]            = useState([])
  const [done,              setDone]              = useState(false)
  const [currentElapsedMs,  setCurrentElapsedMs]  = useState(0)
  const [timings,           setTimings]           = useState([])

  // Refs avoid stale closures in setTimeout/setInterval callbacks
  const scoreRef        = useRef(0)
  const streakRef       = useRef(0)
  const peakStreakRef   = useRef(0)
  const missedRef       = useRef([])
  const indexRef        = useRef(0)
  const queueRef        = useRef([])
  const timingsRef      = useRef([])
  const answeredRef     = useRef(false)
  const questionStartRef = useRef(Date.now())
  // Keep onTimeout in a ref so the timer effect doesn't need it as a dep;
  // an inline function passed by the caller would otherwise reset the timer on every render.
  const onTimeoutRef    = useRef(onTimeout)
  useEffect(() => { onTimeoutRef.current = onTimeout })

  // items must be a stable reference (module-level constant); an inline array would rebuild the queue every render.
  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession, items])

  // Per-question timer + optional timeout
  useEffect(() => {
    if (!queueRef.current[indexRef.current]) return
    questionStartRef.current = Date.now()
    answeredRef.current = false
    setCurrentElapsedMs(0)

    let intervalId
    if (timeLimitMs) {
      intervalId = setInterval(() => {
        setCurrentElapsedMs(Date.now() - questionStartRef.current)
      }, 100)
    }

    const timeoutId = timeLimitMs
      ? setTimeout(() => {
          if (!answeredRef.current) onTimeoutRef.current?.()
        }, timeLimitMs)
      : null

    return () => {
      if (intervalId) clearInterval(intervalId)
      if (timeoutId)  clearTimeout(timeoutId)
    }
  }, [index, queue, timeLimitMs])

  const current = queue[index]

  function handleChoice(item) {
    if (answered) return
    setAnswered(true)
    answeredRef.current = true
    setSelected(item.id)

    const durationMs = Date.now() - questionStartRef.current
    const isCorrect = item.id === current.correct.id

    const entry = { questionIndex: index, itemId: current.correct.id, correct: isCorrect, durationMs }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)

    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)
      streakRef.current += 1
      setStreak(streakRef.current)
      if (streakRef.current > peakStreakRef.current) peakStreakRef.current = streakRef.current
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
      answeredRef.current = false
      setSelected(null)
    }
  }

  async function finishGame() {
    const result = {
      gameId,
      score:      scoreRef.current,
      total:      queueRef.current.length,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      timings:    timingsRef.current,
      peakStreak: peakStreakRef.current,
    }
    await addScore(result)
    setDone(true)
  }

  function restart() {
    scoreRef.current      = 0
    streakRef.current     = 0
    peakStreakRef.current = 0
    missedRef.current     = []
    indexRef.current = 0
    timingsRef.current = []
    answeredRef.current = false
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
    setTimings([])
    setCurrentElapsedMs(0)
  }

  return {
    current, index, total: queue.length, answered, selected,
    score, streak, bestStreak, missed, done, feedbackMode,
    currentElapsedMs, timings,
    handleChoice, advance, restart,
  }
}
