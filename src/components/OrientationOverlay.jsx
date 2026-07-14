import { useTranslation } from 'react-i18next'
import './OrientationOverlay.css'

// Presentational rotate prompt shown by OrientationGate when a game that
// requires an orientation is viewed the wrong way (issues #62/#65).
// role="alert" makes its appearance announce immediately; the gate moves
// focus to the heading.
export default function OrientationOverlay({ headingRef, required = 'landscape' }) {
  const { t } = useTranslation()
  const portrait = required === 'portrait'

  return (
    <div className="orientation-overlay" role="alert" data-testid="orientation-overlay">
      <div
        className={`orientation-overlay__icon${portrait ? ' orientation-overlay__icon--portrait' : ''}`}
        aria-hidden="true"
      >
        📱
      </div>
      <h2 className="orientation-overlay__heading" tabIndex={-1} ref={headingRef}>
        {t(portrait ? 'common.orientationOverlayHeadingPortrait' : 'common.orientationOverlayHeading')}
      </h2>
      <p className="orientation-overlay__body">
        {t(portrait ? 'common.orientationOverlayBodyPortrait' : 'common.orientationOverlayBody')}
      </p>
    </div>
  )
}
