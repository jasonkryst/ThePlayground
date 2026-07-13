import { useTranslation } from 'react-i18next'
import useGameSession from '../../hooks/useGameSession'
import QuizGameShell from '../../components/QuizGameShell'
import characters from './data/characters'
import { getImageUrl } from './data/images'
import manifest from './manifest.json'
import './CharacterMatchGame.css'

export default function CharacterMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const session = useGameSession({ gameId: 'character-match', items: characters })

  return (
    <QuizGameShell
      session={session}
      manifest={manifest}
      onGameEnd={onGameEnd}
      instructions={t('characterMatch.howToPlay')}
      correctTestId="correct-character-id"
      prompt={current => t('characterMatch.prompt', { name: t(current.correct.nameKey) })}
      getChoiceProps={character => ({
        'data-character-id': character.id,
      })}
      renderChoiceContent={character => (
        <>
          <img src={getImageUrl(character.image)} alt="" className="game__choice-image" />
          <span className="game__choice-name">{t(character.nameKey)}</span>
        </>
      )}
      renderMissedItem={character => (
        <>
          <img
            src={getImageUrl(character.image)}
            alt=""
            style={{ display: 'inline-block', width: 20, height: 20, objectFit: 'contain', verticalAlign: 'middle' }}
          />{' '}
          {t(character.nameKey)}
        </>
      )}
    />
  )
}
