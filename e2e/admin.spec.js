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
  // Get all tag rows and find the one with the animal-sounds input
  const tagRows = page.locator('.admin__tag-row')
  let animalTagRow = null
  for (let i = 0; i < await tagRows.count(); i++) {
    const input = tagRows.nth(i).locator('input[id="tags-animal-sounds"]')
    if (await input.count() > 0) {
      animalTagRow = tagRows.nth(i)
      break
    }
  }
  // If we found the row, update the input and click save
  if (animalTagRow) {
    const animalInput = animalTagRow.locator('input')
    await animalInput.clear()
    await animalInput.fill('numbers, math')
    await animalTagRow.locator('button.admin__tag-save').click()
    await page.waitForTimeout(1500)
  }
  // Reload the page
  await page.reload()
  await page.waitForLoadState()
  // Verify the tags were saved
  await expect(page.getByLabel('Tags for Animal Sounds')).toHaveValue('numbers, math')
})
