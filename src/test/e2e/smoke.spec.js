import { test, expect } from '@playwright/test'

test('login page loads and shows the primary form controls', async ({ page }) => {
  await page.goto('https://smart-lab-vert.vercel.app/')
  await expect(page).toHaveTitle(/Smart Lab System|Lab/i)
  await expect(page.getByRole('heading', { name: /مرحباً بك يا دكتور/i })).toBeVisible()
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible()
  await expect(page.getByLabel('كلمة المرور')).toBeVisible()
})
