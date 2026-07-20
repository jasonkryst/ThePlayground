import { useEffect } from 'react'

// Publishes ref.current's live rendered height as --shell-header-height so
// `scroll-padding-top: var(--shell-header-height)` (src/index.css) always
// reserves exactly enough space for the sticky header, whatever its current
// height is — one row on most routes, two with a title on game/subpage
// routes, and taller still once font-size becomes text-scale-responsive.
export default function useHeaderHeightVar(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const updateVar = () => {
      document.documentElement.style.setProperty('--shell-header-height', `${el.getBoundingClientRect().height}px`)
    }

    updateVar()
    const observer = new ResizeObserver(updateVar)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
}
