import { useTranslation } from 'react-i18next'
import './GameIntro.css'

export default function GameIntro({ icon, name, instructions, dontShowAgain, onDontShowAgainChange, onStart }) {
  const { t } = useTranslation()
  return (
    <main className="game-intro">
      <div className="game-intro__icon" aria-hidden="true">{icon}</div>
      <h1 className="game-intro__name">{name}</h1>
      <p className="game-intro__instructions">{instructions}</p>

      <label className="game-intro__checkbox-label">
        <input
          type="checkbox"
          data-testid="game-intro-dont-show-again"
          checked={dontShowAgain}
          onChange={e => onDontShowAgainChange(e.target.checked)}
        />
        {t('common.gameIntroDontShowAgain')}
      </label>

      <button className="game-intro__start" data-testid="game-intro-start" onClick={onStart}>
        {t('common.gameIntroStart')}
      </button>
    </main>
  )
}
