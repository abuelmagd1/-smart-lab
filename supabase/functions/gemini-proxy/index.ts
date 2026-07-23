// supabase/functions/gemini-proxy/index.ts
//
// وسيط بين النظام و Gemini API. المفتاح (GEMINI_API_KEY) بيتحفظ كـ "Secret" جوه Supabase
// نفسها ومش بيوصل للمتصفح خالص أبدًا. أي طلب بيوصل هنا لازم يكون من مستخدم مسجل دخول
// فعليًا في النظام (بنتأكد من الـ Authorization token بتاعه)، وبيتقبل بس على مسارات محددة
// سلفًا عشان محدش يستخدم الوسيط ده كـ"باب خلفي" مفتوح لأي استخدام تاني لمفتاحك.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// المسارات المسموح بيها بس - أي مسار تاني هيترفض فورًا
const ALLOWED_PATH_PREFIXES = [
  '/v1/interactions',
  '/v1beta/models/gemini-3.1-flash-tts-preview:generateContent',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: { message: 'GEMINI_API_KEY مش متضبط في إعدادات Supabase' } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. التأكد إن الطالب مستخدم حقيقي مسجل دخول في النظام (مش أي حد بره النظام)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: { message: 'Unauthorized' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: { message: 'Unauthorized' } }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. قراءة الطلب من العميل: { path: '/v1/interactions?alt=sse', body: {...} }
    const { path, body } = await req.json()
    if (!path || typeof path !== 'string') {
      return new Response(
        JSON.stringify({ error: { message: 'path مطلوب' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const isAllowed = ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: { message: 'المسار ده مش مسموح بيه' } }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. تمرير الطلب فعليًا لـ Gemini، والمفتاح بيتضاف هنا بس (سيرفر بسيرفر، مش عن طريق المتصفح)
    const geminiRes = await fetch(GEMINI_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    })

    // 4. تمرير الرد زي ما هو (بما فيه الـ streaming لو الطلب كان stream:true) من غير ما نلمسه
    return new Response(geminiRes.body, {
      status: geminiRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': geminiRes.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err instanceof Error ? err.message : 'خطأ غير معروف' } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})