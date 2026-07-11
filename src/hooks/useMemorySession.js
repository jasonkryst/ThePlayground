import { useState, useEffect, useRef } from 'react'
import useSettings from './useSettings'
import useScores from './useScores'
import useBestStreak from './useBestStreak'
import usePersonalBest from './usePersonalBest'
import useBadges from './useBadges'
import { fireConfetti, fireFireworks } from '../lib/confetti'
import buildDeck from '../utils/buildDeck'

export const MISMATCH_DELAY_MS = 1200
export const COMPLETE_DELAY_MS = 2000

export default function useMemorySession({ gameId, items }) {
  const { settings, loaded, updateSetting } = useSettings()
  const { addScore } = useScores()
  const { recordStreak } = useBestStreak(gameId)
  const { recordMemorySession } = usePersonalBest(gameId)
  const { awardSession } = useBadges()

  const { memoryPairs, animationsEnabled, soundEffectsEnabled, timerMode } = settings

  const [tiles,            setTiles]            = useState([])
  const [locked,           setLocked]           = useState(false)
  const [flipAttempts,     setFlipAttempts]     = useState(0)
  const [mismatches,       setMismatches]       = useState(0)
  const [matchStreak,      setMatchStreak]      = useState(0)
  const [pairsFound,       setPairsFound]       = useState(0)
  const [done,             setDone]             = useState(false)
  const [lastEvent,        setLastEvent]        = useState(null)
  const [currentElapsedMs, setCurrentElapsedMs] = useState(0)
  const [newBadges,        setNewBadges]        = useState([])
  const [personalBestResult, setPersonalBestResult] = useState(null)
  const [showIntro,        setShowIntro]        = useState(false)
  const [introResolved,    setIntroResolved]    = useState(false)
  const [dontShowAgain,    setDontShowAgain]    = useState(false)

  // Refs avoid stale closures in setTimeout callbacks (same pattern as useGameSession)
  const tilesRef           = useRef([])
  const flippedRef         = useRef([])   // tileIds face-up but unresolved (length 0..1)
  const lockedRef          = useRef(false)
  const doneRef            = useRef(false)
  const flipAttemptsRef    = useRef(0)
  const mismatchesRef      = useRef(0)
  const matchStreakRef     = useRef(0)
  const peakMatchStreakRef = useRef(0)
  const pairsFoundRef      = useRef(0)
  const startRef           = useRef(Date.now())
  const seqRef             = useRef(0)
  const introInitializedRef = useRef(false)
  const mismatchTimeoutRef  = useRef(null)
  const completeTimeoutRef  = useRef(null)

  // Same intro-initialization contract as useGameSession (see its comment).
  useEffect(() => {
    if (!loaded || introInitializedRef.current) return
    introInitializedRef.current = true
    setIntroResolved(true)
    setShowIntro(!settings.introDismissed?.[gameId])
  }, [loaded, settings.introDismissed, gameId])

  useEffect(() => {
    if (!loaded) return
    const deck = buildDeck(items, memoryPairs).map(t => ({ ...t, state: 'down' }))
    tilesRef.current = deck
    setTiles(deck)
    startRef.current = Date.now()
  }, [loaded, memoryPairs, items])

  useEffect(() => {
    if (done || !introResolved || showIntro) return
    const id = setInterval(() => setCurrentElapsedMs(Date.now() - startRef.current), 100)
    return () => clearInterval(id)
  }, [done, introResolved, showIntro])

  function emit(type, itemId = null) {
    seqRef.current += 1
    setLastEvent({ seq: seqRef.current, type, itemId })
  }

  function setTileStates(tileIds, state) {
    tilesRef.current = tilesRef.current.map(t => (tileIds.includes(t.tileId) ? { ...t, state } : t))
    setTiles(tilesRef.current)
  }

  function flipTile(tileId) {
    if (lockedRef.current || doneRef.current) return
    const tile = tilesRef.current.find(t => t.tileId === tileId)
    if (!tile || tile.state !== 'down') return

    setTileStates([tileId], 'up')
    flippedRef.current = [...flippedRef.current, tileId]
    if (flippedRef.current.length < 2) return

    const [aId, bId] = flippedRef.current
    flippedRef.current = []
    const a = tilesRef.current.find(t => t.tileId === aId)
    const b = tilesRef.current.find(t => t.tileId === bId)

    flipAttemptsRef.current += 1
    setFlipAttempts(flipAttemptsRef.current)

    if (a.itemId === b.itemId) {
      setTileStates([aId, bId], 'matched')
      pairsFoundRef.current += 1
      setPairsFound(pairsFoundRef.current)
      matchStreakRef.current += 1
      setMatchStreak(matchStreakRef.current)
      if (matchStreakRef.current > peakMatchStreakRef.current) peakMatchStreakRef.current = matchStreakRef.current
      if (animationsEnabled) fireConfetti()
      emit('match', a.itemId)

      if (pairsFoundRef.current === tilesRef.current.length / 2) finishGame()
    } else {
      setTileStates([aId, bId], 'mismatch')
      mismatchesRef.current += 1
      setMismatches(mismatchesRef.current)
      matchStreakRef.current = 0
      setMatchStreak(0)
      lockedRef.current = true
      setLocked(true)
      emit('mismatch')
      mismatchTimeoutRef.current = setTimeout(() => {
        setTileStates([aId, bId], 'down')
        lockedRef.current = false
        setLocked(false)
        mismatchTimeoutRef.current = null
      }, MISMATCH_DELAY_MS)
    }
  }

  async function finishGame() {
    doneRef.current = true
    const pairs = tilesRef.current.length / 2
    if (animationsEnabled) fireFireworks()
    emit('complete')

    await addScore({
      gameId,
      score:      pairs,
      total:      pairs,
      date:       new Date().toISOString().split('T')[0],
      timestamp:  Date.now(),
      flipAttempts:    flipAttemptsRef.current,
      mismatches:      mismatchesRef.current,
      peakStreak:      peakMatchStreakRef.current,
      peakMatchStreak: peakMatchStreakRef.current,
      durationMs:      Date.now() - startRef.current,
    })

    await recordStreak(peakMatchStreakRef.current)

    const bestResult = await recordMemorySession({ flipAttempts: flipAttemptsRef.current, pairs })
    setPersonalBestResult(bestResult)

    const earned = await awardSession(gameId, {
      sessionStats: {
        pairs,
        flipAttempts:    flipAttemptsRef.current,
        mismatches:      mismatchesRef.current,
        peakMatchStreak: peakMatchStreakRef.current,
      },
      counterIncrements: { pairsMatched: pairs },
    })
    setNewBadges(earned)

    completeTimeoutRef.current = setTimeout(() => {
      setDone(true)
      completeTimeoutRef.current = null
    }, COMPLETE_DELAY_MS)
  }

  function restart() {
    clearTimeout(mismatchTimeoutRef.current)
    clearTimeout(completeTimeoutRef.current)
    mismatchTimeoutRef.current = null
    completeTimeoutRef.current = null
    flippedRef.current = []
    lockedRef.current = false
    doneRef.current = false
    flipAttemptsRef.current = 0
    mismatchesRef.current = 0
    matchStreakRef.current = 0
    peakMatchStreakRef.current = 0
    pairsFoundRef.current = 0
    startRef.current = Date.now()
    const deck = buildDeck(items, memoryPairs).map(t => ({ ...t, state: 'down' }))
    tilesRef.current = deck
    setTiles(deck)
    setLocked(false)
    setFlipAttempts(0)
    setMismatches(0)
    setMatchStreak(0)
    setPairsFound(0)
    setDone(false)
    setLastEvent(null)
    setCurrentElapsedMs(0)
    setNewBadges([])
    setPersonalBestResult(null)
  }

  useEffect(() => () => {
    clearTimeout(mismatchTimeoutRef.current)
    clearTimeout(completeTimeoutRef.current)
  }, [])

  function dismissIntro(dontShowAgainFlag) {
    setShowIntro(false)
    startRef.current = Date.now()
    if (dontShowAgainFlag) {
      updateSetting('introDismissed', { ...settings.introDismissed, [gameId]: true })
    }
  }

  return {
    tiles, locked, flipAttempts, mismatches, matchStreak, pairsFound,
    totalPairs: tiles.length / 2, done, lastEvent, newBadges, personalBestResult,
    currentElapsedMs, timerMode, animationsEnabled, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded: loaded, dontShowAgain, setDontShowAgain,
    flipTile, restart, dismissIntro,
  }
}
