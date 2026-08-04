import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import useSpeech from '../../hooks/useSpeech'
import useQuestionAudio from '../../hooks/useQuestionAudio'
import QuizGameShell from '../../components/QuizGameShell'
import ReplayButton from '../../components/ReplayButton'
import emotions from './data/emotions'
import manifest from './manifest.json'

export default function EmotionsMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'emotions-match', items: emotions })
  const { current, index, done, showIntro, introResolved, resumeAvailable } = session

  // Unlike Fruit & Veggie ID, the emotion word IS the prompt (shown on
  // screen, never hidden) -- so speaking it aloud carries no spoiler risk.
  // It's there purely to help pre-readers, consistent with this app's
  // toddler/infant audience.
  const { speak, cancel, supported, blocked } = useSpeech()
  const announce = useCallback(emotion => {
    if (supported) speak(t(emotion.correct.nameKey))
  }, [supported, speak, t])
  const replay = useQuestionAudio({ index, current, showIntro, introResolved, done, resumeAvailable, announce, stop: cancel })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('emotionsMatch.howToPlay')}
      correctTestId="correct-emotion-id"
      prompt={q => t('emotionsMatch.prompt', { emotion: t(q.correct.nameKey) })}
      renderPromptExtra={() => supported
        ? <ReplayButton labelKey="emotionsMatch.replay" blocked={blocked} onClick={replay} />
        : null}
      getChoiceProps={emotion => ({
        'data-emotion-id': emotion.id,
        'aria-label': t(emotion.nameKey),
      })}
      renderChoiceContent={emotion => (
        <span className="game__choice-emoji" aria-hidden="true">{emotion.emoji}</span>
      )}
      renderMissedItem={emotion => (
        <>
          <span aria-hidden="true">{emotion.emoji}</span> {t(emotion.nameKey)}
        </>
      )}
    />
  )
}
