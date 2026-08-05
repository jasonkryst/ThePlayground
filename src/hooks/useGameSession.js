import { useState, useEffect, useRef } from 'react'
import { useOrientationGate } from '../components/OrientationGateContext'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import usePersonalBest from './usePersonalBest'
import useBadges from './useBadges'
import useItemStats from './useItemStats'
import computeItemWeight from '../utils/computeItemWeight'
import { fireConfetti } from '../lib/confetti'
import buildQueue from '../utils/buildQueue'
import reinsertMissed from '../utils/reinsertMissed'
import adapter from '../storage/index'
import { isResumeValid } from '../utils/sessionResume'

function resolveMaxTries(maxTries) {
  if (maxTries === 'unlimited') return Infinity
  if (maxTries === 'none' || maxTries == null) return 1
  return Number(maxTries)
}

// maxTries: 'unlimited' has no natural "last try" to ramp toward, so the hint
// ramp treats it as if lock happened this many wrong attempts past the hint
// threshold, then holds at full strength for any further wrong attempt.
const UNLIMITED_HINT_RAMP_STEPS = 3

export default function useGameSession({ gameId, items }) {
  const { settings, loaded, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { bestStreak, recordStreak } = useBestStreak(gameId)
  const { personalBest, recordSession: recordPersonalBestSession } = usePersonalBest(gameId)
  const { awardSession } = useBadges()
  const { itemStats, recordMisses } = useItemStats(gameId)
  const { blocked } = useOrientationGate()

  const {
    numChoices, feedbackMode, questionsPerSession, animationsEnabled,
    timerMode, timeLimitSeconds, maxTries, hintsEnabled, hintAfterWrongTaps,
    retryCountsAsStreak, spacedRepetitionEnabled, difficultyAutoProgressionEnabled,
    speedRecordMinAccuracy, soundEffectsEnabled, adaptiveItemSelectionEnabled,
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
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [sessionReady,    setSessionReady]    = useState(false)

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
  const resumeCheckedRef    = useRef(false)
  const suppressNextBuildRef = useRef(false)
  const eventSeqRef     = useRef(0)
  const blockedRef       = useRef(false)
  const pausedAtRef      = useRef(null)
  const remainingMsRef   = useRef(null)
  const itemStatsRef     = useRef({})

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
  //
  // Deliberately independent of the resume-check effect below: this effect
  // must resolve showIntro/introResolved synchronously, in the same tick
  // `loaded` flips true, with no dependency on any async round trip (see the
  // "introResolved becomes true in the same tick showIntro resolves"
  // regression test) — folding the (genuinely async, storage-backed)
  // resume-check into this effect would reintroduce exactly the one-render-
  // behind staleness that test guards against. acceptResume() still forces
  // showIntro closed afterward when a resumed session should skip the intro.
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])

  function acceptResume() {
    // index/score/queue/etc. were already populated from the snapshot by the
    // resume-check effect below (so the resume prompt could show real
    // progress) — this just finalizes the transition into the game view.
    setResumeAvailable(false)
    suppressNextBuildRef.current = true
    setIntroResolved(true)
    setShowIntro(false)
    setSessionReady(true)
  }

  function declineResume() {
    adapter.clearSessionResume()
    setResumeAvailable(false)

    // The resume-check effect eagerly populated index/score/streak/missed/
    // timings/queue from the snapshot so the prompt could preview real
    // progress before the user chose. Undo that here so a declined resume
    // starts genuinely fresh (mirrors restart()); the queue-build effect
    // below supplies a brand-new queue once sessionReady flips true.
    scoreRef.current = 0
    setScore(0)
    streakRef.current = 0
    setStreak(0)
    peakStreakRef.current = 0
    missedRef.current = []
    setMissed([])
    timingsRef.current = []
    setTimings([])
    indexRef.current = 0
    setIndex(0)
    queueRef.current = []
    setQueue([])

    // Falls through to the normal intro-or-not behavior instead of leaving
    // the intro permanently suppressed by the resume-check effect above.
    setShowIntro(!settings.introDismissed?.[gameId])
    setSessionReady(true)
  }

  // Resume-check: a separate effect/ref from intro-init above (see the
  // comment there for why), gating only `sessionReady` — and, through it,
  // the queue-build effect below. A valid same-game snapshot within the
  // 4-hour TTL (isResumeValid) holds the queue-build effect at bay
  // (resumeAvailable stays true, sessionReady stays false) until
  // acceptResume()/declineResume() (above) decide how to proceed;
  // otherwise sessionReady flips true directly once the check comes back
  // empty/invalid, letting the queue-build effect run its normal
  // fresh-queue path.
  useEffect(() => {
    if (!loaded || resumeCheckedRef.current) return
    resumeCheckedRef.current = true
    adapter.getSessionResume().then(saved => {
      if (isResumeValid(saved, gameId)) {
        // Populate index/score/queue/etc. from the snapshot now, not only in
        // acceptResume(): QuizGameShell reads these same session fields to
        // render the resume prompt's progress text ("question X of Y, score
        // Z"), and that prompt is shown for the entire awaiting-resume-choice
        // window below, before the user has decided anything. Without this,
        // the prompt would display the still-fresh initial state (0/0/0)
        // instead of the saved progress. declineResume() resets these back to
        // fresh-session defaults if the user opts not to resume.
        queueRef.current = saved.queue
        setQueue(saved.queue)
        indexRef.current = saved.index
        setIndex(saved.index)
        scoreRef.current = saved.score
        setScore(saved.score)
        streakRef.current = saved.streak
        setStreak(saved.streak)
        peakStreakRef.current = saved.peakStreak
        missedRef.current = saved.missed
        setMissed(saved.missed)
        timingsRef.current = saved.timings
        setTimings(saved.timings)
        setResumeAvailable(true)
        // The intro-init effect above runs independently and unconditionally
        // (it can't know a resume decision is pending), so it may have already
        // set showIntro=true for this game. Force it closed here so the
        // resume prompt always takes priority over the intro for the entire
        // awaiting-resume-choice window, not just a one-tick flash.
        // declineResume() restores showIntro to its correct value afterward.
        setShowIntro(false)
      } else {
        if (saved && saved.gameId === gameId) adapter.clearSessionResume()
        setSessionReady(true)
      }
    })
  }, [loaded, gameId])

  useEffect(() => { itemStatsRef.current = itemStats }, [itemStats])

  function selectionWeightFn() {
    return adaptiveItemSelectionEnabled ? item => computeItemWeight(itemStatsRef.current, item.id) : null
  }

  // Snapshots a freshly built queue from refs (always up to date the
  // instant the queue exists — score/index/etc. are reset via refs before
  // any queue-build path runs) rather than waiting for `queue`/`index`/etc.
  // state to commit and re-trigger the effect below on a second render. A
  // fresh session that's autosaved this way is resumable immediately, not
  // one render pass later — closing the window a fast subsequent navigation
  // (e.g. e2e/admin.spec.js's Start Fresh flow, issues #147/#165) could
  // otherwise race past before the state-driven effect below ever runs.
  function persistFreshSessionResume(q) {
    adapter.saveSessionResume({
      gameId, queue: q, index: indexRef.current, score: scoreRef.current,
      streak: streakRef.current, missed: missedRef.current, timings: timingsRef.current,
      peakStreak: peakStreakRef.current, savedAt: Date.now(),
    })
  }

  useEffect(() => {
    if (!sessionReady || !numChoices || !questionsPerSession) return
    if (suppressNextBuildRef.current) { suppressNextBuildRef.current = false; return }
    const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
    queueRef.current = q
    setQueue(q)
    persistFreshSessionResume(q)
  }, [sessionReady, numChoices, questionsPerSession, items, adaptiveItemSelectionEnabled])

  // Persists a resumable snapshot once per question transition (not
  // per-tap): score/streak/missed/timings all finish updating, synchronously,
  // before index ever advances (advance() runs only after the scoring
  // effects of the just-answered question have already committed), so by
  // the time this effect re-runs, the snapshot it captures is always fully
  // settled — never a half-answered question where index still points at
  // the old one. Cleared the moment the session finishes. Also covers
  // fresh-queue builds (redundantly with persistFreshSessionResume above,
  // once `queue` state itself catches up) and restart()'s rebuild.
  useEffect(() => {
    if (done) { adapter.clearSessionResume(); return }
    if (!queue.length) return
    adapter.saveSessionResume({
      gameId, queue, index, score, streak, missed, timings,
      peakStreak: peakStreakRef.current, savedAt: Date.now(),
    })
  }, [gameId, queue, index, done])

  // Per-question state reset; also seeds the countdown budget the timer
  // effect below draws down across block/unblock segments.
  useEffect(() => {
    if (!sessionReady || !queueRef.current[indexRef.current]) return
    questionStartRef.current = Date.now()
    remainingMsRef.current = timeLimitMs ?? null
    lockedRef.current = false
    wrongAttemptsRef.current = 0
    disabledChoiceIdsRef.current = []
    setLocked(false)
    setWrongAttempts(0)
    setDisabledChoiceIds([])
    setCurrentElapsedMs(0)
    setTimedOut(false)
  }, [sessionReady, index, queue, timeLimitMs, timerMode])

  // Question timers, orientation-gate aware (issue #65, mirroring
  // useMemorySession): while the gate blocks play no timers run; on resume
  // the countdown re-arms with its remaining budget and questionStartRef
  // shifts forward by the paused span so durationMs stays honest.
  //
  // currentElapsedMs is tracked unconditionally (not gated on timerMode):
  // this keeps the effect's behavior uniform across timer modes so the
  // Timer component's currentElapsedMs prop ticks smoothly whenever it's
  // rendered, including across timerMode transitions. It has no bearing on
  // scored timing data — durationMs values come from a separate
  // Date.now() - questionStartRef.current computation in
  // handleChoice/handleTimeout.
  useEffect(() => {
    blockedRef.current = blocked
    if (!sessionReady || !queueRef.current[indexRef.current]) return

    if (blocked) {
      pausedAtRef.current = Date.now()
      return
    }
    if (pausedAtRef.current != null) {
      questionStartRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }

    const intervalId = setInterval(() => {
      setCurrentElapsedMs(Date.now() - questionStartRef.current)
    }, 100)

    const segmentStart = Date.now()
    const timeoutId = remainingMsRef.current != null
      ? setTimeout(() => {
          if (!lockedRef.current) handleTimeoutRef.current?.()
        }, remainingMsRef.current)
      : null

    return () => {
      clearInterval(intervalId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        remainingMsRef.current -= Date.now() - segmentStart
      }
    }
  }, [sessionReady, index, queue, timeLimitMs, timerMode, blocked])

  const current = queue[index]
  const hintActive = hintsEnabled && !locked && wrongAttempts >= hintAfterWrongTaps

  // Ramp: subtlest (1/totalHintSteps) on the first hint-eligible wrong
  // attempt, full strength (1) on the last try before the question locks as
  // missed. The min/max clamp below keeps this well-defined once maxTries is
  // 'unlimited' (effectiveMaxTries substitutes a fixed ramp window) or once
  // wrongAttempts has already passed that window.
  const resolvedMaxTries = resolveMaxTries(maxTries)
  const effectiveMaxTries = resolvedMaxTries === Infinity
    ? hintAfterWrongTaps + UNLIMITED_HINT_RAMP_STEPS
    : resolvedMaxTries
  const totalHintSteps = effectiveMaxTries - hintAfterWrongTaps
  const triesRemaining = effectiveMaxTries - wrongAttempts
  const hintStep = Math.min(Math.max(totalHintSteps - triesRemaining + 1, 1), totalHintSteps)
  const hintStrength = hintActive ? hintStep / totalHintSteps : 0

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

  // Shared per-attempt state machine: timings, score/streak, wrong-attempt
  // counting, lock-as-missed, and scheduling advance() for 'immediate'
  // feedback mode. Any interaction type reports its outcome here once it
  // knows whether the attempt was correct -- handleChoice (discrete
  // choice-click) is one caller; the hook makes no assumption about *how*
  // correctness was determined, so non-discrete interactions (e.g. Number
  // Tap's tap-until-the-count-matches-then-confirm) can call this directly.
  function handleAttempt(isCorrect) {
    const durationMs = Date.now() - questionStartRef.current
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

  function handleChoice(item) {
    if (blockedRef.current) return
    if (lockedRef.current) return
    if (disabledChoiceIdsRef.current.includes(item.id)) return
    setSelected(item.id)

    const isCorrect = item.id === current.correct.id
    if (!isCorrect) {
      const nextDisabled = [...disabledChoiceIdsRef.current, item.id]
      disabledChoiceIdsRef.current = nextDisabled
      setDisabledChoiceIds(nextDisabled)
    }
    handleAttempt(isCorrect)
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
    await recordMisses(missedRef.current.map(m => m.id))

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
    const q = buildQueue(items, numChoices, questionsPerSession, selectionWeightFn())
    queueRef.current = q
    setQueue(q)
    persistFreshSessionResume(q)
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
    current, index, total: queue.length, locked, disabledChoiceIds, hintActive, hintStrength, selected,
    score, streak, bestStreak, missed, done, feedbackMode, numChoices,
    currentElapsedMs, timings, timerMode, timeLimitMs, timedOut, offerDifficultyBump,
    personalBestResult, newBadges,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    lastEvent, soundEffectsEnabled,
    resumeAvailable, acceptResume, declineResume,
    handleChoice, handleAttempt, advance, restart, acceptDifficultyBump, dismissDifficultyBump, dismissIntro,
  }
}
