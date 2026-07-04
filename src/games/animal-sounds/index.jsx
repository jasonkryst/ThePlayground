import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
import GameChoiceGrid from '../../components/GameChoiceGrid'
import Timer from '../../components/Timer'
import GameIntro from '../../components/GameIntro'
import animals from './data/animals'
import { getSoundUrl } from './data/sounds'
import manifest from './manifest.json'
import './AnimalSoundsGame.css'

const CHOICE_COLORS = [
  'var(--color-lavender-dark)',
  'var(--color-teal-dark)',
  'var(--color-aqua-dark)',
  'var(--color-lilac-dark)',
]

export default function AnimalSoundsGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    current, index, total, locked, disabledChoiceIds, hintActive, selected,
    score, streak, missed, done, feedbackMode, handleChoice, advance, restart,
    currentElapsedMs, timerMode, timeLimitMs, timedOut, offerDifficultyBump, numChoices,
    personalBestResult, newBadges,
    acceptDifficultyBump, dismissDifficultyBump,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain, dismissIntro,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })

  const audioRef = useRef(null)

  const stopSound = useCallback(() => {
    if (!audioRef.current) return
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    audioRef.current = null
  }, [])

  const playSound = useCallback(() => {
    if (!current) return
    const url = getSoundUrl(current.correct.sound)
    if (!url) return
    stopSound()
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [current, stopSound])

  useEffect(() => {
    if (!current) return

    // Stop any in-flight audio when moving away from this question.
    return () => {
      stopSound()
    }
  }, [current, stopSound])

  useEffect(() => {
    return () => {
      stopSound()
    }
  }, [stopSound])

  useEffect(() => {
    if (!current || showIntro || !introResolved) return
    playSound()
  }, [index, playSound, current, showIntro, introResolved])

  useEffect(() => {
    if (done || showIntro) {
      stopSound()
    }
  }, [done, showIntro, stopSound])

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('animalSounds.howToPlay')}
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
        renderMissedItem={animal => (
          <>
            <span aria-hidden="true">{animal.emoji}</span> {t(animal.nameKey)}
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
    <main className="game">
      {/* Hidden testid so tests can find the correct answer id */}
      <span data-testid="correct-animal-id" style={{ display: 'none' }}>{current.correct.id}</span>

      <div className="game__header">
        <h1 className="game__name">{manifest.name}</h1>
        <StreakBadge streak={streak} />
        <span className="game__version">v{manifest.version}</span>
      </div>

      <div className="game__question">
        <div className="game__progress">{t('common.progress', { current: index + 1, total })}</div>
        <div className="game__prompt">{t('animalSounds.prompt')}</div>
        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={playSound}>🔊</button>
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
        getChoiceProps={(animal, i) => ({
          style: { background: CHOICE_COLORS[i % CHOICE_COLORS.length] },
          'data-animal-id': animal.id,
        })}
        renderChoiceContent={animal => (
          <>
            {animal.emoji}
            <span className="game__choice-name">{t(animal.nameKey)}</span>
          </>
        )}
      />

      {timedOut && <div className="game__timeout" role="status">{t('common.timeUp')}</div>}

      {locked && feedbackMode === 'parent-tap' && !timedOut && (
        <button className="game__next" onClick={advance}>{t('common.next')}</button>
      )}
    </main>
  )
}
