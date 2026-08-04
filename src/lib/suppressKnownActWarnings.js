// Predicate for the test-setup.js console.error filter (issues #147/#165):
// identifies the one specific, known-benign class of React act() warning
// caused by useGameSession's/useMemorySession's display-only currentElapsedMs
// polling setInterval racing real userEvent-driven test act() boundaries.
// Kept as its own pure function (rather than inline in test-setup.js) so it
// has direct unit coverage instead of only being exercised incidentally by
// whichever game tests happen to trip the race on a given run.
export function isKnownBenignActWarning(message, stack) {
  const isActWarningMessage = typeof message === 'string' &&
    (message.includes('not configured to support act') || message.includes('not wrapped in act'))
  if (!isActWarningMessage) return false
  return /[/\\](useGameSession|useMemorySession)\.js:/.test(stack ?? '')
}
