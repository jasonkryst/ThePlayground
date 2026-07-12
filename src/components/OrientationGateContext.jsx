import { createContext, useContext } from 'react'

// Default is unblocked so session hooks work outside a gate (unit tests,
// Storybook, any future non-gated embedding). Mirrors ShellContext's
// safe-default pattern.
export const OrientationGateContext = createContext({ blocked: false })

// Whether an enclosing OrientationGate is currently blocking gameplay
// (wrong orientation for a game that requires one). Session hooks use this
// to pause timing and ignore input.
export function useOrientationGate() {
  return useContext(OrientationGateContext)
}
