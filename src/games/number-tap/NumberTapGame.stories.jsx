import { useEffect, useRef } from 'react'
import NumberTapGame from './index'

// buildQuestionPool's icon/extra-count choice depends on Math.random -- pin
// it during this wrapper's render (parent-before-child) so the story's board
// is stable across re-renders, and restore it on unmount.
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
// resolves during the commit phase. Seed 'playground_settings' with
// introDismissed for this game during the wrapper's render so
// useGameSession() sees the intro as already dismissed on its very first
// settings read and renders gameplay, not the GameIntro screen. Merge with
// whatever's already in localStorage instead of clobbering it.
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
        introDismissed: { ...existing.introDismissed, 'number-tap': true },
      }))
    }
    return Story()
  }
  return <SeededIntroDismissed />
}

export default {
  title: 'Games/NumberTapGame',
  component: NumberTapGame,
  decorators: [pinRandom, seedIntroDismissed],
}

export const Default = { args: { onGameEnd: () => {} } }
