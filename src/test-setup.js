import '@testing-library/jest-dom'
import { expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'
import { isKnownBenignActWarning } from './lib/suppressKnownActWarnings'
import './i18n'

expect.extend(toHaveNoViolations)

// jsdom doesn't implement ResizeObserver. Components that use it (via
// useHeaderHeightVar) need at least a no-op so unrelated tests that render
// them don't crash; tests that care about actual resize behavior install
// their own capturing mock (see useHeaderHeightVar.test.js).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// useGameSession's and useMemorySession's currentElapsedMs display-only
// polling intervals (100ms, deliberately unconditional -- see the comment on
// each hook's timer effect) are genuine wall-clock setIntervals. In any
// userEvent-driven component test that reaches real gameplay (issues
// #147/#165's audit found this recurring in KidsProgressPage, FruitVeggieId,
// CharacterMatchGameBluey, CharacterMatch, and useGameSession's own tests --
// and a full-suite run surfaced it again in CharacterMatchGame,
// AnimalMemoryMatchGame, and SoundMemoryMatchGame, confirming it's not a
// fixed list but every game sharing these two hooks), that tick can land in
// the real-time gap between two sequential act() calls no matter how the
// test awaits things -- confirmed by tracing the warning's stack straight to
// each interval's callback. vi.useFakeTimers() would fix it deterministically,
// but this stack's userEvent deadlocks when combined with fake timers (see
// docs/TESTING.md), and per-test real-timer waits were tried and don't
// reliably win the race either (the exact act()-boundary the tick lands in
// varies run to run). This is a tooling/timing artifact, not a real bug --
// each interval is display-only and always cleans up correctly on unmount,
// per the "durationMs values come from a separate Date.now() computation"
// comment in useGameSession.js -- so it's suppressed here by checking the
// *stack trace* of the specific state update, not by message text alone
// (see isKnownBenignActWarning): only a warning whose update genuinely
// originates from one of these two known setInterval callbacks is dropped.
// Any other act() warning -- including these same two message strings
// triggered by anything else -- still prints normally, so this can't
// silently mask a real regression elsewhere.
const originalConsoleError = console.error
console.error = (...args) => {
  if (isKnownBenignActWarning(args[0], new Error().stack)) return
  originalConsoleError(...args)
}
