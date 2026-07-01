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

  // Use stable locator for the animal sounds tags input
  const animalSoundsInput = page.locator('input#tags-animal-sounds')

  // Clear and fill with new tags
  await animalSoundsInput.clear()
  await animalSoundsInput.fill('numbers, math')

  // Find and click the save button for this input using stable locator
  // The save button is a direct sibling within the same tag-buttons container
  const tagRow = animalSoundsInput.locator('xpath=ancestor::div[@class="admin__tag-row"]')
  const saveButton = tagRow.locator('button.admin__tag-save')
  await saveButton.click()

  // Wait for the network to complete
  await page.waitForLoadState('networkidle')

  // Reload the page
  await page.reload()

  // Verify the tags were saved and persisted
  await expect(page.getByLabel(/tags for animal sounds/i)).toHaveValue('numbers, math')
})
