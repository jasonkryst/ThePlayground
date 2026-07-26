import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useSettings from '../hooks/useSettings'
import useParentalLockSession from '../hooks/useParentalLockSession'
import useFocusOnMount from '../hooks/useFocusOnMount'
import { getChallenge, verifyUnlock } from '../lib/parentalLock'
import './ParentalLockGate.css'

// Route-level gate for /admin and /parent (issue #127): a toddler-proofing
// challenge, not a real access-control boundary (see SECURITY.md). Children
// are never mounted while locked — not just visually hidden — so no
// settings/score data reaches the DOM pre-unlock. getChallenge/verifyUnlock
// (src/lib/parentalLock.js) own what counts as a valid answer; this
// component only renders the prompt and tracks the per-session unlock via
// useParentalLockSession.
export default function ParentalLockGate({ children }) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { unlocked, unlock } = useParentalLockSession()
  const [challenge, setChallenge] = useState(() => getChallenge(settings.parentalLock))
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const headingRef = useFocusOnMount()
  const inputRef = useRef(null)

  if (!settings.parentalLock?.enabled || unlocked) {
    return children
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (verifyUnlock(challenge, input)) {
      unlock()
      return
    }
    setError(true)
    setInput('')
    if (challenge.mode === 'math') {
      setChallenge(getChallenge(settings.parentalLock))
    }
    inputRef.current?.focus()
  }

  const prompt = challenge.mode === 'math'
    ? t('common.parentalLockMathPrompt', { a: challenge.a, b: challenge.b })
    : t('common.parentalLockPinPrompt')

  return (
    <div className="parental-lock-gate">
      <form className="parental-lock-gate__card" onSubmit={handleSubmit}>
        <h2 className="parental-lock-gate__heading" tabIndex={-1} ref={headingRef}>
          {t('common.parentalLockHeading')}
        </h2>
        <label className="parental-lock-gate__label" htmlFor="parental-lock-input">
          {prompt}
        </label>
        <input
          id="parental-lock-input"
          ref={inputRef}
          className="parental-lock-gate__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
        />
        <button type="submit" className="parental-lock-gate__submit">
          {t('common.parentalLockSubmitButton')}
        </button>
        {error && (
          <p className="parental-lock-gate__error" role="alert">
            {t('common.parentalLockWrongAnswer')}
          </p>
        )}
      </form>
    </div>
  )
}
