import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import idealColumns from '../utils/idealColumns'
import useFitTileSize from '../hooks/useFitTileSize'
import './MemoryBoard.css'

// Must match the `gap` in .memory-board__grid (MemoryBoard.css, 0.75rem at
// the default 16px root font size).
const TILE_GAP_PX = 12

export default function MemoryBoard({ tiles, onFlip, renderFace, getFaceLabel, animationsEnabled = true, liveMessage = '' }) {
  const { t } = useTranslation()
  const total = tiles.length
  const columns = idealColumns(total)
  const rows = total > 0 ? Math.ceil(total / columns) : 1
  const boardRef = useRef(null)
  useFitTileSize(boardRef, { columns, rows, gap: TILE_GAP_PX })

  return (
    <div className="memory-board" ref={boardRef}>
      <div
        className={`memory-board__grid${animationsEnabled ? '' : ' memory-board__grid--no-anim'}`}
        style={{ '--memory-board-columns': columns, '--memory-board-rows': rows }}
      >
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
