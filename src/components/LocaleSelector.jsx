import { useTranslation } from 'react-i18next'

export default function LocaleSelector({ locales, value, onChange }) {
  const { t } = useTranslation()
  if (locales.length < 2) return null

  return (
    <div className="admin__section">
      <h2>{t('admin.localeHeading')}</h2>
      <select
        className="admin__text-input"
        aria-label={t('admin.localeHeading')}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {locales.map(loc => (
          <option key={loc} value={loc}>{loc}</option>
        ))}
      </select>
    </div>
  )
}
