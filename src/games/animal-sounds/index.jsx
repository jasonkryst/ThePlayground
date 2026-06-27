import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import StreakBadge from '../../components/StreakBadge'
import GameResults from '../../components/GameResults'
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
    current, index, total, answered, selected, score, streak, missed, done,
    feedbackMode, handleChoice, advance, restart,
  } = useGameSession({ gameId: 'animal-sounds', items: animals })

  const audioRef = useRef(null)

  function playSound() {
    if (!current) return
    const url = getSoundUrl(current.correct.sound)
    if (!url) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => {})
  }

  useEffect(() => {
    if (!current) return
    playSound()
  }, [index, current])

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
      </div>

      <div className="game__choices">
        {current.choices.map((animal, i) => {
          const isSelected = selected === animal.id
          const isCorrect  = animal.id === current.correct.id
          let cls = 'game__choice'
          if (answered && isSelected && isCorrect)  cls += ' correct'
          if (answered && isSelected && !isCorrect) cls += ' wrong'
          if (answered && !isSelected && isCorrect) cls += ' highlight-correct'

          return (
            <button
              key={animal.id}
              className={cls}
              style={{ background: CHOICE_COLORS[i % CHOICE_COLORS.length] }}
              disabled={answered}
              onClick={() => handleChoice(animal)}
              data-animal-id={animal.id}
            >
              {animal.emoji}
              <span className="game__choice-name">{t(animal.nameKey)}</span>
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
