import { useTranslation } from 'react-i18next'
import './MemoryBoard.css'

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length

  return (
    <div className="memory-board">
      <div className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}>
        {tiles.map((tile, i) => {
          const faceUp = tile.state !== 'down'
          const label =
            tile.state === 'down' ? t('memoryBoard.hiddenTile', { position: i + 1, total })
            : tile.state === 'matched' ? t('memoryBoard.matchedLabel', { name: getFaceLabel(tile.itemId) })
            : getFaceLabel(tile.itemId)
          return (
            <button
              key={tile.tileId}
              className={`memory-board__tile memory-board__tile--${tile.state}`}
              data-item-id={tile.itemId}
              data-tile-id={tile.tileId}
              aria-label={label}
              aria-disabled={tile.state === 'matched'}
              onClick={() => { if (tile.state !== 'matched') onFlip(tile.tileId) }}
            >
              <span className="memory-board__tile-inner" aria-hidden="true">
                <span className="memory-board__tile-back">❓</span>
                <span className="memory-board__tile-face">{faceUp ? renderFace(tile.itemId) : null}</span>
              </span>
              {tile.state === 'mismatch' && <span className="memory-board__cross" aria-hidden="true">✗</span>}
            </button>
          )
        })}
      </div>
      <div className="sr-only" role="status" aria-live="polite">{liveMessage}</div>
    </div>
  )
}
