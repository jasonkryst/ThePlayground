import { useTranslation } from 'react-i18next'
import './OrientationOverlay.css'

// Presentational rotate prompt shown by OrientationGate when a game that
// requires landscape is viewed in portrait (issue #62). role="alert" makes
// its appearance announce immediately; the gate moves focus to the heading.
export default function OrientationOverlay({ headingRef }) {
  const { t } = useTranslation()

  return (
    <div className="orientation-overlay" role="alert" data-testid="orientation-overlay">
      <div className="orientation-overlay__icon" aria-hidden="true">📱</div>
      <h2 className="orientation-overlay__heading" tabIndex={-1} ref={headingRef}>
        {t('common.orientationOverlayHeading')}
      </h2>
      <p className="orientation-overlay__body">{t('common.orientationOverlayBody')}</p>
    </div>
  )
}
