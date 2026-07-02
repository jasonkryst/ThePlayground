import { useTranslation } from 'react-i18next'
import './Timer.css'

export default function Timer({ elapsedMs }) {
  const { t } = useTranslation()
  const seconds = (elapsedMs / 1000).toFixed(1)
  return (
    <div className="timer" aria-label={t('common.timerAriaLabel', { seconds })}>
      <span className="timer__icon" aria-hidden="true">⏱️</span>
      <span className="timer__value">{seconds}s</span>
    </div>
  )
}
