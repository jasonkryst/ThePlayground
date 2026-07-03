import { useTranslation } from 'react-i18next'
import './Timer.css'

export default function Timer({ elapsedMs, mode = 'countUp', limitMs }) {
  const { t } = useTranslation()
  const displayMs = mode === 'countdown' ? Math.max(0, limitMs - elapsedMs) : elapsedMs
  const seconds = (displayMs / 1000).toFixed(1)
  const isTimeUp = mode === 'countdown' && displayMs === 0

  return (
    <div className={`timer${isTimeUp ? ' timer--up' : ''}`} aria-label={t('common.timerAriaLabel', { seconds })}>
      <span className="timer__icon" aria-hidden="true">⏱️</span>
      <span className="timer__value">{seconds}s</span>
    </div>
  )
}
