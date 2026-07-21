import { useLayoutEffect } from 'react'

const MIN_TILE_PX = 48
const MAX_TILE_PX = 140

// Measures the memory board's available box (a flex:1 wrapper that fills
// whatever vertical space `.game` has left after the prompt/timer) and
// publishes the largest square tile size that lets `columns` x `rows` tiles
// fit, given both axes. Floored at 48px (a sanity guard, not a tap-target
// promise -- full-board visibility outranks tile size per issue #104) and
// capped at 140px (today's desktop/tablet default, issue #58). `widthPerTile`
// is always part of the outer clamp, so the floor can never push the board
// past the available width -- horizontal overflow is structurally
// impossible regardless of how tight the box gets.
// Mirrors useHeaderHeightVar's ResizeObserver -> CSS custom property pattern.
// useLayoutEffect (not useEffect) so the first real measurement lands before
// paint, avoiding a visible pop from the 140px CSS fallback.
export default function useFitTileSize(ref, { columns, rows, gap }) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !(columns > 0) || !(rows > 0)) return undefined

    const updateVar = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const widthPerTile = (width - gap * (columns - 1)) / columns
      const heightPerTile = (height - gap * (rows - 1)) / rows
      const rawSize = Math.min(widthPerTile, heightPerTile)
      const tileSize = Math.floor(Math.min(MAX_TILE_PX, widthPerTile, Math.max(MIN_TILE_PX, rawSize)))
      el.style.setProperty('--memory-board-tile-size', `${tileSize}px`)
    }

    updateVar()
    const observer = new ResizeObserver(updateVar)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, columns, rows, gap])
}
