import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import useMemorySession from '../../hooks/useMemorySession'
import useSoundPlayer from '../../hooks/useSoundPlayer'
import { useShellGameStatus } from '../../components/ShellContext'
import MemoryBoard from '../../components/MemoryBoard'
import GameResults from '../../components/GameResults'
import GameIntro from '../../components/GameIntro'
import Timer from '../../components/Timer'
import { getSoundUrl } from '../../lib/soundLibrary'
import sounds from './data/sounds'
import manifest from './manifest.json'
import './SoundMemoryMatchGame.css'

export default function SoundMemoryMatchGame({ onGameEnd }) {
  const { t } = useTranslation()
  const {
    tiles, locked, matchStreak, pairsFound, totalPairs, done, lastEvent, newBadges, personalBestResult,
    currentElapsedMs, timerMode, animationsEnabled, soundEffectsEnabled,
    showIntro, introResolved, settingsLoaded, dontShowAgain, setDontShowAgain,
    flipTile, restart, dismissIntro,
  } = useMemorySession({ gameId: 'sound-memory-match', items: sounds })

  useShellGameStatus({ streak: matchStreak, sessionActive: introResolved && !showIntro && !done })
  const { play, stop } = useSoundPlayer()

  const itemById = id => sounds.find(s => s.id === id)

  // The tile's sound IS its face (issue #131): a picture-memory game reveals
  // the item on flip, so this one plays its clip on flip instead — matching
  // happens by ear, not by sight. Mirror flipTile's own down/locked guard so
  // a click that would be a no-op in the engine (already up, mid-mismatch
  // lock) never fires a clip either.
  const handleFlip = useCallback(tileId => {
    const tile = tiles.find(candidate => candidate.tileId === tileId)
    if (tile && tile.state === 'down' && !locked && soundEffectsEnabled) {
      play(getSoundUrl(itemById(tile.itemId).sound))
    }
    flipTile(tileId)
  }, [tiles, locked, soundEffectsEnabled, play, flipTile])

  // A long clip must not keep playing over the results screen (issue #52).
  useEffect(() => {
    if (done) stop()
  }, [done, stop])

  if (!settingsLoaded || !introResolved) return null

  if (showIntro) {
    return (
      <GameIntro
        icon={manifest.icon}
        name={t(manifest.nameKey)}
        instructions={t('soundMemoryMatch.howToPlay')}
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
        score={pairsFound}
        total={totalPairs}
        missed={[]}
        renderMissedItem={() => null}
        onPlayAgain={restart}
        onHome={() => onGameEnd(pairsFound, totalPairs)}
        personalBestResult={personalBestResult}
        newBadges={newBadges}
        accentColor={manifest.color}
        gameType={manifest.gameType}
      />
    )
  }

  if (tiles.length === 0) return null

  const liveMessage = !lastEvent ? ''
    : lastEvent.type === 'match' ? t('soundMemoryMatch.matchAnnounce', { name: t(itemById(lastEvent.itemId).nameKey) })
    : lastEvent.type === 'mismatch' ? t('soundMemoryMatch.noMatchAnnounce')
    : t('soundMemoryMatch.completeAnnounce')

  return (
    <div className="game memory-game">
      <div className="memory-game__question">
        <div className="memory-game__progress">{t('soundMemoryMatch.progress', { found: pairsFound, total: totalPairs })}</div>
        <div className="memory-game__prompt">{t('soundMemoryMatch.prompt')}</div>
        {timerMode !== 'off' && <Timer elapsedMs={currentElapsedMs} mode="countUp" />}
      </div>

      <MemoryBoard
        tiles={tiles}
        onFlip={handleFlip}
        renderFace={(itemId, tileState) => (
          tileState === 'matched'
            ? <span>{itemById(itemId).emoji}</span>
            : <span aria-hidden="true">🔊</span>
        )}
        getFaceLabel={itemId => t(itemById(itemId).nameKey)}
        animationsEnabled={animationsEnabled}
        liveMessage={liveMessage}
      />
    </div>
  )
}
