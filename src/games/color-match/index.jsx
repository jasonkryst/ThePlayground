import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import QuizGameShell from '../../components/QuizGameShell'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'color-match', items: colors })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('colorMatch.howToPlay')}
      correctTestId="correct-color-id"
      prompt={t('colorMatch.prompt')}
      renderPromptExtra={current => (
        <div className="game__swatch" style={{ background: current.correct.color }} />
      )}
      getChoiceProps={color => ({
        style: { background: color.color, color: color.textColor },
        className: BORDERED_IDS.has(color.id) ? 'game__choice--bordered' : undefined,
        'data-color-id': color.id,
      })}
      renderChoiceContent={color => (
        <>
          {color.emoji}
          <span className="game__choice-name">{t(color.nameKey)}</span>
        </>
      )}
      renderMissedItem={color => (
        <>
          <span
            aria-hidden="true"
            style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: color.color, verticalAlign: 'middle' }}
          />{' '}
          {t(color.nameKey)}
        </>
      )}
    />
  )
}
