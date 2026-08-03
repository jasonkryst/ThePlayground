import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSpeech from '../../hooks/useSpeech'
import useQuestionAudio from '../../hooks/useQuestionAudio'
import QuizGameShell from '../../components/QuizGameShell'
import ReplayButton from '../../components/ReplayButton'
import foods from './data/foods'
import manifest from './manifest.json'

const CHOICE_COLORS = [
  'var(--color-lavender-dark)',
  'var(--color-teal-dark)',
  'var(--color-aqua-dark)',
  'var(--color-lilac-dark)',
]

export default function FruitVeggieIdGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'fruit-veggie-id', items: foods })
  const { current, index, done, showIntro, introResolved, resumeAvailable } = session

  // The spoken name is the question itself, so it plays regardless of the
  // shell's soundEffectsEnabled chime setting. useQuestionAudio owns the
  // announce/stop lifecycle; useSpeech is the audio source.
  const { speak, cancel, supported, blocked } = useSpeech()
  // Only attempt speech when the browser supports it; the fallback path names
  // the target in the prompt instead, so there is nothing to announce.
  const announce = useCallback(food => {
    if (supported) speak(t(food.correct.nameKey))
  }, [supported, speak, t])
  const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, resumeAvailable, announce, stop: cancel })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('fruitVeggie.howToPlay')}
      correctTestId="correct-food-id"
      // Picture-only choices, so a spoken prompt is not spoiled by on-screen
      // text. When speech is unavailable, name the target so a parent can guide.
      prompt={q => supported ? t('fruitVeggie.prompt') : t('fruitVeggie.promptFallback', { name: t(q.correct.nameKey) })}
      renderPromptExtra={() => supported
        ? <ReplayButton labelKey="fruitVeggie.replay" blocked={blocked} onClick={replay} />
        : null}
      getChoiceProps={(food, i) => ({
        style: { background: CHOICE_COLORS[i % CHOICE_COLORS.length] },
        'data-food-id': food.id,
        'aria-label': t(food.nameKey),
      })}
      renderChoiceContent={food => (
        <span className="game__choice-emoji" aria-hidden="true">{food.emoji}</span>
      )}
      renderMissedItem={food => (
        <>
          <span aria-hidden="true">{food.emoji}</span> {t(food.nameKey)}
        </>
      )}
    />
  )
}
