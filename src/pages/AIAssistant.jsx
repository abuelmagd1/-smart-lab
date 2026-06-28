import { useState, useRef, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const apiKey = import.meta.env.VITE_GROQ_API_KEY

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

const formatClock = (ts) => ts ? new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''
const formatTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const SUGGESTIONS = ['سجّل مريض جديد', 'إيه أسباب ارتفاع السكر؟', 'اعرض حالة مريض معين', 'افتح تقرير مريض للطباعة']

const MAX_HISTORY = 40
const MAX_RECORDING_MS = 120000

const trimHistory = (history) => {
  if (history.length <= MAX_HISTORY) return history
  let cutIndex = history.length - MAX_HISTORY
  while (cutIndex < history.length && history[cutIndex].role !== 'user') cutIndex++
  return history.slice(cutIndex)
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)

  const outerSignal = options.signal
  const onOuterAbort = () => controller.abort()
  outerSignal?.addEventListener('abort', onOuterAbort)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError' && timedOut) {
      const timeoutErr = new Error('انتهى وقت الانتظار، الخدمة بطيئة دلوقتي')
      timeoutErr.name = 'TimeoutError'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    outerSignal?.removeEventListener('abort', onOuterAbort)
  }
}

const fetchWithRetry = async (url, options, timeoutMs, retries = 1) => {
  try {
    return await fetchWithTimeout(url, options, timeoutMs)
  } catch (err) {
    if (retries > 0 && err.name !== 'AbortError' && err.name !== 'TimeoutError') {
      await new Promise(r => setTimeout(r, 1000))
      return fetchWithRetry(url, options, timeoutMs, retries - 1)
    }
    throw err
  }
}

const safeJson = async (response) => {
  try {
    return await response.json()
  } catch {
    throw new Error('استجابة غير صالحة من الخادم')
  }
}

const resolvePatient = (patients, name, age) => {
  const target = (name || '').trim()
  if (!target) return { notFound: true }

  let candidates = patients.filter(p => p.name?.trim() === target)
  if (candidates.length === 0) candidates = patients.filter(p => p.name?.includes(target))
  if (candidates.length === 0) return { notFound: true }

  if (candidates.length > 1 && age) {
    const narrowed = candidates.filter(p => String(p.age) === String(age))
    if (narrowed.length === 1) return { match: narrowed[0] }
  }
  if (candidates.length === 1) return { match: candidates[0] }
  return { ambiguous: candidates }
}

const ambiguityMessage = (candidates) => {
  const list = candidates.map(p => `- ${p.name} (${p.age} سنة، ${p.gender}${p.doctor ? '، دكتور: ' + p.doctor : ''})`).join('\n')
  return `في أكتر من مريض بنفس الاسم تقريبًا، اسأل المستخدم يحدد المريض بالظبط (بالسن أو الدكتور المحوّل):\n${list}`
}

const matchTestsAgainstCatalog = (testNames, catalog) => {
  const matched = []
  const notFound = []
  testNames.forEach(name => {
    const found = catalog?.find(c => c.name.toLowerCase() === name.toLowerCase())
      || catalog?.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
    if (found) matched.push({ name: found.name, normal_range: found.normal_range, unit: found.unit })
    else { matched.push({ name, normal_range: null, unit: null }); notFound.push(name) }
  })
  return { matched, notFound }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_new_patient',
      description: 'يعرض بيانات مريض جديد على المستخدم في الشات لتأكيد الحفظ. لا يحفظ البيانات مباشرة في القاعدة أبدًا.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'اسم المريض كامل' },
          age: { type: 'number', description: 'سن المريض' },
          gender: { type: 'string', enum: ['ذكر', 'أنثى'] },
          phone: { type: 'string', description: 'رقم تليفون المريض (اختياري)' },
          doctor: { type: 'string', description: 'اسم الطبيب المحوّل (اختياري)' },
          tests: { type: 'array', items: { type: 'string' }, description: 'أسماء التحاليل المطلوبة' }
        },
        required: ['name', 'age', 'gender']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_test_result',
      description: 'يعرض نتيجة تحليل على المستخدم في الشات لتأكيد الحفظ. لا يحفظ النتيجة مباشرة أبدًا.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض' },
          patient_age: { type: 'number', description: 'سن المريض (اختياري، يُستخدم فقط لو في أكتر من مريض بنفس الاسم)' },
          test_name: { type: 'string', description: 'اسم التحليل' },
          value: { type: 'string', description: 'قيمة النتيجة' }
        },
        required: ['patient_name', 'test_name', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_patient',
      description: 'يعرض تعديل بيانات مريض موجود على المستخدم في الشات لتأكيد الحفظ. لا يعدّل البيانات مباشرة أبدًا.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض الحالي في النظام' },
          patient_age: { type: 'number', description: 'سن المريض الحالي (اختياري، للتفريق لو في أكتر من مريض بنفس الاسم)' },
          new_name: { type: 'string', description: 'الاسم الجديد (اختياري)' },
          new_age: { type: 'number', description: 'السن الجديد (اختياري)' },
          new_gender: { type: 'string', enum: ['ذكر', 'أنثى'], description: 'الجنس الجديد (اختياري)' },
          new_doctor: { type: 'string', description: 'اسم الدكتور الجديد (اختياري)' },
          new_phone: { type: 'string', description: 'رقم الموبايل الجديد (اختياري)' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_patient',
      description: 'يعرض طلب حذف مريض وكل تحاليله على المستخدم في الشات لتأكيد الحذف. لا يحذف مباشرة أبدًا.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض المطلوب حذفه' },
          patient_age: { type: 'number', description: 'سن المريض (اختياري، للتفريق لو في أكتر من مريض بنفس الاسم)' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_tests_to_patient',
      description: 'يضيف تحاليل جديدة لمريض موجود بالفعل (عملية إضافية غير مدمّرة، فتُنفَّذ فورًا بدون تأكيد).',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          patient_age: { type: 'number', description: 'سن المريض (اختياري، للتفريق لو في أكتر من مريض بنفس الاسم)' },
          tests: { type: 'array', items: { type: 'string' }, description: 'أسماء التحاليل الجديدة' }
        },
        required: ['patient_name', 'tests']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_patient',
      description: 'يجيب التفاصيل الكاملة لمريض معين (تحاليله، نتائجه، حالته) بالاسم. استخدمها أول ما تحتاج أي تفصيل عن مريض معين.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          patient_age: { type: 'number', description: 'سن المريض (اختياري، للتفريق لو في أكتر من مريض بنفس الاسم)' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_patient_report',
      description: 'يفتح صفحة التقارير ويحدد مريض معين للطباعة فورًا.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' },
          patient_age: { type: 'number', description: 'سن المريض (اختياري، للتفريق لو في أكتر من مريض بنفس الاسم)' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_medical_info',
      description: 'يبحث في الإنترنت عن معلومات طبية دقيقة وحديثة.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  }
]

export default function AIAssistant() {
  const navigate = useNavigate()
  const context = useOutletContext() || {}
  const { chatMessages: messages, setChatMessages: setMessages, chatHistoryRef: historyRef } = context

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState(null)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const textareaRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const abortControllerRef = useRef(null)
  const recordingTimeoutRef = useRef(null)
  const recordingIntervalRef = useRef(null)
  const currentAudioRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current)
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
    }
  }, [])

  if (!messages || !setMessages || !historyRef) {
    return (
      <div className="p-6" dir="rtl">
        <div className="p-4 rounded-xl text-sm" style={{ background: '#fee2e2', color: '#dc2626' }}>
          حصل خطأ في تحميل صفحة المساعد الذكي. تأكد إن الصفحة الأساسية (Layout) بتمرر chatMessages و setChatMessages و chatHistoryRef بشكل صحيح.
        </div>
      </div>
    )
  }

  const getPatients = async () => {
    const { data } = await supabase.from('patients').select('*, tests(*)')
    return data || []
  }

  const stopSpeaking = () => {
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null }
    setIsSpeaking(false)
  }

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150)
  }

  const copyMessage = (i, content) => {
    navigator.clipboard?.writeText(content)
    setCopiedIndex(i)
    setTimeout(() => setCopiedIndex(null), 1500)
  }

  const adjustTextareaHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    adjustTextareaHeight()
  }

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    stopSpeaking()

    setMessages(prev => [...prev, { role: 'user', content: trimmed, time: Date.now() }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    historyRef.current.push({ role: 'user', content: trimmed })
    historyRef.current = trimHistory(historyRef.current)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      await runAssistantTurn(controller.signal)
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'status', content: '⏹ تم إيقاف الطلب', time: Date.now() }])
      } else if (err.name === 'TimeoutError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'الخدمة بطيئة دلوقتي ومحتاجة وقت أطول من المتوقع.', retryText: trimmed, time: Date.now() }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'حدث خطأ، حاول تاني.', retryText: trimmed, time: Date.now() }])
      }
    } finally {
      setLoading(false)
      abortControllerRef.current = null
      textareaRef.current?.focus()
    }
  }

  const stopGeneration = () => { abortControllerRef.current?.abort() }

  const runAssistantTurn = async (signal, depth = 0) => {
    if (depth > 6) return

    const patients = await getPatients()
    const roster = patients.map(p => `${p.name} (${p.age} سنة، ${p.gender})`).join('، ')

    const systemPrompt = `أنت "لابو"، مساعد ذكي autonomous بتشتغل في معمل طبي، وعندك معرفة موسوعية واسعة في كل المجالات (طب، علوم، تاريخ، تكنولوجيا، رياضة، فن، حياة عامة... أي موضوع).

شخصيتك:
- بتتكلم بالعربية العامية المصرية البسيطة
- عندك معلومات دقيقة وعميقة في كل حاجة تقريباً، ولما حد يسألك سؤال عام (مش بس طبي) جاوبه بثقة ومعرفة حقيقية، مش بس "مش متخصص في كده"
- أسلوبك في الرد ممتع وجذاب: بتستخدم تشبيهات بسيطة، نكتة خفيفة أحياناً، حماس في الكلام، مش رد جاف أو روبوتي
- لما بتنفذ حاجة فورًا، بتقول "تمام، عملت كذا ✅" بشكل مختصر وبطعم شخصيتك

بيانات المرضى المتاحة لك حاليًا (أسماء بس، بدون تفاصيل التحاليل):
عدد المرضى: ${patients.length}
${roster || 'لا يوجد مرضى حاليًا'}

لو احتجت أي تفصيل عن مريض معين (تحاليله، نتائجه، حالته)، استخدم أداة find_patient أولاً قبل الرد أو قبل تنفيذ أي أداة أخرى عليه. لا تخمّن بيانات مريض من نفسك أبدًا.

قواعد التأكيد قبل التنفيذ (مهم جدًا، أمان البيانات الطبية يعتمد عليها):
- propose_new_patient، propose_test_result، propose_update_patient، propose_delete_patient: الأربعة دول بيعرضوا البيانات في الشات للمستخدم يأكدها بنفسه، وما بيحفظوش أو يعدّلوا أو يمسحوا حاجة فعليًا. لو استخدمت واحدة منهم، قول للمستخدم إن البيانات معروضة وتنتظر تأكيده، ومتقولش أبدًا إن العملية "تمت".
- add_tests_to_patient و open_patient_report و find_patient و search_medical_info: آمنين (إضافة بس، أو قراءة، أو بحث)، فنفّذهم فورًا بدون انتظار تأكيد.
- لو الأداة رجعت لك رسالة فيها "في أكتر من مريض بنفس الاسم"، اسأل المستخدم يحدد قبل ما تكمل، لا تخمّن.

التعامل مع الكلام الغامض أو الصوت غير الواضح:
- لو الرسالة غير واضحة وما تقدرش تحدد بدقة إنها تطابق أمر معين، لا تستخدم أي أداة فوراً، خمّن أقرب أمر واسأل المستخدم بوضوح
- لو رد بالإيجاب، استخدم الأداة المناسبة. لو رد بالنفي، قول له يتكلم أو يكتب أوضح ولا تنفذ أي شيء

لو سُئلت عن هويتك أو مين اللي عملك:
- رد بس بـ: "عمي وعمك المهندس أبو المجد 😄" ومتفتحش الموضوع أكتر

قواعد الردود:
- لا تستخدم ### أو ** أو جداول
- ردودك مختصرة ومباشرة لما تكون بتنفذ أمر، وأطول شوية مع روح وحماس لما يسألك سؤال عام أو معرفي

قواعد النصائح الغذائية:
- لما تقترح أنواع أكل معينة، لازم تدي أمثلة ملموسة بالعامية المصرية (زي "كل أكل غني بالحديد، زي اللحمة والسبانخ والعدس")`

    const response = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal,
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'user', content: systemPrompt + '\n\nابدأ.' },
          { role: 'assistant', content: 'أهلاً! أنا لابو، جاهز أساعدك 😊' },
          ...historyRef.current
        ],
        tools: TOOLS,
        tool_choice: 'auto',
        parallel_tool_calls: true
      })
    }, 35000, 1)

    const data = await safeJson(response)
    const choice = data.choices?.[0]?.message

    if (choice?.tool_calls?.length) {
      historyRef.current.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })

      for (const call of choice.tool_calls) {
        let result
        try {
          result = await handleToolCall(call, signal, patients)
        } catch (err) {
          if (err.name === 'AbortError') throw err
          result = `حصل خطأ غير متوقع في تنفيذ هذه العملية: ${err.message}`
        }
        historyRef.current.push({ role: 'tool', tool_call_id: call.id, content: result })
      }

      historyRef.current = trimHistory(historyRef.current)
      await runAssistantTurn(signal, depth + 1)
      return
    }

    const reply = choice?.content || 'حدث خطأ.'
    historyRef.current.push({ role: 'assistant', content: reply })
    setMessages(prev => [...prev, { role: 'assistant', content: reply, time: Date.now() }])
    speakText(reply)
  }

  const showStatus = (text) => {
    setMessages(prev => [...prev, { role: 'status', content: text, time: Date.now() }])
  }

  const handleToolCall = async (call, signal, patients) => {
    let args = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch { /* تجاهل */ }

    if (call.function.name === 'propose_new_patient') {
      setMessages(prev => [...prev, {
        role: 'confirm', time: Date.now(),
        pending: { type: 'new_patient', status: 'pending', data: { name: args.name || '', age: args.age || '', gender: args.gender || '', phone: args.phone || '', doctor: args.doctor || '', testNames: args.tests || [] } }
      }])
      return 'تم عرض بيانات المريض الجديد على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا.'
    }

    if (call.function.name === 'propose_test_result') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      setMessages(prev => [...prev, {
        role: 'confirm', time: Date.now(),
        pending: { type: 'test_result', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name, testName: args.test_name || '', value: args.value || '' } }
      }])
      return 'تم عرض النتيجة على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا.'
    }

    if (call.function.name === 'propose_update_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      const updates = {}
      if (args.new_name) updates.name = args.new_name
      if (args.new_age) updates.age = parseInt(args.new_age)
      if (args.new_gender) updates.gender = args.new_gender
      if (args.new_doctor) updates.doctor = args.new_doctor
      if (args.new_phone) updates.phone = args.new_phone

      setMessages(prev => [...prev, {
        role: 'confirm', time: Date.now(),
        pending: { type: 'update_info', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name, updates } }
      }])
      return 'تم عرض التعديل المطلوب على المستخدم في الشات لتأكيد الحفظ. لم يتم التعديل فعليًا.'
    }

    if (call.function.name === 'propose_delete_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      setMessages(prev => [...prev, {
        role: 'confirm', time: Date.now(),
        pending: { type: 'delete', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name } }
      }])
      return 'تم عرض طلب الحذف على المستخدم في الشات لتأكيده. لم يتم الحذف فعليًا.'
    }

    if (call.function.name === 'add_tests_to_patient') {
      try {
        const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
        if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
        if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

        showStatus(`⏳ بيضيف تحاليل للمريض ${resolved.match.name}...`)
        const { data: catalog } = await supabase.from('test_catalog').select('*')
        const { matched, notFound } = matchTestsAgainstCatalog(args.tests, catalog)

        const testsToInsert = matched.map(t => ({ patient_id: resolved.match.id, name: t.name, normal_range: t.normal_range, unit: t.unit, status: 'تم التجميع' }))
        await supabase.from('tests').insert(testsToInsert)

        let msg = `تم إضافة ${matched.length} تحليل للمريض "${resolved.match.name}"`
        if (notFound.length) msg += `. تنبيه: التحاليل دي مش موجودة في قائمة التحاليل المعتمدة فتم تسجيلها من غير معدل طبيعي محدد: ${notFound.join(', ')}`
        return msg
      } catch (err) {
        return `فشل إضافة التحاليل: ${err.message}`
      }
    }

    if (call.function.name === 'find_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      const p = resolved.match
      const testsInfo = p.tests?.length
        ? p.tests.map(t => `${t.name} - النتيجة: ${t.value || 'لم تدخل بعد'} ${t.unit || ''} - المعدل الطبيعي: ${t.normal_range || 'غير محدد'} - الحالة: ${t.status}`).join('. ')
        : 'لا توجد تحاليل مسجلة'
      return `بيانات المريض "${p.name}": ${p.age} سنة، ${p.gender}، دكتور محوّل: ${p.doctor || 'غير محدد'}. التحاليل: ${testsInfo}`
    }

    if (call.function.name === 'open_patient_report') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return `مش لاقي مريض اسمه "${args.patient_name}"`
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      navigate('/reports', { state: { autoSelectPatientId: resolved.match.id } })
      return `تم فتح تقرير "${resolved.match.name}" جاهز للطباعة`
    }

    if (call.function.name === 'search_medical_info') {
      try {
        showStatus('🔎 بيبحث في الإنترنت...')
        const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          signal,
          body: JSON.stringify({
            model: 'groq/compound',
            messages: [{ role: 'user', content: `ابحث وجاوب بعربي بسيط بدون جداول أو Markdown: ${args.query || ''}` }]
          })
        }, 45000, 1)
        const data = await safeJson(res)
        return data.choices?.[0]?.message?.content || 'مش لقيت نتايج.'
      } catch (err) {
        if (err.name === 'AbortError') throw err
        if (err.name === 'TimeoutError') return 'البحث في الإنترنت أخذ وقت طويل، اعتمد على معلوماتك العامة بدلاً من ذلك.'
        return 'حصل خطأ في البحث.'
      }
    }

    return 'أداة غير معروفة.'
  }

  const confirmPending = async (index, pending) => {
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, pending: { ...m.pending, status: 'saving' } } : m))
    try {
      if (pending.type === 'new_patient') await executeNewPatient(pending.data)
      else if (pending.type === 'test_result') await executeTestResult(pending.data)
      else if (pending.type === 'update_info') await executeUpdatePatient(pending.data)
      else if (pending.type === 'delete') await executeDeletePatient(pending.data)
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, pending: { ...m.pending, status: 'done' } } : m))
    } catch (err) {
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, pending: { ...m.pending, status: 'error', error: err.message } } : m))
    }
  }

  const cancelPending = (index) => {
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, pending: { ...m.pending, status: 'cancelled' } } : m))
  }

  const executeNewPatient = async (data) => {
    const { data: patient, error } = await supabase.from('patients').insert([{
      name: data.name, age: parseInt(data.age), gender: data.gender, phone: data.phone || null, doctor: data.doctor || null,
    }]).select().single()
    if (error) throw error

    if (data.testNames?.length) {
      const { data: catalog } = await supabase.from('test_catalog').select('*')
      const { matched } = matchTestsAgainstCatalog(data.testNames, catalog)
      const testsToInsert = matched.map(t => ({ patient_id: patient.id, name: t.name, normal_range: t.normal_range, unit: t.unit, status: 'تم التجميع' }))
      const { error: testsError } = await supabase.from('tests').insert(testsToInsert)
      if (testsError) throw testsError
    }
  }

  const executeTestResult = async (data) => {
    const patients = await getPatients()
    const patient = patients.find(p => p.id === data.patientId)
    const test = patient?.tests?.find(t => t.name?.toLowerCase() === data.testName?.toLowerCase())
      || patient?.tests?.find(t => t.name?.toLowerCase().includes(data.testName?.toLowerCase()))
    if (!test) throw new Error(`مش لاقي تحليل اسمه "${data.testName}" لدى المريض`)

    // قيمة متدخلة = اعتماد تلقائي، وإلا تفضل المرحلة الحالية للتحليل زي ما هي
    const status = data.value?.trim() ? 'معتمد' : (test.status || 'تم التجميع')

    const { error } = await supabase.from('tests').update({ value: data.value, status }).eq('id', test.id)
    if (error) throw error
  }

  const executeUpdatePatient = async (data) => {
    const { error } = await supabase.from('patients').update(data.updates).eq('id', data.patientId)
    if (error) throw error
  }

  const executeDeletePatient = async (data) => {
    await supabase.from('tests').delete().eq('patient_id', data.patientId)
    const { error } = await supabase.from('patients').delete().eq('id', data.patientId)
    if (error) throw error
  }

  // ============ الصوت الداخل ============

  const toggleListening = () => { if (listening) stopListening(); else startListening() }

  const startListening = async () => {
    stopSpeaking()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      })
      streamRef.current = stream
      audioChunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (recordingTimeoutRef.current) { clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null }
        if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null }
        setRecordingSeconds(0)
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        await transcribeAudio(audioBlob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
      setRecordingSeconds(0)
      recordingIntervalRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)

      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          showStatus('⏱ تم إيقاف التسجيل تلقائيًا (الحد الأقصى دقيقتين)')
          stopListening()
        }
      }, MAX_RECORDING_MS)
    } catch {
      alert('محتاجين إذن الميكروفون')
    }
  }

  const stopListening = () => {
    mediaRecorderRef.current?.stop()
    setListening(false)
    if (recordingTimeoutRef.current) { clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null }
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null }
  }

  const LAB_VOCAB_HINT = 'Hemoglobin, Glucose, CBC, ESR, CRP, Vancomycin, Digoxin, Creatinine, Urea, ALT, AST, TSH, T3, T4, Sodium, Potassium, Calcium'

  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'whisper-large-v3')
      formData.append('language', 'ar')
      formData.append('prompt', LAB_VOCAB_HINT)

      const res = await fetchWithRetry('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      }, 25000, 1)

      if (!res.ok) { setLoading(false); showStatus('⚠️ حصل خطأ أثناء تحويل الصوت لنص، حاول تاني'); return }

      const data = await safeJson(res)
      const transcript = data.text?.trim()
      if (transcript) sendMessage(transcript)
      else { setLoading(false); showStatus('⚠️ مش قدرت أسمع كلام واضح، جرّب تاني') }
    } catch (err) {
      setLoading(false)
      if (err.name === 'TimeoutError') showStatus('⏱ تحويل الصوت أخذ وقت طويل، حاول تاني')
      else showStatus('⚠️ حصل خطأ أثناء تحويل الصوت لنص، حاول تاني')
    }
  }

  // ============ الصوت الخارج ============

  const splitForTTS = (text) => {
    const clean = text.replace(/[#*|]/g, '').replace(/\n+/g, ' ')
    const sentences = clean.split(/(?<=[.!؟?])\s+/).filter(s => s.trim())
    const chunks = []
    sentences.forEach(sentence => {
      let remaining = sentence.trim()
      while (remaining.length > 0) {
        const piece = remaining.slice(0, 200)
        remaining = remaining.slice(200)
        if (piece.trim()) chunks.push({ text: piece.trim(), isArabic: (piece.match(/[\u0600-\u06FF]/g) || []).length > piece.length * 0.3 })
      }
    })
    return chunks
  }

  const speakText = async (text) => {
    stopSpeaking()
    const chunks = splitForTTS(text)
    if (chunks.length === 0) return
    setIsSpeaking(true)

    for (const chunk of chunks) {
      try {
        const res = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: chunk.isArabic ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english',
            voice: chunk.isArabic ? 'lulwa' : 'hannah',
            input: chunk.text,
            response_format: 'wav'
          })
        }, 15000)

        if (!res.ok) continue

        const audioBlob = await res.blob()
        const url = URL.createObjectURL(audioBlob)

        await new Promise(resolve => {
          const audio = new Audio(url)
          currentAudioRef.current = audio
          audio.onended = () => { URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve() }
          audio.play()
        })
      } catch { /* لو قطعة فشلت، نكمل اللي بعدها */ }
    }

    setIsSpeaking(false)
  }

  return (
    <div className="flex flex-col p-6 pb-0 relative" style={{ height: 'calc(100vh - 65px)' }} dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المساعد الذكي</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تحدث أو اكتب لمساعدك الذكي "لابو"</p>
      </div>

      {isSpeaking && (
        <div className="flex justify-center mb-2">
          <button onClick={stopSpeaking} aria-label="إسكات لابو"
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-medium"
            style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
            🔊 لابو بيتكلم... (دوس للإسكات)
          </button>
        </div>
      )}

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 justify-center mt-6">
            {SUGGESTIONS.map((s, idx) => (
              <button key={idx} onClick={() => sendMessage(s)}
                className="text-xs px-3 py-2 rounded-full transition-all"
                style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'status') {
            return (
              <div key={i} className="flex justify-center">
                <div className="px-3 py-1 rounded-full text-xs" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>{msg.content}</div>
              </div>
            )
          }
          if (msg.role === 'confirm') {
            return (
              <div key={i} className="flex justify-end">
                <ConfirmCard pending={msg.pending} onConfirm={() => confirmPending(i, msg.pending)} onCancel={() => cancelPending(i)} />
              </div>
            )
          }
          return (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-start' : 'items-end'}`}>
              <div className="max-w-lg px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: msg.role === 'user' ? 'var(--primary-container)' : 'white',
                  color: msg.role === 'user' ? 'white' : 'var(--on-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--outline-variant)' : 'none',
                  lineHeight: '1.8'
                }}>
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content}
              </div>

              <div className="flex items-center gap-2 mt-1 px-1">
                {msg.time && <span className="text-xs" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>{formatClock(msg.time)}</span>}
                {msg.role === 'assistant' && (
                  <button onClick={() => copyMessage(i, msg.content)} aria-label="نسخ الرد"
                    className="text-xs" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>
                    {copiedIndex === i ? '✅ تم النسخ' : '📋 نسخ'}
                  </button>
                )}
                {msg.retryText && (
                  <button onClick={() => sendMessage(msg.retryText)} aria-label="إعادة المحاولة"
                    className="text-xs font-medium" style={{ color: 'var(--primary-container)' }}>
                    🔄 حاول تاني
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex justify-end">
            <div className="px-4 py-3 rounded-2xl text-sm bg-white flex items-center gap-3" style={{ border: '1px solid var(--outline-variant)' }}>
              <span className="animate-pulse">لابو شغال...</span>
              <button onClick={stopGeneration} aria-label="إيقاف الطلب" className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: '#fee2e2', color: '#dc2626' }}>
                ⏹ إيقاف
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollBtn && (
        <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="النزول لآخر رسالة"
          className="absolute left-1/2 -translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center shadow-md text-sm"
          style={{ bottom: '90px', background: 'white', border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
          ⬇
        </button>
      )}

      <div className="py-4 flex gap-3 items-end" style={{ borderTop: '1px solid var(--outline-variant)' }}>
        <button onClick={toggleListening} aria-label={listening ? 'إيقاف التسجيل' : 'بدء التسجيل الصوتي'}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 relative"
          style={{ background: listening ? '#fee2e2' : '#f1f3f4', border: listening ? '2px solid #ef4444' : '1px solid var(--outline-variant)' }}>
          {listening ? '🔴' : '🎤'}
        </button>

        {listening && (
          <span className="text-xs font-medium self-center" style={{ color: '#dc2626' }}>{formatTimer(recordingSeconds)}</span>
        )}

        <textarea ref={textareaRef} value={input} rows={1}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder="اكتب سؤالك أو أمرك هنا... (Shift+Enter لسطر جديد)"
          className="flex-1 px-4 py-3 rounded-xl outline-none text-right resize-none"
          style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', maxHeight: '120px', lineHeight: '1.5' }}
          onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
          onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
        />

        <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} aria-label="إرسال"
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--primary-container)', opacity: (loading || !input.trim()) ? 0.5 : 1 }}>
          ➤
        </button>
      </div>
    </div>
  )
}

function ConfirmCard({ pending, onConfirm, onCancel }) {
  const { type, status, data, error } = pending

  return (
    <div className="max-w-lg w-full px-4 py-3 rounded-2xl text-sm bg-white"
      style={{ border: type === 'delete' ? '1.5px solid #dc2626' : '1.5px solid var(--primary-container)', lineHeight: '1.7' }}>

      {type === 'new_patient' && (
        <>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>📋 تسجيل مريض جديد - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>الاسم:</strong> {data.name || '-'}</p>
            <p><strong>السن:</strong> {data.age || '-'} • <strong>النوع:</strong> {data.gender || '-'}</p>
            {data.phone && <p><strong>التليفون:</strong> {data.phone}</p>}
            {data.doctor && <p><strong>الدكتور:</strong> {data.doctor}</p>}
            <p><strong>التحاليل:</strong> {data.testNames?.length ? data.testNames.join(', ') : 'لا يوجد'}</p>
          </div>
        </>
      )}

      {type === 'test_result' && (
        <>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>🧪 تسجيل نتيجة تحليل - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>المريض:</strong> {data.patientName || '-'}</p>
            <p><strong>التحليل:</strong> {data.testName || '-'}</p>
            <p><strong>النتيجة:</strong> {data.value || '-'}</p>
          </div>
        </>
      )}

      {type === 'update_info' && (
        <>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>✏️ تعديل بيانات مريض - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>المريض:</strong> {data.patientName}</p>
            {Object.entries(data.updates || {}).map(([key, value]) => (
              <p key={key}><strong>{key}:</strong> {String(value)}</p>
            ))}
          </div>
        </>
      )}

      {type === 'delete' && (
        <>
          <p className="font-semibold mb-2" style={{ color: '#dc2626' }}>⚠️ حذف مريض نهائيًا - يحتاج تأكيدك</p>
          <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            هيتم حذف المريض <strong>{data.patientName}</strong> وكل تحاليله نهائيًا. مش هترجع.
          </p>
        </>
      )}

      {status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-1.5 rounded-lg text-xs font-medium" style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إلغاء
          </button>
          <button onClick={onConfirm} className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: type === 'delete' ? '#dc2626' : 'var(--primary-container)' }}>
            {type === 'delete' ? '🗑️ تأكيد الحذف' : '✅ تأكيد الحفظ'}
          </button>
        </div>
      )}

      {status === 'saving' && <p className="mt-3 text-xs animate-pulse" style={{ color: 'var(--on-surface-variant)' }}>جاري التنفيذ...</p>}
      {status === 'done' && <p className="mt-3 text-xs font-medium" style={{ color: '#065f46' }}>✅ تم التنفيذ بنجاح</p>}
      {status === 'cancelled' && <p className="mt-3 text-xs font-medium" style={{ color: 'var(--on-surface-variant)' }}>تم الإلغاء</p>}
      {status === 'error' && <p className="mt-3 text-xs font-medium" style={{ color: '#dc2626' }}>❌ {error || 'حصل خطأ'}</p>}
    </div>
  )
}
