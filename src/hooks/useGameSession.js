import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import usePersonalBest from './usePersonalBest'
import useBadges from './useBadges'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'
import reinsertMissed from '../utils/reinsertMissed'

function resolveMaxTries(maxTries) {
  if (maxTries === 'unlimited') return Infinity
  if (maxTries === 'none' || maxTries == null) return 1
  return Number(maxTries)
}

export default function useGameSession({ gameId, items }) {
  const { settings, loaded, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)
  const { personalBest, recordSession: recordPersonalBestSession } = usePersonalBest(gameId)
  const { awardSession } = useBadges()

  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
    speedRecordMinAccuracy, soundEffectsEnabled,
  } = settings

  const timeLimitMs = timerMode === 'countdown' ? timeLimitSeconds * 1000 : undefined

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
  const [personalBestResult,  setPersonalBestResult]  = useState(null)
  const [newBadges,           setNewBadges]            = useState([])
  const [timedOut,             setTimedOut]            = useState(false)
  const [showIntro,            setShowIntro]           = useState(false)
  const [introResolved,        setIntroResolved]       = useState(false)
  const [dontShowAgain,        setDontShowAgain]       = useState(false)
  const [lastEvent,            setLastEvent]           = useState(null)

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
  const handleTimeoutRef = useRef(null)
  const pendingReinsertRef = useRef(null)
  const introInitializedRef = useRef(false)
  const eventSeqRef     = useRef(0)

  // Runs once, when settings finish their initial async load. The ref guard
  // prevents later introDismissed writes (including this hook's own
  // dismissIntro call) from re-evaluating and re-showing/re-hiding the intro
  // mid-session.
  //
  // introResolved is set in this same tick as showIntro's correct value so
  // that consumers gating on introResolved can never observe showIntro's
  // stale initial `false` on the render where `loaded` first flips true but
  // this effect hasn't run yet (effects always commit one render after the
  // state change that triggered them).
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])

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
    setTimedOut(false)

    // currentElapsedMs is tracked unconditionally (not gated on timerMode):
    // this keeps the effect's behavior uniform across timer modes so the
    // Timer component's currentElapsedMs prop ticks smoothly whenever it's
    // rendered, including across timerMode transitions. It has no bearing on
    // scored timing data — durationMs values come from a separate
    // Date.now() - questionStartRef.current computation in
    // handleChoice/handleTimeout.
    const intervalId = setInterval(() => {
      setCurrentElapsedMs(Date.now() - questionStartRef.current)
    }, 100)

    const timeoutId = timeLimitMs
      ? setTimeout(() => {
          if (!lockedRef.current) handleTimeoutRef.current?.()
        }, timeLimitMs)
      : null

    return () => {
      clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [index, queue, timeLimitMs, timerMode])

  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps

  function lockAsMissed(missedItem) {
    streakRef.current = 0
    setStreak(0)
    missedRef.current = [...missedRef.current, missedItem]
    setMissed(missedRef.current)

    if (spacedRepetitionEnabled) {
      pendingReinsertRef.current = { missedIndex: indexRef.current, missedEntry: queueRef.current[indexRef.current] }
    }
  }

  // Semantic per-answer events (mirrors useMemorySession's emit): consumers
  // (QuizGameShell) turn these into chimes and live-region announcements.
  // seq increments so repeated same-type events are still distinct.
  function emit(type) {
    eventSeqRef.current += 1
    setLastEvent({ seq: eventSeqRef.current, type })
  }

  function handleTimeout() {
    if (lockedRef.current) return
    const q = queueRef.current[indexRef.current]
    const attemptNumber = wrongAttemptsRef.current + 1
    const entry = {
      questionIndex: indexRef.current, itemId: q.correct.id, correct: false,
      durationMs: timeLimitMs, attemptNumber, timedOut: true,
    }
    const nextTimings = [...timingsRef.current, entry]
    timingsRef.current = nextTimings
    setTimings(nextTimings)
    emit('timeout')

    lockAsMissed(q.correct)
    setLocked(true)
    lockedRef.current = true
    setTimedOut(true)
    setTimeout(advance, 1500)
  }

  useEffect(() => { handleTimeoutRef.current = handleTimeout })

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
    emit(isCorrect ? 'correct' : 'wrong')

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
        // Deferred reinsertion note (still applies): mutating `queue` now
        // would change the per-question effect's `queue` dependency while
        // `index` stays the same, re-running it and immediately undoing the
        // `setLocked(true)` below — so lockAsMissed only stages the pending
        // reinsertion; advance() applies it.
        lockAsMissed(current.correct)
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
    const total = queueRef.current.length
    const isPerfect = scoreRef.current === total
    const result = {
      gameId,
      score:      scoreRef.current,
      total,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      timings:    timingsRef.current,
      peakStreak: peakStreakRef.current,
    }
    await addScore(result)

    const bestResult = await recordPersonalBestSession({
      score: scoreRef.current, total, timings: timingsRef.current, minAccuracyPct: speedRecordMinAccuracy,
    })
    setPersonalBestResult(bestResult)

    const earnedBadges = await awardSession(gameId, {
      peakStreak: peakStreakRef.current, isPerfect, questionsAnswered: total,
    })
    setNewBadges(earnedBadges)

    if (difficultyAutoProgressionEnabled && isPerfect && numChoices < 4) {
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
    eventSeqRef.current = 0
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
    setTimedOut(false)
    setPersonalBestResult(null)
    setNewBadges([])
    setOfferDifficultyBump(false)
    setLastEvent(null)
  }

  function dismissIntro(dontShowAgainFlag) {
    setShowIntro(false)
    if (dontShowAgainFlag) {
      updateSetting('introDismissed', { ...settings.introDismissed, [gameId]: true })
    }
  }

  return {
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerMode, timeLimitMs, timedOut, offerDifficultyBump,
    personalBestResult, newBadges,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    lastEvent, soundEffectsEnabled,
    handleChoice, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
}
