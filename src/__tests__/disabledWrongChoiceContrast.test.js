import { describe, it, expect } from 'vitest'
import colors from '../games/color-match/data/colors'

// Mirrors src/index.css's `.game__choice--disabled-wrong { filter: grayscale(40%) brightness(1.2); }`.
// jsdom doesn't compute CSS filter effects, so this replicates the CSS Filter Effects spec's
// grayscale()/brightness() math in plain JS and checks WCAG 1.4.3 contrast (>=4.5:1) directly,
// rather than trusting that a filter chosen for one color palette generalizes to every choice
// color in the app. If index.css's filter values change, or a new choice background/text pair
// is added to any game, re-run this file before shipping.
const GRAYSCALE_AMOUNT = 0.4
const BRIGHTNESS_AMOUNT = 1.2
const MIN_CONTRAST = 4.5

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function applyGrayscale([r, g, b], amount) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return [r, g, b].map(c => c * (1 - amount) + luma * amount)
}

function applyBrightness(rgb, amount) {
  return rgb.map(c => Math.min(255, c * amount))
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastAfterDisabledWrongFilter(bgHex, textHex) {
  const filtered = hex =>
    applyBrightness(applyGrayscale(hexToRgb(hex), GRAYSCALE_AMOUNT), BRIGHTNESS_AMOUNT)
  const bgLum = relativeLuminance(filtered(bgHex))
  const textLum = relativeLuminance(filtered(textHex))
  const lighter = Math.max(bgLum, textLum)
  const darker = Math.min(bgLum, textLum)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('.game__choice--disabled-wrong contrast', () => {
  it.each(colors.map(c => [c.id, c.color, c.textColor]))(
    'Color Match "%s" choice stays >= 4.5:1 after the disabled-wrong filter',
    (_id, bg, text) => {
      expect(contrastAfterDisabledWrongFilter(bg, text)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  )

  // Animal Sounds cycles choice backgrounds through these three tokens (src/games/animal-sounds/index.jsx's
  // CHOICE_COLORS) with white choice-name text (AnimalSoundsGame.css's .game__choice-name).
  it.each([
    ['lavender-dark', '#6A4FA3', '#FFFFFF'],
    ['teal-dark', '#00695C', '#FFFFFF'],
    ['aqua-dark', '#006C7A', '#FFFFFF'],
  ])('Animal Sounds "%s" choice stays >= 4.5:1 after the disabled-wrong filter', (_id, bg, text) => {
    expect(contrastAfterDisabledWrongFilter(bg, text)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  // Character Match choices use a fixed --color-surface background with --color-text text
  // (both from src/index.css's :root tokens).
  it('Character Match choice stays >= 4.5:1 after the disabled-wrong filter', () => {
    expect(contrastAfterDisabledWrongFilter('#FFFFFF', '#37474F')).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})
