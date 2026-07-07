import { test, expect } from '@playwright/test'

test('deployed login page renders the auth form', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Smart Lab System/i })).toBeVisible()
  await expect(page.getByLabel(/البريد الإلكتروني/i)).toBeVisible()
  await expect(page.getByLabel(/كلمة المرور/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /تسجيل الدخول/i })).toBeVisible()
})
