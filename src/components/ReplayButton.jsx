import { useTranslation } from 'react-i18next'
import './ReplayButton.css'

// Shared 🔊 replay affordance for question-audio games (Animal Sounds,
// Fruit & Veggie ID). `blocked` drives the AU-8 recovery hint: a pulsing
// ring plus a visible "tap to hear" caption, aimed at a supervising adult
// since a pre-literate child can't read the hint themselves.
export default function ReplayButton({ labelKey, blocked, onClick }) {
  const { t } = useTranslation()
  const label = t(labelKey)
  const hint = t('common.tapToHear')

  return (
    <div className="replay-button">
      <button
        className={`game__replay${blocked ? ' game__replay--blocked' : ''}`}
        aria-label={blocked ? `${label} — ${hint}` : label}
        onClick={onClick}
      >🔊</button>
      {blocked && <div className="replay-button__hint" role="status">{hint}</div>}
    </div>
  )
}
