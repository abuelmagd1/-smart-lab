// supabase/functions/lab-bridge-proxy/index.ts
//
// بديل آمن لاستخدام SUPABASE_SERVICE_ROLE_KEY مباشرة داخل برنامج الـ Bridge
// المُثبَّت على جهاز كل معمل.
//
// المشكلة القديمة: الـ service_role key بيتخطى كل RLS، وكان بيتوزع كنص عادي
// جوه .env على جهاز كل عميل. أي حد يوصل للجهاز يقدر ياخد المفتاح ده ويوصل
// لبيانات كل المعامل التانية على النظام كله، مش بس معمله.
//
// الحل هنا: المفتاح بيفضل سر جوه Supabase نفسها (Edge Function secret) ومش
// بيوصل لأي جهاز عميل أبدًا. البرنامج على جهاز العميل بيبعت بس activation_code
// بتاعه (زي ما كان بيعمل في activate.js أصلاً)، والفانكشن دي هي اللي بتتحقق
// إن الكود صحيح ومفعّل، وتجيب user_id بتاعه، وتنفذ العملية المطلوبة مقصورة
// على المعمل ده بس. حتى لو حد سرق activation_code لمعمل واحد، مش هيقدر يوصل
// إلا لبيانات المعمل ده بس - مش كل المعامل.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// العمليات المسموح بيها بس - أي action تاني هيترفض فورًا
type ActivateAction = { action: 'activate' }
type FindPatientAction = { action: 'find_patient'; barcodeNum: number }
type UpdateTestAction = { action: 'update_test_result'; testId: string; value: string }
type Payload = { activation_code: string } & (ActivateAction | FindPatientAction | UpdateTestAction)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY مش متضبط في إعدادات Supabase' }, 500)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'JSON غير صحيح' }, 400)
  }

  const { activation_code, action } = payload
  if (!activation_code || typeof activation_code !== 'string') {
    return json({ error: 'activation_code مطلوب' }, 400)
  }

  // العميل الوحيد اللي بيمسك المفتاح السري - وده بيحصل جوه السيرفر بس
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. تحقق من كود التفعيل وجيب user_id بتاع المعمل ده بس
  const { data: lab, error: labError } = await admin
    .from('lab_settings')
    .select('user_id, lab_name, is_active')
    .eq('activation_code', activation_code)
    .single()

  if (labError || !lab || !lab.is_active) {
    return json({ error: 'كود التفعيل غير صحيح أو غير مفعل' }, 401)
  }

  const userId = lab.user_id

  // 2. تنفيذ العملية المطلوبة، مقصورة دايمًا على user_id بتاع المعمل ده
  if (action === 'activate') {
    return json({ lab_name: lab.lab_name || 'المعمل' })
  }

  if (action === 'find_patient') {
    const { barcodeNum } = payload
    if (!Number.isFinite(barcodeNum)) return json({ error: 'barcodeNum غير صحيح' }, 400)

    const { data, error } = await admin
      .from('patients')
      .select('id, name, tests(*)')
      .eq('barcode_seq', barcodeNum)
      .eq('user_id', userId) // <-- الحماية الفعلية: العزل بين المعامل بيحصل هنا سيرفر-لـ-سيرفر
      .limit(1)

    if (error) return json({ error: error.message }, 500)
    return json({ patient: data && data.length > 0 ? data[0] : null })
  }

  if (action === 'update_test_result') {
    const { testId, value } = payload
    if (!testId || typeof testId !== 'string') return json({ error: 'testId مطلوب' }, 400)

    // بنتأكد إن التحليل ده فعلاً بتاع مريض تابع لنفس المعمل قبل التحديث
    const { data: testRow, error: testFetchError } = await admin
      .from('tests')
      .select('id, patients!inner(user_id)')
      .eq('id', testId)
      .single()

    if (testFetchError || !testRow || testRow.patients?.user_id !== userId) {
      return json({ error: 'غير مصرح بتعديل هذا التحليل' }, 403)
    }

    const { error } = await admin
      .from('tests')
      .update({ value, status: 'قيد التحليل' })
      .eq('id', testId)

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: 'action غير معروف' }, 400)
})