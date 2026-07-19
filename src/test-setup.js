import '@testing-library/jest-dom'
import { expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'
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
