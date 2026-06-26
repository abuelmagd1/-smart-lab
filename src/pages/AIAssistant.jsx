import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const apiKey = import.meta.env.VITE_GROQ_API_KEY

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
]

const MAX_HISTORY = 20 // آخر 20 رسالة بس

const renderMarkdown = (text) => {
  if (!text) return ''
  return text
    .replace(/### (.+)/g, '<h3 style="font-size:14px;font-weight:bold;margin:8px 0 4px;color:var(--on-surface)">$1</h3>')
    .replace(/## (.+)/g, '<h2 style="font-size:15px;font-weight:bold;margin:10px 0 4px;color:var(--on-surface)">$1</h2>')
    .replace(/# (.+)/g, '<h1 style="font-size:16px;font-weight:bold;margin:10px 0 4px;color:var(--on-surface)">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[-–•]\s+(.+)/gm, '<div style="display:flex;gap:6px;margin:3px 0"><span style="color:var(--primary-container)">•</span><span>$1</span></div>')
    .replace(/---+/g, '<hr style="border:none;border-top:1px solid var(--outline-variant);margin:8px 0"/>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_new_patient',
      description: 'يحفظ مريض جديد في النظام.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          gender: { type: 'string', enum: ['ذكر', 'أنثى'] },
          phone: { type: 'string' },
          doctor: { type: 'string' },
          tests: { type: 'array', items: { type: 'string' } }
        },
        required: ['name', 'age', 'gender']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_test_result',
      description: 'يحفظ نتيجة تحليل لمريض.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          test_name: { type: 'string' },
          value: { type: 'string' }
        },
        required: ['patient_name', 'test_name', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_patient_info',
      description: 'يعدل بيانات مريض موجود.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          new_name: { type: 'string' },
          new_age: { type: 'number' },
          new_gender: { type: 'string', enum: ['ذكر', 'أنثى'] },
          new_doctor: { type: 'string' },
          new_phone: { type: 'string' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_patient',
      description: 'يمسح مريض وكل تحاليله.',
      parameters: {
        type: 'object',
        properties: { patient_name: { type: 'string' } },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_tests_to_patient',
      description: 'يضيف تحاليل لمريض موجود.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          tests: { type: 'array', items: { type: 'string' } }
        },
        required: ['patient_name', 'tests']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_patient_report',
      description: 'يفتح تقرير مريض للطباعة.',
      parameters: {
        type: 'object',
        properties: { patient_name: { type: 'string' } },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'answer_question',
      description: 'يجاوب على أي سؤال طبي أو عام أو معلوماتي.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  }
]

// ── Fetch مع retry أسرع: مرة واحدة لكل موديل بدون تأخير زيادة ──
const fetchWithRetry = async (body) => {
  for (const model of MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ ...body, model })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.choices?.[0]?.message) return data
      }
    } catch { }
  }
  // last resort بدون tools
  for (const model of MODELS) {
    try {
      const { tools, tool_choice, parallel_tool_calls, ...rest } = body
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ ...rest, model })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.choices?.[0]?.message) return data
      }
    } catch { }
  }
  return null
}

// أزرار الاختصارات السريعة
const QUICK_ACTIONS = [
  { label: '➕ مريض جديد', text: 'عاوز أسجل مريض جديد' },
  { label: '🔬 إيه التحاليل المتاحة؟', text: 'إيه التحاليل المتاحة في المعمل؟' },
  { label: '📋 المرضى الحاليين', text: 'إيه المرضى اللي عندي دلوقتي؟' },
  { label: '📄 طباعة تقرير', text: 'عاوز أطبع تقرير مريض' },
]

export default function AIAssistant() {
  const navigate = useNavigate()
  const { chatMessages: messages, setChatMessages: setMessages, chatHistoryRef: historyRef } = useOutletContext()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const messagesEndRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const inputRef = useRef(null)

  // ── Cache المرضى والكاتالوج في ref عشان ما نعملش fetch في كل turn ──
  const cacheRef = useRef({ patients: null, catalog: null, lastFetch: 0 })
  const CACHE_TTL = 30_000 // 30 ثانية

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // ── جلب البيانات مع cache ──
  const getData = useCallback(async (forceRefresh = false) => {
    const now = Date.now()
    if (!forceRefresh && cacheRef.current.patients && (now - cacheRef.current.lastFetch < CACHE_TTL)) {
      return { patients: cacheRef.current.patients, catalog: cacheRef.current.catalog }
    }
    const [{ data: patients }, { data: catalog }] = await Promise.all([
      supabase.from('patients').select('*, tests(*)'),
      supabase.from('test_catalog').select('*')
    ])
    cacheRef.current = { patients: patients || [], catalog: catalog || [], lastFetch: now }
    return { patients: patients || [], catalog: catalog || [] }
  }, [])

  const findPatient = (patients, name) => {
    if (!name) return null
    const n = name.trim().toLowerCase()
    return patients.find(p => p.name?.trim().toLowerCase() === n)
      || patients.find(p => p.name?.toLowerCase().includes(n))
      || patients.find(p => n.includes(p.name?.toLowerCase()))
  }

  const findTest = (tests, name) => {
    if (!name) return null
    const n = name.trim().toLowerCase()
    return tests?.find(t => t.name?.toLowerCase() === n)
      || tests?.find(t => t.name?.toLowerCase().includes(n))
      || tests?.find(t => n.includes(t.name?.toLowerCase()))
  }

  // ── بناء system prompt بدون تكرار في كل message ──
  const buildSystemPrompt = (patients, catalog) => {
    let catalogInfo = ''
    if (catalog.length) {
      const grouped = {}
      catalog.forEach(t => {
        const cat = t.category || 'عام'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(t.name)
      })
      catalogInfo = Object.entries(grouped)
        .map(([cat, tests]) => `${cat}: ${tests.join('، ')}`)
        .join('\n')
    }

    const patientsInfo = patients.length
      ? patients.map(p =>
        `- ${p.name} (${p.age}سنة، ${p.gender}) | دكتور: ${p.doctor || '-'} | تحاليل: ${p.tests?.map(t =>
          `${t.name}: ${t.value || 'لم تدخل'} ${t.unit || ''} [${t.normal_range || ''}] - ${t.status}`
        ).join(', ') || 'لا يوجد'}`
      ).join('\n')
      : 'مفيش مرضى دلوقتي'

    return `أنت "لابو"، مساعد ذكي في معمل طبي، شخصيتك:
- بتتكلم بالعربية العامية المصرية البسيطة وبروح وحماس
- عندك معرفة موسوعية في كل المجالات
- بتنفذ الطلبات فوراً لو واضحة
- بتقول "تمام ✅" بعد أي تنفيذ ناجح مع وصف قصير لما عملته
- لو سألوا مين عملك: "عمي وعمك المهندس أبو المجد 😄"

قواعد التنفيذ:
- save_new_patient: استخرج كل البيانات من رسالة المستخدم دفعة واحدة. لو ناقص بيانات (اسم أو سن أو جنس) اسأل عنهم كلهم في سؤال واحد. لو عندك كل البيانات، لخّصها واسأل تأكيد واحد فقط ثم نفّذ فوراً.
- لو المستخدم قال "ذكر/أنثى/واحد/واحدة/بنت/ولد/راجل/ست" افهمها كجنس تلقائياً بدون سؤال.
- save_test_result: نفّذ فوراً بدون سؤال
- open_patient_report: افتح فوراً
- answer_question: استخدمها للأسئلة العامة والطبية والمعلوماتية
- لو الطلب غير واضح: فكّر في أقرب أمر من (تسجيل مريض، حفظ نتيجة، تعديل بيانات، مسح مريض، إضافة تحاليل، فتح تقرير) واسأل "هل تقصد إني أعملك [الأمر]؟" لو قال آه نفّذ، لو قال لا قوله "طب قولي إيه اللي عاوز تعمله بالظبط؟"
- لا تقول "تمام" وحدها أبداً كرد نهائي بدون تنفيذ أو إجابة حقيقية

قواعد التحاليل (مهم جداً):
- لو حد طلب تحليل أو مجموعة تحاليل، دوّر في الكاتالوج المتاح واقترح الأقرب
- لو حد قال "تحاليل دم" أو "CBC" أو كلام عام، اعرض التحاليل المتاحة في نفس الفئة واسأله إيه اللي يحتاجه
- لو التحليل مش موجود في الكاتالوج، قوله "التحليل ده مش متاح دلوقتي" واقترح الأقرب
- لو سأل "إيه التحاليل المتاحة؟" اعرض الكاتالوج كامل مرتب بالفئات

قواعد الردود:
- لا ### ولا ** ولا جداول
- مختصر عند التنفيذ، مفصّل وبحماس عند الأسئلة
- النصائح الغذائية: أمثلة بالعامية (مش "بروتين"، قول "فراخ وبيض وفول")

التحاليل المتاحة في المعمل:
${catalogInfo || 'لم يتم إضافة تحاليل للكاتالوج بعد'}

بيانات المرضى الحاليين:
${patientsInfo}`
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي عاوز تعمله!' }])
    historyRef.current = []
    setShowQuickActions(true)
  }

  // ── تقليم التاريخ لآخر MAX_HISTORY رسالة ──
  const trimHistory = () => {
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY)
    }
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setShowQuickActions(false)
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)
    historyRef.current.push({ role: 'user', content: trimmed })
    trimHistory()

    // جلب البيانات مرة واحدة بس في بداية كل رسالة
    const { patients, catalog } = await getData()

    try { await runAssistantTurn(patients, catalog) } catch { }
    finally { setLoading(false) }
  }

  // ── patients و catalog بيتبعتوا كـ params مش بيتجلبوا من جوا ──
  const runAssistantTurn = async (patients, catalog, depth = 0) => {
    if (depth > 8) return

    const systemPrompt = buildSystemPrompt(patients, catalog)

    const data = await fetchWithRetry({
      messages: [
        // system كـ أول message بالـ role الصح اللي Groq بيدعمه
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'ابدأ.' },
        { role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي عاوز تعمله!' },
        ...historyRef.current
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_tokens: 2048
    })

    if (!data) {
      console.error('all models failed silently')
      return
    }

    const choice = data.choices[0].message

    if (choice.tool_calls?.length) {
      historyRef.current.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })
      for (const call of choice.tool_calls) {
        const result = await handleToolCall(call, patients, catalog)
        historyRef.current.push({ role: 'tool', tool_call_id: call.id, content: String(result) })

        // بعد tool call اللي بيعدل داتا، نعمل refresh للـ cache
        const mutatingTools = ['save_new_patient', 'save_test_result', 'update_patient_info', 'delete_patient', 'add_tests_to_patient']
        if (mutatingTools.includes(call.function.name)) {
          const fresh = await getData(true) // force refresh
          patients = fresh.patients
          catalog = fresh.catalog
        }
      }
      await runAssistantTurn(patients, catalog, depth + 1)
      return
    }

    const reply = choice.content || 'تمام!'
    historyRef.current.push({ role: 'assistant', content: reply })
    trimHistory()
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    speakText(reply)
  }

  const handleToolCall = async (call, patients, catalog) => {
    let args = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch { }
    const showStatus = (text) => setMessages(prev => [...prev, { role: 'status', content: text }])

    try {
      if (call.function.name === 'save_new_patient') {
        showStatus(`⏳ بيسجل ${args.name}...`)
        const { data: patient, error } = await supabase.from('patients').insert([{
          name: args.name, age: parseInt(args.age) || 0, gender: args.gender,
          phone: args.phone || null, doctor: args.doctor || null,
        }]).select().single()
        if (error || !patient) return `مش قدر يسجل المريض، جرب تاني`

        if (args.tests?.length) {
          const testsToInsert = args.tests.map(name => {
            const found = catalog?.find(c => c.name?.toLowerCase() === name.toLowerCase())
              || catalog?.find(c => c.name?.toLowerCase().includes(name.toLowerCase()))
            return {
              patient_id: patient.id, name: found?.name || name,
              normal_range: found?.normal_range || null, unit: found?.unit || null, status: 'معلق'
            }
          })
          await supabase.from('tests').insert(testsToInsert)
        }
        return `تم تسجيل "${args.name}" بنجاح ✅ مع ${args.tests?.length || 0} تحليل`
      }

      if (call.function.name === 'save_test_result') {
        showStatus(`⏳ بيحفظ نتيجة ${args.test_name}...`)
        const patient = findPatient(patients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`
        const test = findTest(patient.tests, args.test_name)
        if (!test) return `مش لاقي تحليل "${args.test_name}"`
        const { error } = await supabase.from('tests').update({ value: args.value, status: 'مكتمل' }).eq('id', test.id)
        if (error) return `مش قدر يحفظ، جرب تاني`
        return `تم حفظ "${args.test_name}" = ${args.value} ✅`
      }

      if (call.function.name === 'update_patient_info') {
        showStatus(`⏳ بيعدل بيانات ${args.patient_name}...`)
        const patient = findPatient(patients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`
        const updates = {}
        if (args.new_name) updates.name = args.new_name
        if (args.new_age) updates.age = parseInt(args.new_age)
        if (args.new_gender) updates.gender = args.new_gender
        if (args.new_doctor) updates.doctor = args.new_doctor
        if (args.new_phone) updates.phone = args.new_phone
        if (!Object.keys(updates).length) return 'مفيش تعديلات محددة'
        const { error } = await supabase.from('patients').update(updates).eq('id', patient.id)
        if (error) return `مش قدر يعدل، جرب تاني`
        return `تم تعديل بيانات "${args.patient_name}" ✅`
      }

      if (call.function.name === 'delete_patient') {
        showStatus(`⏳ بيمسح ${args.patient_name}...`)
        const patient = findPatient(patients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`
        await supabase.from('tests').delete().eq('patient_id', patient.id)
        const { error } = await supabase.from('patients').delete().eq('id', patient.id)
        if (error) return `مش قدر يمسح، جرب تاني`
        return `تم مسح "${args.patient_name}" وكل تحاليله ✅`
      }

      if (call.function.name === 'add_tests_to_patient') {
        showStatus(`⏳ بيضيف تحاليل...`)
        const patient = findPatient(patients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`
        const testsToInsert = (args.tests || []).map(name => {
          const found = catalog?.find(c => c.name?.toLowerCase() === name.toLowerCase())
            || catalog?.find(c => c.name?.toLowerCase().includes(name.toLowerCase()))
          return {
            patient_id: patient.id, name: found?.name || name,
            normal_range: found?.normal_range || null, unit: found?.unit || null, status: 'معلق'
          }
        })
        await supabase.from('tests').insert(testsToInsert)
        return `تم إضافة ${args.tests?.length || 0} تحليل للمريض "${args.patient_name}" ✅`
      }

      if (call.function.name === 'open_patient_report') {
        const match = findPatient(patients, args.patient_name)
        if (match) {
          navigate('/reports', { state: { autoSelectPatientId: match.id } })
          return `تم فتح تقرير "${match.name}" ✅`
        }
        return `مش لاقي مريض اسمه "${args.patient_name}"`
      }

      if (call.function.name === 'answer_question') {
        // ── بدل API call تانية، بنرجع السؤال للموديل نفسه يجاوب ──
        return `[أجب على السؤال ده مباشرة بالعامية المصرية: ${args.query}]`
      }

    } catch (err) {
      console.error('tool error:', err)
      return 'حصل حاجة، جرب تاني'
    }
    return 'تمام!'
  }

  const toggleListening = () => { if (listening) stopListening(); else startListening() }

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = stream
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        await transcribeAudio(blob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch { alert('محتاجين إذن الميكروفون') }
  }

  const stopListening = () => { mediaRecorderRef.current?.stop(); setListening(false) }

  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'rec.webm')
      formData.append('model', 'whisper-large-v3')
      formData.append('language', 'ar')
      formData.append('prompt', 'Hemoglobin, Glucose, CBC, ESR, CRP, Creatinine, Urea, ALT, AST, TSH, T3, T4')
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      })
      if (res.ok) {
        const data = await res.json()
        const transcript = data.text?.trim()
        if (transcript) { sendMessage(transcript); return }
      }
    } catch { }
    setLoading(false)
  }

  const splitForTTS = (text) => {
    const clean = text.replace(/[#*|<>]/g, '').replace(/\n+/g, ' ').trim()
    const chunks = []
    let remaining = clean
    while (remaining.length > 0) {
      const piece = remaining.slice(0, 180)
      remaining = remaining.slice(180)
      if (piece.trim()) chunks.push({
        text: piece.trim(),
        isArabic: (piece.match(/[\u0600-\u06FF]/g) || []).length > piece.length * 0.25
      })
    }
    return chunks
  }

  // ── TTS: شغّل الـ chunks بالتوازي مع ترتيب بدل ما تنتظر كل واحدة ──
  const speakText = async (text) => {
    const chunks = splitForTTS(text)

    // جلب الـ blobs كلها مع بعض
    const fetches = chunks.map(chunk =>
      fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chunk.isArabic ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english',
          voice: chunk.isArabic ? 'lulwa' : 'hannah',
          input: chunk.text,
          response_format: 'wav'
        })
      }).then(r => r.ok ? r.blob() : null).catch(() => null)
    )

    const blobs = await Promise.all(fetches)

    // تشغيل بالترتيب
    for (const blob of blobs) {
      if (!blob) continue
      const url = URL.createObjectURL(blob)
      await new Promise(resolve => {
        const audio = new Audio(url)
        audio.onended = () => { URL.revokeObjectURL(url); resolve() }
        audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
        audio.play().catch(() => resolve())
      })
    }
  }

  return (
    <div className="flex flex-col p-6 pb-0" style={{ height: 'calc(100vh - 65px)' }} dir="rtl">

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المساعد الذكي</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تحدث أو اكتب لمساعدك الذكي "لابو"</p>
        </div>
        <button onClick={clearChat}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)', border: '1px solid var(--outline-variant)' }}>
          🗑️ مسح المحادثة
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => {
          if (msg.role === 'status') return (
            <div key={i} className="flex justify-center">
              <div className="px-3 py-1 rounded-full text-xs" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                {msg.content}
              </div>
            </div>
          )
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ml-2 mt-1"
                  style={{ background: 'var(--primary-container)', color: 'white' }}>
                  🤖
                </div>
              )}
              <div className="max-w-lg px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: msg.role === 'user' ? 'var(--primary-container)' : 'white',
                  color: msg.role === 'user' ? 'white' : 'var(--on-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--outline-variant)' : 'none',
                  lineHeight: '1.8'
                }}>
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content
                }
              </div>
            </div>
          )
        })}

        {/* Loading */}
        {loading && (
          <div className="flex justify-end items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: 'var(--primary-container)', color: 'white' }}>
              🤖
            </div>
            <div className="px-4 py-3 rounded-2xl text-sm bg-white flex items-center gap-1"
              style={{ border: '1px solid var(--outline-variant)' }}>
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary-container)', animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary-container)', animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--primary-container)', animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {showQuickActions && messages.length <= 1 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs text-center" style={{ color: 'var(--on-surface-variant)' }}>اختصارات سريعة</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action, i) => (
                <button key={i} onClick={() => sendMessage(action.text)}
                  className="text-sm px-3 py-2 rounded-xl text-right transition-all"
                  style={{ background: 'white', border: '1px solid var(--outline-variant)', color: 'var(--on-surface)' }}
                  onMouseEnter={e => e.target.style.borderColor = 'var(--primary-container)'}
                  onMouseLeave={e => e.target.style.borderColor = 'var(--outline-variant)'}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="py-4 flex gap-3" style={{ borderTop: '1px solid var(--outline-variant)' }}>
        <button onClick={toggleListening}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{
            background: listening ? '#fee2e2' : '#f1f3f4',
            border: listening ? '2px solid #ef4444' : '1px solid var(--outline-variant)'
          }}>
          {listening ? '🔴' : '🎤'}
        </button>

        <input ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
          placeholder="اكتب سؤالك أو أمرك هنا..."
          className="flex-1 px-4 py-3 rounded-xl outline-none text-right"
          style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
          onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
          onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          disabled={loading}
        />

        <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: loading || !input.trim() ? '#94a3b8' : 'var(--primary-container)' }}>
          ➤
        </button>
      </div>
    </div>
  )
}

