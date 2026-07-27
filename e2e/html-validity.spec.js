import { test, expect } from '@playwright/test'
import { HtmlValidate } from 'html-validate'

// The W3C Nu HTML Checker validates a *document*, but this app is a
// client-rendered SPA — the served index.html is a near-empty shell, so
// validating it proves nothing. Validate the rendered DOM per route instead,
// using an offline validator (no live network dependency) rather than the
// live Nu Checker, which isn't reachable from every environment this suite
// runs in.
const htmlvalidate = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: {
    // Playwright's page.content() serializes the browser's own DOM, which
    // normalizes <!doctype html> to uppercase regardless of the source
    // file's casing — this checks the rendered result, so match that.
    'doctype-style': ['error', { style: 'uppercase' }],
    // Dynamic per-item colors (game swatches, card accent colors) are
    // legitimately inline-styled throughout this app; that's valid HTML5,
    // just a style preference this rule enforces beyond conformance.
    'no-inline-style': 'off',
    // Only consequential inside a <form> (implicit type="submit" could
    // trigger an accidental submission) — this app has no <form> elements
    // anywhere. Revisit if one is ever added.
    'no-implicit-button-type': 'off',
    // An artifact of how page.content() serializes the page, not something
    // authored in JSX.
    'no-trailing-whitespace': 'off',
    // The browser reflects a checked radio/checkbox's boolean IDL property
    // back as a non-empty attribute value when serializing live DOM state
    // via page.content() — a browser serialization detail, not something
    // React's JSX controls.
    'attribute-boolean-style': 'off',
  },
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pg-parental-lock-unlocked', '1'))
})

const routes = [
  { name: 'dashboard', path: '/' },
  { name: 'admin', path: '/admin' },
  { name: 'parent', path: '/parent' },
  { name: 'kids progress', path: '/my-progress' },
]

for (const { name, path } of routes) {
  test(`${name} (${path}) renders valid HTML5`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const html = await page.content()
    const report = await htmlvalidate.validateString(html)
    if (!report.valid) {
      const details = report.results
        .flatMap(r => r.messages)
        .map(m => `  ${m.ruleId} (${m.selector ?? 'no selector'}): ${m.message}`)
        .join('\n')
      throw new Error(`html-validate found ${report.errorCount} error(s) on ${path}:\n${details}`)
    }
    expect(report.valid).toBe(true)
  })
}

test('color match gameplay screen renders valid HTML5', async ({ page }) => {
  await page.goto('/game/color-match')
  await page.getByTestId('game-intro-start').click()
  await page.locator('.game__choice').first().waitFor()
  const html = await page.content()
  const report = await htmlvalidate.validateString(html)
  if (!report.valid) {
    const details = report.results
      .flatMap(r => r.messages)
      .map(m => `  ${m.ruleId} (${m.selector ?? 'no selector'}): ${m.message}`)
      .join('\n')
    throw new Error(`html-validate found ${report.errorCount} error(s):\n${details}`)
  }
  expect(report.valid).toBe(true)
})
