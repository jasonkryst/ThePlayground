import { useEffect, useRef } from 'react'
import CharacterMatchGameBluey from './index'

// The game's shuffle runs inside a useEffect gated on settings loaded from
// useSettings(), so it fires during React's commit phase — after a plain
// decorator function would already have returned. Override Math.random
// during this wrapper's render (renders run parent-before-child, so the
// override is active before the story's own render/effects) and restore it
// on unmount, so the pin covers the story for as long as it's displayed
// without leaking into whatever story is viewed next.
const pinRandom = (Story) => {
  function PinnedRandom() {
    const original = useRef(null)
    if (original.current === null) {
      original.current = Math.random
      Math.random = () => 0.5
    }
    useEffect(() => () => {
      Math.random = original.current
    }, [])
    return Story()
  }
  return <PinnedRandom />
}

// useSettings() loads settings from localStorage inside an async effect that
// resolves during the commit phase, same timing hazard as pinRandom above.
// Seed 'playground_settings' with introDismissed for this game during the
// wrapper's render (parent-before-child) so useGameSession() sees the intro
// as already dismissed on its very first settings read and renders gameplay,
// not the GameIntro screen. Merge with whatever's already in localStorage
// (e.g. from other stories sharing the same browser context) instead of
// clobbering it.
const seedIntroDismissed = (Story) => {
  function SeededIntroDismissed() {
    const seeded = useRef(false)
    if (!seeded.current) {
      seeded.current = true
      let existing = {}
      try {
        const parsed = JSON.parse(localStorage.getItem('playground_settings') || '{}')
        existing = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        existing = {}
      }
      localStorage.setItem('playground_settings', JSON.stringify({
        ...existing,
        introDismissed: { ...existing.introDismissed, 'character-match-bluey': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/CharacterMatchGameBluey',
  component: CharacterMatchGameBluey,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
