import { useTranslation } from 'react-i18next'
import './ScoreHistory.css'

function formatScoreDate(isoDate, locale) {
  try {
    const [year, month, day] = isoDate.split('-').map(Number)
    // Validate parsed components to catch malformed dates early
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return isoDate
    }
    const date = new Date(year, month - 1, day)
    // Check if the date is valid
    if (Number.isNaN(date.getTime())) {
      return isoDate
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return isoDate
  }
}

export default function ScoreHistory({ scores = [] }) {
  const { t, i18n } = useTranslation()
  if (scores.length === 0) {
    return <p className="score-history__empty">{t('scoreHistory.empty')}</p>
  }
  return (
    <ul className="score-history">
      {scores.map(s => (
        <li key={s.timestamp} className="score-history__item">
          <span className="score-history__result">{s.score} / {s.total}</span>
          <span className="score-history__date">
            {s.date ? formatScoreDate(s.date, i18n.language) : new Date(s.timestamp).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  )
}
