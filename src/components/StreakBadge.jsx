import { useTranslation } from 'react-i18next'
import './StreakBadge.css'

export default function StreakBadge({ streak }) {
  const { t } = useTranslation()
  if (streak < 2) return null
  return (
    <span className="streak-badge" aria-live="polite">{t('common.streak', { streak })}</span>
  )
}
