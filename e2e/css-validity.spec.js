import { test } from '@playwright/test'
import stylelint from 'stylelint'

// Stylelint (npm run lint:css) already validates every *.css source file's
// CSS3 conformance — property/value/at-rule/selector validity — via rules
// inherited from stylelint-config-recommended (property-no-unknown,
// declaration-property-value-no-unknown, at-rule-no-unknown, etc.), not just
// style preferences. See docs/TESTING.md.
//
// The one CSS surface that misses entirely is dynamic inline `style={{...}}`
// values (per-item colors in Color Match/Animal Sounds, tag accent colors on
// GameCard) — those are JS objects, not .css files, so Stylelint's file scan
// never sees them. This spec closes that gap: it renders each route/state
// that sets inline styles, extracts every element's actual `style` attribute
// from the live DOM, and runs each one through Stylelint.
//
// Deliberately validated against stylelint-config-recommended only (pure
// CSS3 conformance: unknown properties/values/at-rules/selectors), not the
// full stylelint-config-standard used for source files. Standard's
// modernization rules (e.g. color-function-notation, preferring
// `rgb(r g b)` over `rgb(r, g, b)`) are a style preference the developer
// controls in source — but reading an inline style back via
// getAttribute('style') returns the browser's own CSSOM serialization,
// which always uses legacy comma syntax for rgb()/rgba() regardless of how
// the source authored it. That's a browser-serialization detail, not a
// defect, so it would fail here unconditionally and prove nothing.
const INLINE_STYLE_CONFIG = { extends: 'stylelint-config-recommended' }
const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]

async function lintInlineStyles(page, label) {
  // page.$$eval is Playwright's DOM-query API (runs the callback in the
  // browser context against matched elements) — unrelated to JS's eval().
  const styles = await page.$$eval('[style]', els =>
    els.map(el => el.getAttribute('style')).filter(Boolean)
  )

  const allWarnings = []
  for (const style of styles) {
    const { results } = await stylelint.lint({
      code: `.inline-style-check { ${style} }`,
      config: INLINE_STYLE_CONFIG,
    })
    for (const warning of results[0].warnings) {
      allWarnings.push(`  [${warning.rule ?? warning.text}] in "${style}": ${warning.text}`)
    }
  }

  if (allWarnings.length > 0) {
    throw new Error(
      `${label}: found ${allWarnings.length} invalid inline style declaration(s) across ${styles.length} inline-styled element(s):\n${allWarnings.join('\n')}`
    )
  }
}

for (const { name, path } of routes) {
  test(`${name} (${path}) has no invalid inline CSS`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await lintInlineStyles(page, `${name} (${path})`)
  })
}

test('color match gameplay screen has no invalid inline CSS', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('.game__choice').first().waitFor()
  await lintInlineStyles(page, 'color match gameplay')
})

test('animal sounds gameplay screen has no invalid inline CSS', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-start').click()
  await page.locator('.game__choice').first().waitFor()
  await lintInlineStyles(page, 'animal sounds gameplay')
})
