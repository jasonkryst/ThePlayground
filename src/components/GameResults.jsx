import { useTranslation } from 'react-i18next'
import useFocusOnMount from '../hooks/useFocusOnMount'
import './GameResults.css'

export default function GameResults({
  score, total, missed, onPlayAgain, onHome, renderMissedItem,
  offerDifficultyBump = false, numChoices, onAcceptDifficultyBump, onDismissDifficultyBump,
  personalBestResult = null, newBadges = [],
}) {
  const { t } = useTranslation()
  const headingRef = useFocusOnMount()

  return (
    <div className="results">
      <h2 className="sr-only" tabIndex={-1} ref={headingRef}>{t('common.resultsHeading')}</h2>
      <div className="results__emoji">{missed.length === 0 ? '🎉' : '⭐'}</div>
      <div className="results__score">{score} / {total}</div>
      <div className="results__label">{t('common.scoreLabel', { score, total })}</div>

      {personalBestResult?.accuracy?.isNewRecord && (
        <div className="results__record">
          {t('common.newAccuracyRecord', {
            score, total,
            prevScore: personalBestResult.accuracy.previous.score,
            prevTotal: personalBestResult.accuracy.previous.total,
          })}
        </div>
      )}

      {personalBestResult?.speed?.isNewRecord && (
        <div className="results__record">
          {t('common.newSpeedRecord', {
            seconds: (personalBestResult.speed.value / 1000).toFixed(1),
            prevSeconds: (personalBestResult.speed.previous.avgMs / 1000).toFixed(1),
          })}
        </div>
      )}

      {newBadges.map(badge => (
        <div key={badge.id} className="results__badge-award">
          {t('common.newBadgeAnnounce')} {badge.icon} {t(badge.nameKey)}
        </div>
      ))}

      {missed.length === 0 ? (
        <div className="results__label">{t('common.perfectRun')}</div>
      ) : (
        <div>
          <div className="results__missed-heading">{t('common.missedHeading')}</div>
          <ul className="results__missed">
            {missed.map((item, i) => (
              <li key={`${item.id}-${i}`}>{renderMissedItem(item)}</li>
            ))}
          </ul>
        </div>
      )}

      {offerDifficultyBump && (
        <div className="results__difficulty-offer">
          <div className="results__label">{t('common.difficultyOfferHeading', { count: numChoices + 1 })}</div>
          <div className="results__actions">
            <button className="results__btn results__btn--play" onClick={onAcceptDifficultyBump}>
              {t('common.difficultyOfferAccept')}
            </button>
            <button className="results__btn results__btn--home" onClick={onDismissDifficultyBump}>
              {t('common.difficultyOfferDismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="results__actions">
        <button className="results__btn results__btn--play" onClick={onPlayAgain}>{t('common.playAgain')}</button>
        <button className="results__btn results__btn--home" onClick={onHome}>{t('common.home')}</button>
      </div>
    </div>
  )
}
