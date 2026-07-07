# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.js >> login page loads and shows the primary form controls
- Location: src\test\e2e\smoke.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('البريد الإلكتروني')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByLabel('البريد الإلكتروني')

```

```yaml
- img "lab"
- img
- heading "Smart Lab System" [level=1]
- paragraph: نظام إدارة المعمل الذكي
- text: 🔬 تسجيل المرضى وإدارة نتائج التحاليل بكل سهولة 🤖 "لابو" مساعدك الذكي يسجل ويرد على استفساراتك 🖨️ طباعة تقرير احترافي بنتيجة التحليل بضغطة واحدة 🔒 بياناتك محفوظة وآمنة على قاعدة بيانات مشفرة
- heading "مرحباً بك يا دكتور" [level=2]
- paragraph: سعداء بالتعامل مع حضرتك
- text: البريد الإلكتروني
- img
- textbox "example@lab.com"
- text: كلمة المرور
- img
- textbox "••••••••"
- button:
  - img
- button "تسجيل الدخول":
  - img
  - text: تسجيل الدخول
- text: Created by Eng. Ahmed Abu Elmagd
- link "Ahmed Abu Elmagd":
  - /url: https://www.facebook.com/share/1As7dJBGZY/
  - text: Ahmed Abu Elmagd
  - img
- link "01094997330":
  - /url: https://wa.me/201094997330
  - text: "01094997330"
  - img
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test('login page loads and shows the primary form controls', async ({ page }) => {
  4  |   await page.goto('https://smart-lab-vert.vercel.app/')
  5  |   await expect(page).toHaveTitle(/Smart Lab System|Lab/i)
  6  |   await expect(page.getByRole('heading', { name: /مرحباً بك يا دكتور/i })).toBeVisible()
> 7  |   await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible()
     |                                                      ^ Error: expect(locator).toBeVisible() failed
  8  |   await expect(page.getByLabel('كلمة المرور')).toBeVisible()
  9  | })
  10 | 
```