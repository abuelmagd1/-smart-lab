import { test, expect } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'

const mockSupabase = async (page) => {
  await page.addInitScript(() => {
    const makeResponse = (data, error = null) => ({ data, error })

    const tables = {
      profiles: [{ id: 'user-1', role: 'doctor' }],
      lab_settings: [{ user_id: 'user-1', lab_name: 'معمل النور', doctor_name: 'د. سارة', email: 'doctor@example.com' }],
      patients: [{ id: 1, name: 'أحمد', age: 33, gender: 'ذكر', phone: '01000000000', doctor: 'د. سارة', notes: '', created_at: '2026-01-01T00:00:00.000Z', barcode_seq: 1, tests: [{ id: 11, name: 'CBC', status: 'تم التجميع', value: '', normal_range: '4-10', unit: 'mg/dL' }] }],
      tests: [{ id: 11, patient_id: 1, name: 'CBC', status: 'تم التجميع', value: '', normal_range: '4-10', unit: 'mg/dL' }],
      test_catalog: [{ id: 1, name: 'CBC', category: 'Blood', unit: 'mg/dL', normal_range: '4-10' }],
      admin_notifications: [{ id: 1, title: 'تنبيه', message: 'مرحبا', target_user_id: null, created_at: '2026-01-01T00:00:00.000Z' }],
    }

    const createQueryBuilder = (tableName) => {
      const table = tables[tableName] || []
      return {
        select: () => createQueryBuilder(tableName),
        order: () => Promise.resolve(makeResponse(table)),
        limit: () => Promise.resolve(makeResponse(table.slice(0, 10))),
        eq: () => createQueryBuilder(tableName),
        maybeSingle: () => Promise.resolve(makeResponse(table[0] || null)),
        single: () => Promise.resolve(makeResponse(table[0] || null)),
        or: () => Promise.resolve(makeResponse(table)),
        insert: () => Promise.resolve(makeResponse(table)),
        update: () => Promise.resolve(makeResponse(table)),
        delete: () => Promise.resolve(makeResponse(table)),
      }
    }

    window.__supabaseMock = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        updateUser: () => Promise.resolve({ data: {}, error: null }),
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'doctor@example.com' } } }),
        setSession: () => Promise.resolve({ data: {}, error: null }),
      },
      from: (tableName) => createQueryBuilder(tableName),
      storage: {
        from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/logo.jpg' } }) })
      }
    }
  })
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('discovers the main routes and renders the login experience', async ({ page }) => {
  await page.goto(baseURL)
  await expect(page.getByRole('heading', { name: /مرحباً بك يا دكتور/i })).toBeVisible()
  await expect(page.getByLabel(/البريد الإلكتروني/i)).toBeVisible()
  await expect(page.getByLabel(/كلمة المرور/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /تسجيل الدخول/i })).toBeVisible()
})

test('supports keyboard navigation and login submission', async ({ page }) => {
  await page.goto(baseURL)
  await page.getByLabel(/البريد الإلكتروني/i).focus()
  await page.keyboard.type('doctor@example.com')
  await page.getByLabel(/كلمة المرور/i).focus()
  await page.keyboard.type('password123')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /تسجيل الدخول/i })).toBeFocused()
  await page.getByRole('button', { name: /تسجيل الدخول/i }).click()
  await expect(page.getByText(/جارٍ التحميل/i)).toBeVisible({ timeout: 5000 })
})

test('renders the doctor dashboard and patient workflow', async ({ page }) => {
  await page.goto(`${baseURL}/dashboard`)
  await expect(page.getByRole('heading', { name: /لوحة التحكم/i })).toBeVisible()
  await expect(page.getByText(/المرضى/i)).toBeVisible()
  await expect(page.getByText(/أحمد/i)).toBeVisible()
})

test('renders the new patient form and validation state', async ({ page }) => {
  await page.goto(`${baseURL}/new-patient`)
  await expect(page.getByRole('heading', { name: /تسجيل مريض جديد/i })).toBeVisible()
  await page.getByRole('button', { name: /حفظ/i }).click()
  await expect(page.getByText(/من فضلك ادخل اسم المريض/i)).toBeVisible()
})

test('renders results workflow and barcode actions', async ({ page }) => {
  await page.goto(`${baseURL}/results`)
  await expect(page.getByRole('heading', { name: /نتائج التحاليل/i })).toBeVisible()
  await expect(page.getByText(/أحمد/i)).toBeVisible()
  await page.getByRole('button', { name: /عرض تفاصيل أحمد/i }).click()
  await expect(page.getByText(/CBC/i)).toBeVisible()
})

test('renders reports and accessibility elements', async ({ page }) => {
  await page.goto(`${baseURL}/reports`)
  await expect(page.getByRole('heading', { name: /التقارير/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /فتح الإعدادات/i })).toBeVisible()
})

test('renders admin dashboard and lab management flows', async ({ page }) => {
  await page.goto(`${baseURL}/admin`)
  await expect(page.getByRole('heading', { name: /المعامل المشتركة/i })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /البحث عن معمل أو دكتور أو كود تفعيل/i })).toBeVisible()
})

test('renders admin add-lab and notifications workflows', async ({ page }) => {
  await page.goto(`${baseURL}/admin/add-lab`)
  await expect(page.getByRole('heading', { name: /إضافة معمل جديد/i })).toBeVisible()
  await page.getByRole('button', { name: /إنشاء المعمل/i }).click()
  await expect(page.getByText(/من فضلك ملي الحقول المطلوبة/i)).toBeVisible()

  await page.goto(`${baseURL}/admin/notifications`)
  await expect(page.getByRole('heading', { name: /إرسال إشعار/i })).toBeVisible()
})
