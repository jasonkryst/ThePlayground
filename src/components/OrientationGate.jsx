import { useEffect, useMemo, useRef } from 'react'
import useOrientation from '../hooks/useOrientation'
import { OrientationGateContext } from './OrientationGateContext'
import OrientationOverlay from './OrientationOverlay'
import './OrientationGate.css'

const RECOGNIZED_ORIENTATIONS = ['landscape', 'portrait']

// Engine-level enforcement for a manifest's `"orientation"` field (issue
// #62). Children (the game) stay mounted while blocked so game state
// survives a rotation; they're made inert + aria-hidden under the overlay
// using the same setAttribute pattern as AppShell's exit dialog. The shell
// header/footer live outside this component, so the home button stays
// usable while the overlay is up.
export default function OrientationGate({ orientation, children }) {
  const required = RECOGNIZED_ORIENTATIONS.includes(orientation) ? orientation : null
  const current  = useOrientation()
  const blocked  = required != null && current !== required

  const contentRef       = useRef(null)
  const headingRef       = useRef(null)
  const previousFocusRef = useRef(null)

  const contextValue = useMemo(() => ({ blocked }), [blocked])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    if (blocked) {
      previousFocusRef.current = document.activeElement
      content.setAttribute('inert', '')
      content.setAttribute('aria-hidden', 'true')
      headingRef.current?.focus()
    } else {
      content.removeAttribute('inert')
      content.removeAttribute('aria-hidden')
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous && previous !== document.body && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [blocked])

  if (!required) {
    return (
      <OrientationGateContext.Provider value={contextValue}>
        {children}
      </OrientationGateContext.Provider>
    )
  }

  return (
    <OrientationGateContext.Provider value={contextValue}>
      <div className="orientation-gate">
        <div className="orientation-gate__content" ref={contentRef}>
          {children}
        </div>
        {blocked && <OrientationOverlay headingRef={headingRef} required={required} />}
      </div>
    </OrientationGateContext.Provider>
  )
}
