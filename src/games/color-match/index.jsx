import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, answered, selected, score, streak, missed, done,
    feedbackMode, handleChoice, advance, restart,
  } = useGameSession({ gameId: 'color-match', items: colors })

  if (done) {
    return (
      <GameResults
        score={score}
        total={total}
        missed={missed}
        onPlayAgain={restart}
        onHome={() => onGameEnd(score, total)}
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

  if (!current) return null

  return (
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-color-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <StreakBadge streak={streak} />
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('colorMatch.prompt')}</div>
        <div className="game__swatch" style={{ background: current.correct.color }} />
      </div>

      <div className="game__choices">
        {current.choices.map(color => {
          const isSelected = selected === color.id
          const isCorrect  = color.id === current.correct.id
          let cls = 'game__choice'
          if (BORDERED_IDS.has(color.id)) cls += ' game__choice--bordered'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={color.id}
              className={cls}
              style={{ background: color.color, color: color.textColor }}
              disabled={answered}
              onClick={() => handleChoice(color)}
              data-color-id={color.id}
            >
              {color.emoji}
              <span className="game__choice-name">{t(color.nameKey)}</span>
            </button>
          )
        })}
      </div>

      {answered && feedbackMode === 'parent-tap' && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
