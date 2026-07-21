import { useLayoutEffect, useState } from 'react'

// Measures a flex-wrap row of pills: how many children share the first
// row's offsetTop (children that wrapped to a later row have a larger
// offsetTop), and that first row's own rendered height. Both come from the
// real DOM rather than a hardcoded pixel constant, so the count and height
// stay correct across pill label length, locale, or OS/browser large-text
// scaling -- same "measure real DOM, don't guess" approach as
// useFitTileSize (issue #104), applied to counting instead of sizing.
//
// `dep` is a single caller-supplied value (not an array) that should change
// whenever the row's content changes -- e.g. a joined string of the
// current tag list. React's dependency-array comparison requires a STABLE
// LENGTH across renders (it compares by index up to min(prev.length,
// next.length), so a *growing* deps array silently skips re-running the
// effect); accepting one scalar value instead of a spread array avoids that
// footgun entirely.
export default function useTagRowOverflow(ref, dep) {
  const [state, setState] = useState({ visibleCount: Infinity, rowHeight: null })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const update = () => {
      const children = [...el.children]
      if (children.length === 0) return
      const firstRowTop = children[0].offsetTop
      const rowChildren = children.filter(child => child.offsetTop === firstRowTop)
      const rowHeight = rowChildren[0].getBoundingClientRect().height
      setState({ visibleCount: rowChildren.length, rowHeight })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, dep])

  return state
}
