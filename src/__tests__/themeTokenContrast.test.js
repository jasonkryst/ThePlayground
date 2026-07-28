import { describe, it, expect } from 'vitest'

// Mirrors src/index.css's theme token blocks. Keep these values in sync manually
// whenever index.css's theme blocks change — same maintenance convention as
// disabledWrongChoiceContrast.test.js's filter constants.
const THEMES = {
  light: {
    bg: '#F0FDFF', surface: '#FFFFFF', text: '#37474F', textMuted: '#5B6B70',
    error: '#c62828', errorSolid: '#c62828', onAccent: '#FFFFFF',
    lavenderText: '#6A4FA3', tealText: '#00695C',
    aqua: '#80DEEA', teal: '#80CBC4', lavender: '#B39DDB', lilac: '#CE93D8',
    aquaDark: '#006C7A', tealDark: '#00695C', lavenderDark: '#6A4FA3',
  },
  dark: {
    bg: '#0D2126', surface: '#17323A', text: '#E8F6F7', textMuted: '#9EC2C7',
    error: '#FF8A80', errorSolid: '#c62828', onAccent: '#FFFFFF',
    lavenderText: '#B39DDB', tealText: '#80CBC4',
    aqua: '#80DEEA', teal: '#80CBC4', lavender: '#B39DDB', lilac: '#CE93D8',
    aquaDark: '#006C7A', tealDark: '#00695C', lavenderDark: '#6A4FA3',
  },
  highContrast: {
    bg: '#000000', surface: '#000000', text: '#FFFFFF', textMuted: '#C8C8C8',
    error: '#FF6E6E', errorSolid: '#FF6E6E', onAccent: '#000000',
    lavenderText: '#C9A9FF', tealText: '#26D9B7',
    aqua: '#4DD8E8', teal: '#26D9B7', lavender: '#C9A9FF', lilac: '#FF8AD8',
    aquaDark: '#4DD8E8', tealDark: '#26D9B7', lavenderDark: '#C9A9FF',
    // Flat colors only in this theme (transparent in Light/Dark, so not
    // meaningfully testable as a hex there without replicating alpha-compositing
    // math this file doesn't otherwise do).
    hairline: '#FFFFFF', surfaceOutline: '#FFFFFF',
  },
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function relLum([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}
function contrast(hexA, hexB) {
  const l1 = relLum(hexToRgb(hexA)), l2 = relLum(hexToRgb(hexB))
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

describe.each(Object.entries(THEMES))('%s theme token contrast', (_name, t) => {
  it('body text on page background >= 4.5:1', () => {
    expect(contrast(t.text, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('body text on card surface >= 4.5:1', () => {
    expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('muted text on page background >= 4.5:1', () => {
    expect(contrast(t.textMuted, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('error text on page background >= 4.5:1', () => {
    expect(contrast(t.error, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('lavender-text heading on page background >= 4.5:1', () => {
    expect(contrast(t.lavenderText, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('teal-text heading on page background >= 4.5:1', () => {
    expect(contrast(t.tealText, t.bg)).toBeGreaterThanOrEqual(TEXT_MIN)
  })
  it('on-accent text on each solid-fill token >= 4.5:1', () => {
    expect(contrast(t.onAccent, t.aquaDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.tealDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.lavenderDark)).toBeGreaterThanOrEqual(TEXT_MIN)
    expect(contrast(t.onAccent, t.errorSolid)).toBeGreaterThanOrEqual(TEXT_MIN)
  })

  // Non-text/border threshold (Global Constraint) — --color-hairline and
  // --color-surface-outline are `transparent` in Light/Dark, so only High
  // Contrast (where both are flat #FFFFFF) is meaningfully testable here.
  if (_name === 'highContrast') {
    it('hairline divider on page background >= 3:1', () => {
      expect(contrast(t.hairline, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    })
    it('surface outline on page background >= 3:1', () => {
      expect(contrast(t.surfaceOutline, t.bg)).toBeGreaterThanOrEqual(NON_TEXT_MIN)
    })
  }
})

// Negative case: proves the test actually discriminates rather than trivially
// passing everything.
it('a deliberately low-contrast pairing fails the same assertion style', () => {
  expect(contrast('#5B6B70', '#5B6B70')).toBeLessThan(TEXT_MIN)
})
