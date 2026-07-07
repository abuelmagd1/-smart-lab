# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit.spec.js >> renders the new patient form and validation state
- Location: src\test\e2e\audit.spec.js:83:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/new-patient
Call log:
  - navigating to "http://127.0.0.1:4173/new-patient", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | const baseURL = 'http://127.0.0.1:4173'
  4   | 
  5   | const mockSupabase = async (page) => {
  6   |   await page.addInitScript(() => {
  7   |     const makeResponse = (data, error = null) => ({ data, error })
  8   | 
  9   |     const tables = {
  10  |       profiles: [{ id: 'user-1', role: 'doctor' }],
  11  |       lab_settings: [{ user_id: 'user-1', lab_name: 'معمل النور', doctor_name: 'د. سارة', email: 'doctor@example.com' }],
  12  |       patients: [{ id: 1, name: 'أحمد', age: 33, gender: 'ذكر', phone: '01000000000', doctor: 'د. سارة', notes: '', created_at: '2026-01-01T00:00:00.000Z', barcode_seq: 1, tests: [{ id: 11, name: 'CBC', status: 'تم التجميع', value: '', normal_range: '4-10', unit: 'mg/dL' }] }],
  13  |       tests: [{ id: 11, patient_id: 1, name: 'CBC', status: 'تم التجميع', value: '', normal_range: '4-10', unit: 'mg/dL' }],
  14  |       test_catalog: [{ id: 1, name: 'CBC', category: 'Blood', unit: 'mg/dL', normal_range: '4-10' }],
  15  |       admin_notifications: [{ id: 1, title: 'تنبيه', message: 'مرحبا', target_user_id: null, created_at: '2026-01-01T00:00:00.000Z' }],
  16  |     }
  17  | 
  18  |     const createQueryBuilder = (tableName) => {
  19  |       const table = tables[tableName] || []
  20  |       return {
  21  |         select: () => createQueryBuilder(tableName),
  22  |         order: () => Promise.resolve(makeResponse(table)),
  23  |         limit: () => Promise.resolve(makeResponse(table.slice(0, 10))),
  24  |         eq: () => createQueryBuilder(tableName),
  25  |         maybeSingle: () => Promise.resolve(makeResponse(table[0] || null)),
  26  |         single: () => Promise.resolve(makeResponse(table[0] || null)),
  27  |         or: () => Promise.resolve(makeResponse(table)),
  28  |         insert: () => Promise.resolve(makeResponse(table)),
  29  |         update: () => Promise.resolve(makeResponse(table)),
  30  |         delete: () => Promise.resolve(makeResponse(table)),
  31  |       }
  32  |     }
  33  | 
  34  |     window.__supabaseMock = {
  35  |       auth: {
  36  |         getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
  37  |         onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  38  |         signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
  39  |         signOut: () => Promise.resolve({ error: null }),
  40  |         updateUser: () => Promise.resolve({ data: {}, error: null }),
  41  |         getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'doctor@example.com' } } }),
  42  |         setSession: () => Promise.resolve({ data: {}, error: null }),
  43  |       },
  44  |       from: (tableName) => createQueryBuilder(tableName),
  45  |       storage: {
  46  |         from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/logo.jpg' } }) })
  47  |       }
  48  |     }
  49  |   })
  50  | }
  51  | 
  52  | test.beforeEach(async ({ page }) => {
  53  |   await mockSupabase(page)
  54  | })
  55  | 
  56  | test('discovers the main routes and renders the login experience', async ({ page }) => {
  57  |   await page.goto(baseURL)
  58  |   await expect(page.getByRole('heading', { name: /مرحباً بك يا دكتور/i })).toBeVisible()
  59  |   await expect(page.getByLabel(/البريد الإلكتروني/i)).toBeVisible()
  60  |   await expect(page.getByLabel(/كلمة المرور/i)).toBeVisible()
  61  |   await expect(page.getByRole('button', { name: /تسجيل الدخول/i })).toBeVisible()
  62  | })
  63  | 
  64  | test('supports keyboard navigation and login submission', async ({ page }) => {
  65  |   await page.goto(baseURL)
  66  |   await page.getByLabel(/البريد الإلكتروني/i).focus()
  67  |   await page.keyboard.type('doctor@example.com')
  68  |   await page.getByLabel(/كلمة المرور/i).focus()
  69  |   await page.keyboard.type('password123')
  70  |   await page.keyboard.press('Tab')
  71  |   await expect(page.getByRole('button', { name: /تسجيل الدخول/i })).toBeFocused()
  72  |   await page.getByRole('button', { name: /تسجيل الدخول/i }).click()
  73  |   await expect(page.getByText(/جارٍ التحميل/i)).toBeVisible({ timeout: 5000 })
  74  | })
  75  | 
  76  | test('renders the doctor dashboard and patient workflow', async ({ page }) => {
  77  |   await page.goto(`${baseURL}/dashboard`)
  78  |   await expect(page.getByRole('heading', { name: /لوحة التحكم/i })).toBeVisible()
  79  |   await expect(page.getByText(/المرضى/i)).toBeVisible()
  80  |   await expect(page.getByText(/أحمد/i)).toBeVisible()
  81  | })
  82  | 
  83  | test('renders the new patient form and validation state', async ({ page }) => {
> 84  |   await page.goto(`${baseURL}/new-patient`)
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/new-patient
  85  |   await expect(page.getByRole('heading', { name: /تسجيل مريض جديد/i })).toBeVisible()
  86  |   await page.getByRole('button', { name: /حفظ/i }).click()
  87  |   await expect(page.getByText(/من فضلك ادخل اسم المريض/i)).toBeVisible()
  88  | })
  89  | 
  90  | test('renders results workflow and barcode actions', async ({ page }) => {
  91  |   await page.goto(`${baseURL}/results`)
  92  |   await expect(page.getByRole('heading', { name: /نتائج التحاليل/i })).toBeVisible()
  93  |   await expect(page.getByText(/أحمد/i)).toBeVisible()
  94  |   await page.getByRole('button', { name: /عرض تفاصيل أحمد/i }).click()
  95  |   await expect(page.getByText(/CBC/i)).toBeVisible()
  96  | })
  97  | 
  98  | test('renders reports and accessibility elements', async ({ page }) => {
  99  |   await page.goto(`${baseURL}/reports`)
  100 |   await expect(page.getByRole('heading', { name: /التقارير/i })).toBeVisible()
  101 |   await expect(page.getByRole('button', { name: /فتح الإعدادات/i })).toBeVisible()
  102 | })
  103 | 
  104 | test('renders admin dashboard and lab management flows', async ({ page }) => {
  105 |   await page.goto(`${baseURL}/admin`)
  106 |   await expect(page.getByRole('heading', { name: /المعامل المشتركة/i })).toBeVisible()
  107 |   await expect(page.getByRole('textbox', { name: /البحث عن معمل أو دكتور أو كود تفعيل/i })).toBeVisible()
  108 | })
  109 | 
  110 | test('renders admin add-lab and notifications workflows', async ({ page }) => {
  111 |   await page.goto(`${baseURL}/admin/add-lab`)
  112 |   await expect(page.getByRole('heading', { name: /إضافة معمل جديد/i })).toBeVisible()
  113 |   await page.getByRole('button', { name: /إنشاء المعمل/i }).click()
  114 |   await expect(page.getByText(/من فضلك ملي الحقول المطلوبة/i)).toBeVisible()
  115 | 
  116 |   await page.goto(`${baseURL}/admin/notifications`)
  117 |   await expect(page.getByRole('heading', { name: /إرسال إشعار/i })).toBeVisible()
  118 | })
  119 | 
```