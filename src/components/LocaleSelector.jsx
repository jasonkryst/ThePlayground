import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

const LOCALE_NAMES = { en: 'English', es: 'Español', pl: 'Polski' }

export default function LocaleSelector({ locales, value, onChange }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const confirmTimeoutRef = useRef(null)
  useEffect(() => () => clearTimeout(confirmTimeoutRef.current), [])

  if (locales.length < 2) return null

  function handleChange(e) {
    onChange(e.target.value)
    clearTimeout(confirmTimeoutRef.current)
    setConfirming(true)
    confirmTimeoutRef.current = setTimeout(() => setConfirming(false), 3000)
  }

  return (
    <div className="admin__section">
      <h2>{t('admin.localeHeading')}</h2>
      <select
        className="admin__text-input"
        aria-label={t('admin.localeHeading')}
        value={value}
        onChange={handleChange}
      >
        {locales.map(loc => (
          <option key={loc} value={loc}>{LOCALE_NAMES[loc] ?? loc}</option>
        ))}
      </select>
      {confirming && <p role="status">{t('admin.localeUpdated')}</p>}
    </div>
  )
}
