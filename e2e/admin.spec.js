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
  // Find the input for animal-sounds (id="tags-animal-sounds")
  const animalInput = page.locator('#tags-animal-sounds')
  // Fill with new tags
  await animalInput.fill('numbers, math')
  // Click the first save button (should be for animal-sounds if it's the first game)
  const saveButton = page.locator('button.admin__tag-save').first()
  await saveButton.click()
  // Wait for async save to complete
  await page.waitForTimeout(2000)
  // Reload the page
  await page.reload()
  await page.waitForLoadState()
  // Verify the tags were saved
  await expect(page.locator('#tags-animal-sounds')).toHaveValue('numbers, math')
})
