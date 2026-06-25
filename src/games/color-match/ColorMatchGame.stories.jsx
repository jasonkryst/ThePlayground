import { useEffect, useRef } from 'react'
import ColorMatchGame from './index'

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

export default {
  title: 'Games/ColorMatchGame',
  component: ColorMatchGame,
  decorators: [pinRandom],
}

export const Default = { args: { onGameEnd: () => {} } }
