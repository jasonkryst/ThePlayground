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
  // Find the input by id (second game in the tags list)
  const animalInput = page.locator('#tags-animal-sounds')
  // Clear and fill the input
  await animalInput.fill('numbers, math')
  // Find all save buttons and click the second one (for animal-sounds)
  const saveButtons = page.locator('button.admin__tag-save')
  const count = await saveButtons.count()
  if (count >= 1) {
    // Click the save button - since animal-sounds is typically the first game in manifest order
    await page.locator('.admin__tag-row').nth(0).locator('.admin__tag-save').click()
  }
  await page.waitForTimeout(1500)
  // Reload and verify
  await page.reload()
  await page.waitForLoadState()
  await expect(page.locator('#tags-animal-sounds')).toHaveValue('numbers, math')
})
