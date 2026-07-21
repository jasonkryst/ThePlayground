import { useLayoutEffect } from 'react'

const MIN_TILE_PX = 48
const MAX_TILE_PX = 140
// .game's own bottom padding (GameLayout.css) -- not visible to this hook's
// measurements directly, so duplicated here like TILE_GAP_PX in
// MemoryBoard.jsx.
const GAME_BOTTOM_PADDING_PX = 24

// Measures the largest square tile size that lets `columns` x `rows` tiles
// fit both the board's available width and the true remaining viewport
// height, then publishes it as --memory-board-tile-size.
//
// Available HEIGHT can't be read from the board wrapper's own rendered box
// (`el.getBoundingClientRect().height`): `.shell` uses `min-height: 100vh`
// (not `height: 100vh`), deliberately, so legitimately long content can
// still scroll (issue #55) -- which means nothing in the ancestor chain has
// a hard ceiling. A flex:1 wrapper's own box always grows to match its
// content's natural size in that architecture (confirmed empirically --
// min-height:0 on every ancestor in the chain made no difference), so
// measuring "my own box" is circular and can never produce a number smaller
// than whatever the tiles already want to be.
//
// Instead, available height is reconstructed from landmarks that don't
// depend on the board's own size: window.innerHeight (the true viewport),
// the board's own top position (driven only by content ABOVE it -- header +
// prompt/timer -- never by the board itself), and the shell footer's own
// rendered height (its own content, not the board's). None of these change
// as a side effect of setting a new tile size, so this converges in at most
// one extra ResizeObserver tick, not an infinite loop.
//
// Available WIDTH is still read from the board wrapper's own box -- that
// axis isn't part of the height circularity (a column flexbox's width isn't
// content-driven the way its auto height is).
export default function useFitTileSize(ref, { columns, rows, gap }) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(columns > 0) || !(rows > 0)) return undefined

    const updateVar = () => {
      const { width, top } = el.getBoundingClientRect()
      if (width <= 0) return
      const footerEl = document.querySelector('.shell__footer')
      const footerHeight = footerEl ? footerEl.getBoundingClientRect().height : 0
      const availableHeight = window.innerHeight - top - GAME_BOTTOM_PADDING_PX - footerHeight
      if (availableHeight <= 0) return
      const widthPerTile = (width - gap * (columns - 1)) / columns
      const heightPerTile = (availableHeight - gap * (rows - 1)) / rows
      const rawSize = Math.min(widthPerTile, heightPerTile)
      const tileSize = Math.floor(Math.min(MAX_TILE_PX, widthPerTile, Math.max(MIN_TILE_PX, rawSize)))
      el.style.setProperty('--memory-board-tile-size', `${tileSize}px`)
    }

    updateVar()
    const observer = new ResizeObserver(updateVar)
    observer.observe(el)
    window.addEventListener('resize', updateVar)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateVar)
    }
  }, [ref, columns, rows, gap])
}
