import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import { useShellGameStatus } from '../../components/ShellContext'
import GameResults from '../../components/GameResults'
import GameChoiceGrid from '../../components/GameChoiceGrid'
import Timer from '../../components/Timer'
import GameIntro from '../../components/GameIntro'
import colors from './data/colors'
import manifest from './manifest.json'
import './ColorMatchGame.css'

const BORDERED_IDS = new Set(['white', 'gray'])

export default function ColorMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'color-match', items: colors })

  useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('colorMatch.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }

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
        offerDifficultyBump={offerDifficultyBump}
        numChoices={numChoices}
        onAcceptDifficultyBump={acceptDifficultyBump}
        onDismissDifficultyBump={dismissDifficultyBump}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
    )
  }

  if (!current) return null

  return (
    <div className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-color-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('colorMatch.prompt')}</div>
        <div className="game__swatch" style={{ background: current.correct.color }} />
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
      </div>

      <GameChoiceGrid
        choices={current.choices}
        correctId={current.correct.id}
        selected={selected}
        locked={locked}
        disabledChoiceIds={disabledChoiceIds}
        hintActive={hintActive}
        onChoose={handleChoice}
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
      />

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </div>
  )
}
