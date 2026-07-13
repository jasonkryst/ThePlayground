import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSoundPlayer from '../../hooks/useSoundPlayer'
import QuizGameShell from '../../components/QuizGameShell'
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
  const session = useGameSession({ gameId: 'animal-sounds', items: animals })
  const { current, index, done, showIntro, introResolved } = session

  // Game-owned question audio: its own player instance, independent of the
  // shell's chime layer.
  const { play, stop: stopSound } = useSoundPlayer()

  const playSound = useCallback(() => {
    if (!current) return
    play(getSoundUrl(current.correct.sound))
  }, [current, play])

  useEffect(() => {
    if (!current) return

    // Stop any in-flight audio when moving away from this question.
    return () => {
      stopSound()
    }
  }, [current, stopSound])

  useEffect(() => {
    if (!current || showIntro || !introResolved) return
    playSound()
  }, [index, playSound, current, showIntro, introResolved])

  useEffect(() => {
    if (done || showIntro) {
      stopSound()
    }
  }, [done, showIntro, stopSound])

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('animalSounds.howToPlay')}
      correctTestId="correct-animal-id"
      prompt={t('animalSounds.prompt')}
      renderPromptExtra={() => (
        <button className="game__replay" aria-label={t('animalSounds.replay')} onClick={playSound}>🔊</button>
      )}
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
      renderMissedItem={animal => (
        <>
          <span aria-hidden="true">{animal.emoji}</span> {t(animal.nameKey)}
        </>
      )}
    />
  )
}
