import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test('shows the Gecko heading and sign-in link', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Gecko')
    await expect(page.locator('a[href="/auth"]')).toBeVisible()
  })
})

test.describe('Auth redirect', () => {
  test('unauthenticated user is redirected from /projects', async ({ page }) => {
    const response = await page.goto('/projects')
    // Should end up on /auth
    expect(page.url()).toContain('/auth')
  })

  test('auth page has GitHub sign-in button', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.locator('button')).toContainText('Sign in with GitHub')
  })
})
