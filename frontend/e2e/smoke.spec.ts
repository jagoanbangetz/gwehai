import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('home page loads and has correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/GwehAI/)
  })

  test('home page has root content', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
    // App should render something (e.g. header or main content)
    await expect(page.getByRole('heading', { level: 1 }).or(page.getByRole('banner'))).toBeVisible({ timeout: 10000 })
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('#root')).toBeVisible()
  })

  test('pricing page is reachable', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page.locator('#root')).toBeVisible()
  })
})
