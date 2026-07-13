import { useState, useEffect } from 'react'

// Effective screen orientation for layout enforcement (issue #62).
// Hybrid detection: coarse-pointer (touch) devices report the physical
// device orientation via screen.orientation; desktop — and any browser
// without screen.orientation (older iOS Safari) — falls back to the
// viewport aspect ratio. Missing APIs degrade to 'landscape' so a broken
// environment can never strand the player behind the rotate overlay.

function isCoarsePointer() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

function usesDeviceOrientation() {
  return isCoarsePointer() && typeof window.screen?.orientation?.type === 'string'
}

function getOrientation() {
  if (usesDeviceOrientation()) {
    return window.screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape'
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait'
  }
  return 'landscape'
}

export default function useOrientation() {
  const [orientation, setOrientation] = useState(getOrientation)

  useEffect(() => {
    const update = () => setOrientation(getOrientation())

    if (usesDeviceOrientation()) {
      const listener = window.screen.orientation
      listener.addEventListener('change', update)
      return () => listener.removeEventListener('change', update)
    }
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(orientation: landscape)')
      mql.addEventListener('change', update)
      return () => mql.removeEventListener('change', update)
    }
    return undefined
  }, [])

  return orientation
}
