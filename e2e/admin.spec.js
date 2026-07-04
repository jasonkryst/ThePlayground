import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel("Child's Name").fill('Mia')

  // "Answer Choices" and "Retry Attempts" both have a radio named "4", so scope
  // from the section heading rather than using an unscoped role query.
  const answerChoicesRadio4 = page.getByRole('heading', { name: 'Answer Choices' })
    .locator('xpath=..')
    .getByRole('radio', { name: '4', exact: true })
  await answerChoicesRadio4.check()

  await page.reload()

  await expect(page.getByLabel("Child's Name")).toHaveValue('Mia')
  await expect(answerChoicesRadio4).toBeChecked()
})

test('admin page has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('admin tag override persists across page reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: /games/i }).click()

  const input = page.getByLabel('Tags for Animal Sounds')
  await input.clear()
  await input.fill('numbers, math')

  // Click the Save Tags button in the same row
  const saveButton = page.getByRole('button', { name: 'Save Tags' }).first()
  await saveButton.click()

  // Verify localStorage was updated before reloading (guards against reload race)
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.tagOverrides?.['animal-sounds']
  }).toEqual(['numbers', 'math'])

  await page.reload()
  await page.getByRole('tab', { name: /games/i }).click()
  await expect(page.getByLabel('Tags for Animal Sounds')).toHaveValue('numbers, math')
})

test('new engine settings persist after reload', async ({ page }) => {
  await page.goto('/admin')

  // Scope to the "Timer" section — a countdown radio's label ("Answer within
  // 10s") is unique across the page, so no ambiguity guard is needed here,
  // but scoping keeps the pattern consistent with the section above.
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 10s' }).check()
  await timerSection.getByRole('radio', { name: '⏱️ Show timer' }).check() // force a write back to countUp

  // "Retry Attempts" and "Answer Choices" share radios named "2"/"3"/"4", so scope
  // from the section heading rather than using an unscoped role query.
  await page.getByRole('heading', { name: 'Retry Attempts' })
    .locator('xpath=..')
    .getByRole('radio', { name: 'Unlimited' })
    .check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Retry Attempts' })
      .locator('xpath=..')
      .getByRole('radio', { name: 'Unlimited' })
  ).toBeChecked()
})

test('timer countdown setting persists after reload', async ({ page }) => {
  await page.goto('/admin')
  const timerSection = page.getByRole('heading', { name: 'Timer' }).locator('xpath=..')
  await timerSection.getByRole('radio', { name: 'Answer within 15s' }).check()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Timer' }).locator('xpath=..').getByRole('radio', { name: 'Answer within 15s' })
  ).toBeChecked()
})

test('replay intro brings back a dismissed game intro', async ({ page }) => {
  await page.goto('/game/animal-sounds')
  await page.getByTestId('game-intro-dont-show-again').click()
  await page.getByTestId('game-intro-start').click()

  // Verify localStorage was updated before navigating away (guards against a navigation race)
  await expect.poll(async () => {
    const raw = await page.evaluate(() => localStorage.getItem('playground_settings'))
    if (!raw) return null
    const s = JSON.parse(raw)
    return s?.introDismissed?.['animal-sounds']
  }).toBe(true)

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).not.toBeVisible()

  await page.goto('/admin')
  await page.getByRole('tab', { name: /games/i }).click()
  await page.getByRole('button', { name: 'Replay Intro' }).first().click()

  await page.goto('/game/animal-sounds')
  await expect(page.getByTestId('game-intro-start')).toBeVisible()
})

test('badges tab shows the badge gallery for each game', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()

  await expect(page.getByText('Animal Sounds')).toBeVisible()
  await expect(page.getByText('Color Match')).toBeVisible()

  // "Hot Streak" is a badge name shared by both games' badge sets, so scope from
  // the game heading rather than using an unscoped locator (same pattern as the
  // "Answer Choices" radio scoping above).
  const animalSoundsSection = page.getByRole('heading', { name: 'Animal Sounds' }).locator('xpath=..')
  await expect(animalSoundsSection.getByText('Hot Streak')).toBeVisible()
})

test('badges tab has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  await page.getByRole('tab', { name: 'Badges' }).click()
  await page.waitForTimeout(200) // let the tab's 150ms background/color transition settle before scanning
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
