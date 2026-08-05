import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSoundPlayer from '../../hooks/useSoundPlayer'
import { useShellGameStatus } from '../../components/ShellContext'
import GameIntro from '../../components/GameIntro'
import GameResults from '../../components/GameResults'
import ResumePrompt from '../../components/ResumePrompt'
import Timer from '../../components/Timer'
import { getSoundUrl } from '../../lib/soundLibrary'
import buildQuestionPool from './utils/buildQuestionPool'
import numbers from './data/numbers'
import objectTypes from './data/objects'
import manifest from './manifest.json'
import '../../components/QuizGameShell.css'
import '../../components/GameChoiceGrid.css'
import './NumberTapGame.css'

export default function NumberTapGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'number-tap', items: numbers })
  const {
    current, index, total, locked, hintActive, hintStrength,
    score, streak, missed, done, feedbackMode, handleAttempt, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut,
    personalBestResult, newBadges, lastEvent, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
    resumeAvailable, acceptResume, declineResume,
  } = session

  useShellGameStatus({ streak, sessionActive: introResolved && !showIntro && !done && !resumeAvailable })

  const { play } = useSoundPlayer()
  useEffect(() => {
    if (!lastEvent || !soundEffectsEnabled) return
    play(getSoundUrl(lastEvent.type === 'correct' ? 'chime-correct.wav' : 'chime-wrong.wav'))
  }, [lastEvent, soundEffectsEnabled, play])

  const [tappedIds, setTappedIds] = useState([])
  const [lastOutcomeCorrect, setLastOutcomeCorrect] = useState(null)

  // Fresh board every question.
  useEffect(() => { setTappedIds([]); setLastOutcomeCorrect(null) }, [index])
  // A countdown timeout resolves the question without ever pressing Done.
  useEffect(() => { if (timedOut) setLastOutcomeCorrect(false) }, [timedOut])

  const { objects } = useMemo(() => {
    if (!current) return { objects: [] }
    return buildQuestionPool(current.correct.value, objectTypes)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pool per question, not per render
  }, [current?.correct?.id])

  function toggleObject(id) {
    if (locked) return
    setTappedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleDone() {
    if (locked) return
    const isCorrect = tappedIds.length === current.correct.value
    setLastOutcomeCorrect(isCorrect)
    if (!isCorrect) setTappedIds([])
    handleAttempt(isCorrect)
  }

  if (!settingsLoaded) return null

  if (resumeAvailable) {
    return <ResumePrompt index={index} total={total} score={score} onResume={acceptResume} onStartFresh={declineResume} />
  }

  if (!introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={t(manifest.nameKey)}
        instructions={t('numberTap.howToPlay')}
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
        renderMissedItem={item => <>{t('numberTap.prompt', { count: item.value })}</>}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
        accentColor={manifest.color}
        gameType={manifest.gameType}
      />
    )
  }

  if (!current) return null

  const announcement =
    lastEvent?.type === 'correct' ? t('common.answerCorrectAnnounce')
    : lastEvent?.type === 'wrong' ? t('common.answerWrongAnnounce')
    : ''

  const target = current.correct.value

  return (
    <div className="game">
      <span data-testid="correct-number-id" data-value={target} style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('numberTap.prompt', { count: target })}</div>
        {timerMode !== 'off' && (
          <Timer elapsedMs={currentElapsedMs} mode={timerMode === 'countdown' ? 'countdown' : 'countUp'} limitMs={timeLimitMs} />
        )}
      </div>

      <div className="game__choices">
        {objects.map((obj, i) => {
          const isTapped = tappedIds.includes(obj.id)
          const isHintedCorrect = hintActive && !locked && !isTapped && i < target
          const isRevealed = locked && i < target

          let cls = 'game__choice number-tap__object'
          if (isTapped) cls += ' number-tap__object--tapped'
          if (locked && isTapped && lastOutcomeCorrect) cls += ' correct'
          if (locked && isTapped && !lastOutcomeCorrect) cls += ' wrong'
          if ((isHintedCorrect || isRevealed) && !isTapped) cls += ' highlight-correct'

          const style = isHintedCorrect ? { '--hint-strength': hintStrength } : undefined

          return (
            <button
              key={obj.id}
              type="button"
              className={cls}
              style={style}
              data-object-id={obj.id}
              aria-pressed={isTapped}
              aria-disabled={locked}
              aria-label={t('numberTap.objectLabel', { name: t(obj.nameKey), index: i + 1 })}
              onClick={() => toggleObject(obj.id)}
            >
              <span aria-hidden="true">{obj.emoji}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="number-tap__done"
        data-testid="number-tap-done"
        aria-disabled={locked}
        onClick={handleDone}
      >
        {t('numberTap.done')} ✓
      </button>

      <div className="sr-only" role="status" data-testid="quiz-live-region">{announcement}</div>

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </div>
  )
}
