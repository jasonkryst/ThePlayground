import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './ExitConfirmDialog.css'

// Kid-safe exit guard: leaving a game mid-session takes two deliberate taps
// in different screen regions. Chosen over press-and-hold so keyboard and
// switch-access users get the same protection (see design spec).
export default function ExitConfirmDialog({ onResume, onLeave }) {
  const { t } = useTranslation()
  const keepRef = useRef(null)
  const leaveRef = useRef(null)

  useEffect(() => { keepRef.current?.focus() }, [])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      onResume()
      return
    }
    if (e.key === 'Tab') {
      // Only two focusables exist; toggle between them to trap focus.
      e.preventDefault()
      const next = document.activeElement === keepRef.current ? leaveRef.current : keepRef.current
      next?.focus()
    }
  }

  return (
    <div
      className="exit-confirm__backdrop"
      data-testid="exit-confirm-backdrop"
      role="presentation"
      onClick={onResume}
    >
      {/* stopPropagation so clicks inside the card don't hit the backdrop resume handler */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keydown implements the dialog's focus trap, not a click alternative */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-confirm-title"
        className="exit-confirm"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="exit-confirm-title" className="exit-confirm__title">{t('shell.exitConfirmTitle')}</h2>
        <button ref={keepRef} className="exit-confirm__keep" onClick={onResume}>
          {t('shell.keepPlaying')}
        </button>
        <button ref={leaveRef} className="exit-confirm__leave" onClick={onLeave}>
          {t('shell.leaveGame')}
        </button>
      </div>
    </div>
  )
}
