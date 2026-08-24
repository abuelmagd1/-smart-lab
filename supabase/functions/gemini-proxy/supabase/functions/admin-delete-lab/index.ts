// supabase/functions/admin-delete-lab/index.ts
//
// حذف نهائي وكامل لمعمل: كل مرضاه وتحاليلهم، إعدادات المعمل، صف الـ profile،
// وحساب الدخول (Supabase Auth) نفسه. القرار ده مقصود: زرار "إيقاف" (توجد له
// وظيفة منفصلة بالفعل في AdminDashboard.jsx عبر تحديث is_active) هو الخيار
// الآمن والقابل للتراجع، وزرار "حذف" هو نهائي تمامًا ولا يمكن التراجع عنه -
// فرق واضح ومقصود بين الاتنين، مش تكرار لنفس الوظيفة.
//
// ليه لازم يكون Edge Function مش استدعاء مباشر من المتصفح: مسح حساب Auth
// فعليًا (auth.admin.deleteUser) محتاج الـ service_role key، واللي مينفعش
// يوصل لمتصفح الأدمن أبدًا (زي ما موضح في تعليق gemini-proxy). فالمتصفح
// بيبعت هنا بس JWT بتاع الأدمن نفسه، والفانكشن دي بتتأكد إنه فعلاً أدمن قبل
// ما تنفذ أي حذف.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server misconfiguration' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'مطلوب تسجيل دخول' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. تحقق من هوية المستخدم اللي بيطلب الحذف، وإنه فعلاً أدمن - مش بس مسجل
  //    دخول. من غير الفحص ده، أي مستخدم عادي كان يقدر يحذف أي معمل تاني.
  const { data: callerUser, error: callerError } = await admin.auth.getUser(callerToken)
  if (callerError || !callerUser?.user) {
    return json({ error: 'الجلسة غير صالحة، سجّل دخول تاني' }, 401)
  }

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerUser.user.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'غير مصرح لك بالحذف - للأدمن بس' }, 403)
  }

  let payload: { labUserId?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'بيانات الطلب غير صحيحة' }, 400)
  }

  const labUserId = payload.labUserId
  if (!labUserId || typeof labUserId !== 'string') {
    return json({ error: 'labUserId مطلوب' }, 400)
  }

  // منع الأدمن من حذف نفسه بالغلط عن طريق الفانكشن دي
  if (labUserId === callerUser.user.id) {
    return json({ error: 'مينفعش تحذف حسابك انت بالطريقة دي' }, 400)
  }

  const steps: Record<string, string> = {}

  try {
    // 2. اجمع IDs بتاعة كل مرضى المعمل ده الأول
    const { data: patients, error: patientsFetchError } = await admin
      .from('patients')
      .select('id')
      .eq('user_id', labUserId)

    if (patientsFetchError) throw new Error('فشل جلب قائمة المرضى: ' + patientsFetchError.message)

    const patientIds = (patients || []).map((p) => p.id)
    steps.patientsFound = String(patientIds.length)

    // 3. امسح كل التحاليل بتاعة المرضى دول (لو فيه مرضى أصلاً)
    if (patientIds.length > 0) {
      const { error: testsError } = await admin.from('tests').delete().in('patient_id', patientIds)
      if (testsError) throw new Error('فشل حذف التحاليل: ' + testsError.message)
      steps.tests = 'deleted'

      const { error: patientsDeleteError } = await admin.from('patients').delete().eq('user_id', labUserId)
      if (patientsDeleteError) throw new Error('فشل حذف المرضى: ' + patientsDeleteError.message)
      steps.patients = 'deleted'
    } else {
      steps.tests = 'none'
      steps.patients = 'none'
    }

    // 4. امسح اللوجو من الـ Storage لو موجود (بنحاول بس مش بنوقف الحذف لو فشلت)
    try {
      await admin.storage.from('logos').remove([`${labUserId}.jpg`])
      steps.logo = 'removed'
    } catch {
      steps.logo = 'skip_or_missing'
    }

    // 5. امسح إعدادات المعمل
    const { error: settingsError } = await admin.from('lab_settings').delete().eq('user_id', labUserId)
    if (settingsError) throw new Error('فشل حذف إعدادات المعمل: ' + settingsError.message)
    steps.labSettings = 'deleted'

    // 6. امسح صف الـ profile
    const { error: profileError } = await admin.from('profiles').delete().eq('id', labUserId)
    if (profileError) throw new Error('فشل حذف الـ profile: ' + profileError.message)
    steps.profile = 'deleted'

    // 7. أخيرًا امسح حساب الدخول نفسه (Auth) - ده اللي محتاج service_role
    //    فعليًا ومينفعش يتعمل من غير الفانكشن دي
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(labUserId)
    if (authDeleteError) throw new Error('فشل حذف حساب الدخول: ' + authDeleteError.message)
    steps.authAccount = 'deleted'

    return json({ ok: true, steps })
  } catch (err) {
    // بنرجّع بالظبط لحد فين وصل الحذف قبل ما يفشل - مفيد جدًا لو محتاج
    // تكمل يدويًا من Supabase Dashboard في حالة نادرة زي مشكلة شبكة مؤقتة
    return json({ error: (err as Error).message, partialProgress: steps }, 500)
  }
})