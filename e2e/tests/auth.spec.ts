import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows login page when not authenticated', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /clawdeck/i })).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('shows dev login button in test mode', async ({ page }) => {
    // VITE_DEV_LOGIN should be true in e2e environment
    const devLoginButton = page.getByRole('button', { name: /dev login/i })
    await expect(devLoginButton).toBeVisible()
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.getByTestId('login-error')).toBeVisible()
    await expect(page.getByTestId('login-error')).toContainText(/invalid/i)
  })

  test('dev login works and redirects to dashboard', async ({ page }) => {
    // Click dev login button
    await page.getByRole('button', { name: /dev login/i }).click()

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Should show user is logged in (use more specific selector)
    await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible()
  })

  test('logout works correctly', async ({ page }) => {
    // Login first via dev login
    await page.getByRole('button', { name: /dev login/i }).click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })

    // Look for logout in sidebar or header
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i })
    const logoutLink = page.getByRole('link', { name: /logout|sign out/i })

    if (await logoutButton.isVisible()) {
      await logoutButton.click()
    } else if (await logoutLink.isVisible()) {
      await logoutLink.click()
    } else {
      // Try user menu
      const userMenu = page.locator('[data-testid="user-menu"]').or(
        page.locator('.user-menu')
      ).or(
        page.locator('button').filter({ hasText: 'Admin' }).first()
      )
      if (await userMenu.isVisible()) {
        await userMenu.click()
        await page.getByRole('button', { name: /logout|sign out/i }).click()
      }
    }

    // Should redirect to login or show logged out state
    await page.waitForTimeout(1000)
    const url = page.url()
    expect(url).toMatch(/\/(login|$)/)
  })
})
