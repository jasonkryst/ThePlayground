import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useSoundPlayer from '../hooks/useSoundPlayer'
import { useShellGameStatus } from './ShellContext'
import GameIntro from './GameIntro'
import GameResults from './GameResults'
import GameChoiceGrid from './GameChoiceGrid'
import Timer from './Timer'
import { getSoundUrl } from '../lib/soundLibrary'
import './QuizGameShell.css'

// Engine scaffold shared by every quiz game (issue #65): intro/results
// wiring, question chrome, timer, chime layer, and the WCAG 4.1.3 live
// region. The game owns useGameSession and passes the session object in;
// slots (prompt, renderPromptExtra, getChoiceProps, renderChoiceContent,
// renderMissedItem) carry everything genuinely game-specific.
export default function QuizGameShell({
  session, manifest, onGameEnd, instructions, correctTestId,
  prompt, renderPromptExtra,
  getChoiceProps = () => ({}),
  renderChoiceContent, renderMissedItem,
}) {
  const { t } = useTranslation()
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, hintStrength, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges, lastEvent, soundEffectsEnabled,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = session

  useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done })

  // Chime layer: engine-level audio feedback on the session's semantic
  // events, on its own player instance so it can't cut off game-owned audio
  // (e.g. Animal Sounds' question clip).
  const { play } = useSoundPlayer()
  useEffect(() => {
    if (!lastEvent || !soundEffectsEnabled) return
    play(getSoundUrl(lastEvent.type === 'correct' ? 'chime-correct.wav' : 'chime-wrong.wav'))
  }, [lastEvent, soundEffectsEnabled, play])

  const announcement =
    lastEvent?.type === 'correct' ? t('common.answerCorrectAnnounce')
    : lastEvent?.type === 'wrong' ? t('common.answerWrongAnnounce')
    : ''

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={t(manifest.nameKey)}
        instructions={instructions}
        orientation={manifest.orientation}
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
        renderMissedItem={renderMissedItem}
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
      <span data-testid={correctTestId} style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{typeof prompt === 'function' ? prompt(current) : prompt}</div>
        {renderPromptExtra?.(current)}
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
        hintStrength={hintStrength}
        onChoose={handleChoice}
        getChoiceProps={getChoiceProps}
        renderChoiceContent={renderChoiceContent}
      />

      {/* AU-2 (WCAG 4.1.3): persistent live region so correct/wrong reach
          screen readers; mirrors MemoryBoard's per-event live message.
          Timeout is intentionally silent here: the visible .game__timeout
          row below is itself a role="status" region that announces on
          appearance, so announcing timeout here too would double-announce
          and duplicate the on-screen text. */}
      <div className="sr-only" role="status" data-testid="quiz-live-region">{announcement}</div>

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </div>
  )
}
