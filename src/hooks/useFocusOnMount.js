import { useEffect, useRef } from 'react'

// Focuses the returned ref's element whenever `deps` changes (mount-only by
// default). Attach the ref to an element with tabIndex={-1} to focus a
// non-interactive element (e.g. a heading), or to a naturally focusable one
// (e.g. a button) as-is.
export default function useFocusOnMount(deps = []) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller-supplied dependency list by design
  }, deps)
  return ref
}
