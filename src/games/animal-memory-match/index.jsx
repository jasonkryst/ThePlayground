import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useMemorySession from '../../hooks/useMemorySession'
import { useShellGameStatus } from '../../components/ShellContext'
import MemoryBoard from '../../components/MemoryBoard'
import GameResults from '../../components/GameResults'
import GameIntro from '../../components/GameIntro'
import Timer from '../../components/Timer'
import { getSoundUrl } from '../../lib/soundLibrary'
import animals from './data/animals'
import manifest from './manifest.json'
import './AnimalMemoryMatchGame.css'

export default function AnimalMemoryMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    tiles, locked, matchStreak, pairsFound, totalPairs, done, lastEvent, newBadges, personalBestResult,
    currentElapsedMs, timerMode, animationsEnabled, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain,
    flipTile, restart, dismissIntro,
  } = useMemorySession({ gameId: 'animal-memory-match', items: animals })

  useShellGameStatus({ streak: matchStreak, sessionActive: introResolved && !showIntro && !done })

  const itemById = id => animals.find(a => a.id === id)

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'match' || !soundEffectsEnabled) return
    const url = getSoundUrl(itemById(lastEvent.itemId).sound)
    if (url) new Audio(url).play().catch(() => {})
  }, [lastEvent, soundEffectsEnabled])

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={manifest.name}
        instructions={t('animalMemoryMatch.howToPlay')}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={setDontShowAgain}
        onStart={() => dismissIntro(dontShowAgain)}
      />
    )
  }

  if (done) {
    return (
      <GameResults
        score={pairsFound}
        total={totalPairs}
        missed={[]}
        renderMissedItem={() => null}
        onPlayAgain={restart}
        onHome={() => onGameEnd(pairsFound, totalPairs)}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
      />
    )
  }

  if (tiles.length === 0) return null

  const liveMessage = !lastEvent ? ''
    : lastEvent.type === 'match' ? t('animalMemoryMatch.matchAnnounce', { name: t(itemById(lastEvent.itemId).nameKey) })
    : lastEvent.type === 'mismatch' ? t('animalMemoryMatch.noMatchAnnounce')
    : t('animalMemoryMatch.completeAnnounce')

  return (
    <div className="memory-game">
      <div className="memory-game__question">
        <div className="memory-game__progress">{t('animalMemoryMatch.progress', { found: pairsFound, total: totalPairs })}</div>
        <div className="memory-game__prompt">{t('animalMemoryMatch.prompt')}</div>
        {timerMode !== 'off' && <Timer elapsedMs={currentElapsedMs} mode="countUp" />}
      </div>

      <MemoryBoard
        tiles={tiles}
        onFlip={flipTile}
        renderFace={itemId => <span>{itemById(itemId).emoji}</span>}
        getFaceLabel={itemId => t(itemById(itemId).nameKey)}
        animationsEnabled={animationsEnabled}
        liveMessage={liveMessage}
      />
    </div>
  )
}
