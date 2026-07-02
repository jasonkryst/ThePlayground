import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'
import reinsertMissed from '../utils/reinsertMissed'

function resolveMaxTries(maxTries) {
  if (maxTries === 'unlimited') return Infinity
  if (maxTries === 'none' || maxTries == null) return 1
  return Number(maxTries)
}

export default function useGameSession({ gameId, items, timeLimitMs, onTimeout }) {
  const { settings, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)

  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerDisplayEnabled, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
  } = settings

  const [queue,               setQueue]               = useState([])
  const [index,                setIndex]               = useState(0)
  const [locked,               setLocked]              = useState(false)
  const [selected,             setSelected]            = useState(null)
  const [disabledChoiceIds,    setDisabledChoiceIds]   = useState([])
  const [wrongAttempts,        setWrongAttempts]       = useState(0)
  const [score,                setScore]               = useState(0)
  const [streak,               setStreak]              = useState(0)
  const [missed,                setMissed]              = useState([])
  const [done,                 setDone]                = useState(false)
  const [currentElapsedMs,     setCurrentElapsedMs]    = useState(0)
  const [timings,              setTimings]             = useState([])
  const [offerDifficultyBump,  setOfferDifficultyBump] = useState(false)

  // Refs avoid stale closures in setTimeout/setInterval callbacks
  const scoreRef        = useRef(0)
  const streakRef       = useRef(0)
  const peakStreakRef   = useRef(0)
  const missedRef       = useRef([])
  const indexRef        = useRef(0)
  const queueRef        = useRef([])
  const timingsRef      = useRef([])
  const lockedRef       = useRef(false)
  const wrongAttemptsRef    = useRef(0)
  const disabledChoiceIdsRef = useRef([])
  const questionStartRef = useRef(Date.now())
  const onTimeoutRef    = useRef(onTimeout)
  const pendingReinsertRef = useRef(null)
  useEffect(() => { onTimeoutRef.current = onTimeout })

  useEffect(() => {
    if (numChoices && questionsPerSession) {
      const q = buildQueue(items, numChoices, questionsPerSession)
      queueRef.current = q
      setQueue(q)
    }
  }, [numChoices, questionsPerSession, items])

  // Per-question timer, retry-state reset, and optional timeout
  useEffect(() => {
    if (!queueRef.current[indexRef.current]) return
    questionStartRef.current = Date.now()
    lockedRef.current = false
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    setLocked(false)
    setWrongAttempts(0)
    setDisabledChoiceIds([])
    setCurrentElapsedMs(0)

    const intervalId = (timerDisplayEnabled || timeLimitMs)
      ? setInterval(() => {
          setCurrentElapsedMs(Date.now() - questionStartRef.current)
        }, 100)
      : null

    const timeoutId = timeLimitMs
      ? setTimeout(() => {
          if (!lockedRef.current) onTimeoutRef.current?.()
        }, timeLimitMs)
      : null

    return () => {
      clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [index, queue, timeLimitMs, timerDisplayEnabled])

  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps

  function handleChoice(item) {
    if (lockedRef.current) return
    if (disabledChoiceIdsRef.current.includes(item.id)) return
    setSelected(item.id)

    const durationMs = Date.now() - questionStartRef.current
    const isCorrect = item.id === current.correct.id
    const attemptNumber = wrongAttemptsRef.current + 1

    const entry = { questionIndex: index, itemId: current.correct.id, correct: isCorrect, durationMs, attemptNumber }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)

    let willLock = false

    if (isCorrect) {
      scoreRef.current += 1
      setScore(scoreRef.current)

      const gotItOnRetry = wrongAttemptsRef.current > 0
      if (!gotItOnRetry || retryCountsAsStreak) {
        streakRef.current += 1
        setStreak(streakRef.current)
        if (streakRef.current > peakStreakRef.current) peakStreakRef.current = streakRef.current
        recordStreak(streakRef.current)
      } else {
        streakRef.current = 0
        setStreak(0)
      }
      if (animationsEnabled) fireConfetti()

      willLock = true
    } else {
      const nextWrongAttempts = wrongAttemptsRef.current + 1
      wrongAttemptsRef.current = nextWrongAttempts
      setWrongAttempts(nextWrongAttempts)

      const nextDisabled = [...disabledChoiceIdsRef.current, item.id]
      disabledChoiceIdsRef.current = nextDisabled
      setDisabledChoiceIds(nextDisabled)

      const resolvedMax = resolveMaxTries(maxTries)
      if (nextWrongAttempts >= resolvedMax) {
        streakRef.current = 0
        setStreak(0)
        missedRef.current = [...missedRef.current, current.correct]
        setMissed(missedRef.current)

        if (spacedRepetitionEnabled) {
          // Deferred to advance() rather than applied here: mutating `queue`
          // now would change the per-question effect's `queue` dependency
          // while `index` stays the same, re-running it and immediately
          // undoing the `setLocked(true)` below.
          pendingReinsertRef.current = { missedIndex: indexRef.current, missedEntry: current }
        }

        willLock = true
      }
    }

    if (willLock) {
      setLocked(true)
      lockedRef.current = true
      if (feedbackMode === 'immediate') {
        setTimeout(advance, 1500)
      }
    }
  }

  function advance() {
    if (pendingReinsertRef.current) {
      const { missedIndex, missedEntry } = pendingReinsertRef.current
      queueRef.current = reinsertMissed(queueRef.current, missedIndex, missedEntry)
      setQueue(queueRef.current)
      pendingReinsertRef.current = null
    }

    const nextIndex = indexRef.current + 1
    if (nextIndex >= queueRef.current.length) {
      finishGame()
    } else {
      indexRef.current = nextIndex
      setIndex(nextIndex)
      setLocked(false)
      lockedRef.current = false
      setSelected(null)
      setDisabledChoiceIds([])
      disabledChoiceIdsRef.current = []
      setWrongAttempts(0)
      wrongAttemptsRef.current = 0
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

    if (
      difficultyAutoProgressionEnabled &&
      scoreRef.current === queueRef.current.length &&
      numChoices < 4
    ) {
      setOfferDifficultyBump(true)
    }

    setDone(true)
  }

  function acceptDifficultyBump() {
    updateSetting('numChoices', numChoices + 1)
    setOfferDifficultyBump(false)
  }

  function dismissDifficultyBump() {
    setOfferDifficultyBump(false)
  }

  function restart() {
    scoreRef.current      = 0
    streakRef.current     = 0
    peakStreakRef.current = 0
    missedRef.current     = []
    indexRef.current = 0
    timingsRef.current = []
    lockedRef.current = false
    pendingReinsertRef.current = null
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    const q = buildQueue(items, numChoices, questionsPerSession)
    queueRef.current = q
    setQueue(q)
    setIndex(0)
    setLocked(false)
    setSelected(null)
    setDisabledChoiceIds([])
    setWrongAttempts(0)
    setScore(0)
    setStreak(0)
    setMissed([])
    setDone(false)
    setTimings([])
    setCurrentElapsedMs(0)
    setOfferDifficultyBump(false)
  }

  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerDisplayEnabled, offerDifficultyBump,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump,
  }
}
