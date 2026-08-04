import { describe, it, expect } from 'vitest'
import { isKnownBenignActWarning } from '../suppressKnownActWarnings'

const useGameSessionStack =
  'Error: trace\n' +
  '    at Console.console.error (test.jsx:1:1)\n' +
  '    at warnIfUpdatesNotWrappedWithActDEV (react-dom.development.js:27598:12)\n' +
  '    at dispatchSetState (react-dom.development.js:16708:7)\n' +
  '    at Timeout._onTimeout (C:\\_s\\ThePlayground\\src\\hooks\\useGameSession.js:298:7)\n' +
  '    at listOnTimeout (node:internal/timers:635:17)'

const useMemorySessionStack =
  'Error: trace\n' +
  '    at Timeout._onTimeout (C:\\_s\\ThePlayground\\src\\hooks\\useMemorySession.js:92:34)\n' +
  '    at listOnTimeout (node:internal/timers:635:17)'

const unrelatedComponentStack =
  'Error: trace\n' +
  '    at Timeout._onTimeout (C:\\_s\\ThePlayground\\src\\kids\\KidsProgressPage.jsx:99:34)\n' +
  '    at listOnTimeout (node:internal/timers:635:17)'

describe('isKnownBenignActWarning', () => {
  it('suppresses "not configured to support act" originating from useGameSession.js', () => {
    expect(isKnownBenignActWarning(
      'Warning: The current testing environment is not configured to support act(...)',
      useGameSessionStack
    )).toBe(true)
  })

  it('suppresses "not wrapped in act" originating from useMemorySession.js', () => {
    expect(isKnownBenignActWarning(
      'Warning: An update to AnimalMemoryMatchGame inside a test was not wrapped in act(...).',
      useMemorySessionStack
    )).toBe(true)
  })

  // Negative: same message text, but the update's stack traces back to an
  // unrelated component -- the exact scenario the KidsProgressPage bug this
  // suite guards against would produce. Must never be swallowed, or a real
  // regression elsewhere would go silently unnoticed.
  it('does not suppress the same message text when the stack points elsewhere', () => {
    expect(isKnownBenignActWarning(
      'Warning: An update to KidsProgressPage inside a test was not wrapped in act(...).',
      unrelatedComponentStack
    )).toBe(false)
  })

  it('does not suppress an unrelated warning message even with a matching-looking stack', () => {
    expect(isKnownBenignActWarning(
      'Warning: Each child in a list should have a unique "key" prop.',
      useGameSessionStack
    )).toBe(false)
  })

  it('handles a missing/undefined stack without throwing', () => {
    expect(isKnownBenignActWarning(
      'Warning: The current testing environment is not configured to support act(...)',
      undefined
    )).toBe(false)
  })

  it('ignores non-string messages (e.g. an Error object as the first console.error arg)', () => {
    expect(isKnownBenignActWarning(new Error('boom'), useGameSessionStack)).toBe(false)
  })
})
