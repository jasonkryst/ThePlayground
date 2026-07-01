import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel("Child's Name").fill('Mia')
  await page.getByRole('radio', { name: '4' }).check()

  await page.reload()

  await expect(page.getByLabel("Child's Name")).toHaveValue('Mia')
  await expect(page.getByRole('radio', { name: '4' })).toBeChecked()
})

test('admin page has no accessibility violations', async ({ page }) => {
  await page.goto('/admin')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('admin tag override persists across page reload', async ({ page }) => {
  await page.goto('/admin')

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
  await expect(page.getByLabel('Tags for Animal Sounds')).toHaveValue('numbers, math')
})
