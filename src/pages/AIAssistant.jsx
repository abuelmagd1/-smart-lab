import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const apiKey = import.meta.env.VITE_GROQ_API_KEY

// تعريف الأدوات اللي المساعد يقدر يطلبها (مش يحفظها مباشرة، بس يطلب من الواجهة تعرضها للتأكيد)
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_new_patient',
      description: 'يُستخدم لتسجيل مريض جديد. لا يحفظ البيانات مباشرة في القاعدة، بل يعرضها على المستخدم في الشات لتأكيد الحفظ أولاً.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'اسم المريض كامل' },
          age: { type: 'number', description: 'سن المريض' },
          gender: { type: 'string', enum: ['ذكر', 'أنثى'] },
          phone: { type: 'string', description: 'رقم تليفون المريض (اختياري)' },
          doctor: { type: 'string', description: 'اسم الطبيب المحوّل (اختياري)' },
          tests: { type: 'array', items: { type: 'string' }, description: 'أسماء التحاليل المطلوبة للمريض' }
        },
        required: ['name', 'age', 'gender', 'tests']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_test_result',
      description: 'يُستخدم لإدخال أو تعديل نتيجة تحليل لمريض موجود بالفعل في النظام. لا يحفظ النتيجة مباشرة، بل يعرضها على المستخدم في الشات لتأكيد الحفظ أولاً.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض كما هو مسجل بالنظام' },
          test_name: { type: 'string', description: 'اسم التحليل المطلوب تسجيل نتيجته' },
          value: { type: 'string', description: 'قيمة النتيجة' }
        },
        required: ['patient_name', 'test_name', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_patient_report',
      description: 'يفتح صفحة التقارير ويحدد مريضًا معينًا تلقائيًا تمهيدًا لطباعته فعليًا. يُستخدم فورًا (بدون انتظار تأكيد) عندما يطلب المستخدم طباعة أو فتح تقرير مريض.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string', description: 'اسم المريض المطلوب فتح تقريره' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_medical_info',
      description: 'يبحث في الإنترنت عن معلومات طبية/علمية دقيقة وحديثة: أسباب الأمراض، الأدوية الشائعة لحالة معينة، الإرشادات الغذائية، أو أي معلومة تحتاج مصدر خارجي للتأكد منها. استخدمها بسؤال عام عن المرض أو الحالة فقط، بدون ذكر اسم المريض أو بياناته الشخصية.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'سؤال بحث محدد وواضح (عربي أو إنجليزي)، عن الحالة الطبية بشكل عام بدون أي بيانات شخصية للمريض' }
        },
        required: ['query']
      }
    }
  }
]

export default function AIAssistant() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'مرحباً! أنا لابو، مساعدك الذكي في المعمل. كيف أقدر أساعدك؟' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef(null)
  const historyRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // تنظيف الميكروفون لو المستخدم خرج من الصفحة وهو لسه بيسجل
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  const getPatients = async () => {
    const { data } = await supabase.from('patients').select('*, tests(*)')
    return data || []
  }

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)

    historyRef.current.push({ role: 'user', content: trimmed })

    try {
      await runAssistantTurn()
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'حدث خطأ في الاتصال.' }])
    } finally {
      setLoading(false)
    }
  }

  // دورة واحدة من المحادثة مع الموديل، ممكن تتكرر تلقائيًا لو الموديل طلب أداة (tool call)
  const runAssistantTurn = async (depth = 0) => {
    if (depth > 4) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'حصل تكرار غير متوقع في تنفيذ الطلب، حاول تصيغه بشكل مختلف.' }])
      return
    }

    const patients = await getPatients()
    const patientsInfo = patients.map(p =>
      `- ${p.name} (${p.age} سنة، ${p.gender}) | دكتور: ${p.doctor} | تحاليل: ${p.tests?.map(t =>
        `${t.name} - النتيجة: ${t.value || 'لم تدخل بعد'} ${t.unit || ''} - المعدل الطبيعي: ${t.normal_range || 'غير محدد'} - الحالة: ${t.status}`
      ).join(', ')}`
    ).join('\n')

    const systemPrompt = `أنت مساعد ذكي متخصص في إدارة المعامل الطبية. اسمك "لابو".
تساعد الكيميائيين في تفسير نتائج التحاليل، اقتراح تحاليل إضافية، وكتابة التقارير.

قواعد اللغة (مهمة جدًا، التزم بيها في كل رد بدون أي استثناء):
- ردودك تكون باللغة العربية فقط، ويُسمح فقط بالمصطلحات العلمية/الطبية بالإنجليزية ضمن الجملة العربية (مثل أسماء التحاليل، الهرمونات، الإنزيمات، الأدوية) لأن هذه هي الصيغة المتداولة فعليًا بين الأطباء والكيميائيين.
- ممنوع الرد بأي لغة ثالثة غير العربية أو الإنجليزية تحت أي ظرف، حتى لو طلب المستخدم ذلك صراحة أو كتب رسالته بلغة أخرى.
- لو كتب المستخدم بلغة غير العربية أو الإنجليزية، رد بالعربية واطلب منه إعادة كتابة سؤاله بالعربية أو الإنجليزية.

قواعد استخدام الأدوات (مهمة جدًا):
- لو طلب المستخدم تسجيل مريض جديد، استخدم أداة propose_new_patient بدل ما تكتب البيانات في الرد النصي.
- لو طلب المستخدم إدخال أو تعديل نتيجة تحليل لمريض موجود، استخدم أداة propose_test_result.
- لو طلب المستخدم طباعة أو فتح تقرير مريض، استخدم أداة open_patient_report فورًا بدون انتظار تأكيد.
- لو احتجت معلومة دقيقة أو حديثة عن مرض أو حالة طبية (أسباب، أدوية، تغذية)، استخدم أداة search_medical_info بسؤال عام عن الحالة بدون ذكر اسم المريض أو بياناته الشخصية، ثم اربط النتيجة بحالة المريض في ردك.
- propose_new_patient و propose_test_result لا يحفظان البيانات فعليًا، بل يعرضانها على المستخدم ليؤكدها بنفسه. لا تقل للمستخدم أبدًا أن البيانات "تم حفظها" بعد استخدام هاتين الأداتين، فقط أخبره أن البيانات معروضة وتنتظر تأكيده.

قواعد الشرح التفصيلي (مهمة جدًا):
- لو سُئلت عن نتيجة تحليل غير طبيعية (مرتفعة أو منخفضة) أو عن حالة مرضية معينة، اشرح بالتفصيل وبالترتيب:
  1) الأسباب المحتملة لهذه النتيجة أو الحالة.
  2) الأدوية الشائعة التي تُستخدم عادة لهذه الحالة (كمعلومة استرشادية عامة).
  3) الأطعمة التي يُنصح بزيادتها أو تجنبها.
  4) أي تعليمات أو نصائح إضافية ذات صلة.
- في نهاية أي رد فيه اقتراح أدوية أو خطة علاجية، أضف دائمًا جملة توضح أن هذه معلومات استرشادية عامة وليست بديلاً عن قرار الطبيب المعالج، والقرار النهائي للعلاج يرجع للطبيب المختص بعد فحص الحالة كاملة.

بيانات المرضى الحالية في المعمل:
${patientsInfo || 'لا يوجد مرضى حالياً'}

إذا سُئلت عن مريض معين، ابحث في البيانات وأجب بدقة.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'user', content: systemPrompt + '\n\nابدأ.' },
          { role: 'assistant', content: 'مرحباً! أنا لابو، جاهز لمساعدتك.' },
          ...historyRef.current
        ],
        tools: TOOLS,
        tool_choice: 'auto'
      })
    })

    const data = await response.json()
    const choice = data.choices?.[0]?.message

    if (choice?.tool_calls?.length) {
      historyRef.current.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })

      for (const call of choice.tool_calls) {
        const result = await handleToolCall(call)
        historyRef.current.push({ role: 'tool', tool_call_id: call.id, content: result })
      }

      await runAssistantTurn(depth + 1)
      return
    }

    const reply = choice?.content || 'حدث خطأ، حاول مرة أخرى.'
    historyRef.current.push({ role: 'assistant', content: reply })
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    speakText(reply)
  }

  // تنفيذ الأداة اللي طلبها الموديل: إما عرض كارت تأكيد، أو فتح صفحة التقارير فورًا، أو البحث الخارجي
  const handleToolCall = async (call) => {
    let args = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch { /* تجاهل */ }

    if (call.function.name === 'propose_new_patient') {
      setMessages(prev => [...prev, {
        role: 'confirm',
        pending: {
          type: 'new_patient',
          status: 'pending',
          data: {
            name: args.name || '',
            age: args.age || '',
            gender: args.gender || '',
            phone: args.phone || '',
            doctor: args.doctor || '',
            testNames: args.tests || [],
          }
        }
      }])
      return 'تم عرض بيانات المريض الجديد على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا بعد، أخبر المستخدم أن البيانات معروضة وتنتظر تأكيده فقط.'
    }

    if (call.function.name === 'propose_test_result') {
      setMessages(prev => [...prev, {
        role: 'confirm',
        pending: {
          type: 'test_result',
          status: 'pending',
          data: {
            patientName: args.patient_name || '',
            testName: args.test_name || '',
            value: args.value || '',
          }
        }
      }])
      return 'تم عرض النتيجة على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا بعد، أخبر المستخدم أن البيانات معروضة وتنتظر تأكيده فقط.'
    }

    if (call.function.name === 'open_patient_report') {
      const patients = await getPatients()
      const target = (args.patient_name || '').trim()
      const match = patients.find(p => p.name?.trim() === target) || patients.find(p => p.name?.includes(target))

      if (match) {
        navigate('/reports', { state: { autoSelectPatientId: match.id } })
        return `تم فتح صفحة التقارير وتحديد المريض "${match.name}" تلقائيًا، جاهز للطباعة الفعلية.`
      }
      return `لم يتم العثور على مريض بالاسم "${target}" في النظام.`
    }

    if (call.function.name === 'search_medical_info') {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'groq/compound',
            messages: [
              { role: 'user', content: `ابحث في الإنترنت وجاوب بدقة ومصطلحات علمية بالعربي أو الإنجليزي بس: ${args.query || ''}` }
            ]
          })
        })
        const data = await res.json()
        return data.choices?.[0]?.message?.content || 'لم يتم العثور على نتائج مفيدة في البحث.'
      } catch (err) {
        return 'حصل خطأ أثناء البحث في الإنترنت، اعتمد على معلوماتك العامة بدلاً من ذلك.'
      }
    }

    return 'أداة غير معروفة.'
  }

  // ===== تنفيذ الحفظ الفعلي بعد ما المستخدم يدوس "تأكيد الحفظ" على الكارت =====

  const confirmPending = async (index, pending) => {
    setMessages(prev => prev.map((m, i) => i === index ? { ...m, pending: { ...m.pending, status: 'saving' } } : m))
    try {
      if (pending.type === 'new_patient') {
        await executeNewPatient(pending.data)
      } else if (pending.type === 'test_result') {
        await executeTestResult(pending.data)
      }
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
      name: data.name,
      age: parseInt(data.age),
      gender: data.gender,
      phone: data.phone || null,
      doctor: data.doctor || null,
    }]).select().single()

    if (error) throw error

    if (data.testNames?.length) {
      const { data: catalog } = await supabase.from('test_catalog').select('*')
      const matchedTests = data.testNames.map(name => {
        const found = catalog?.find(c => c.name.toLowerCase() === name.toLowerCase())
          || catalog?.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
        return {
          patient_id: patient.id,
          name: found?.name || name,
          normal_range: found?.normal_range || null,
          unit: found?.unit || null,
          status: 'معلق',
        }
      })
      const { error: testsError } = await supabase.from('tests').insert(matchedTests)
      if (testsError) throw testsError
    }
  }

  const executeTestResult = async (data) => {
    const { data: patients } = await supabase.from('patients').select('*, tests(*)')
    const patient = patients?.find(p => p.name?.trim() === data.patientName?.trim())
      || patients?.find(p => p.name?.includes(data.patientName))
    if (!patient) throw new Error(`لم يتم العثور على مريض اسمه "${data.patientName}"`)

    const test = patient.tests?.find(t => t.name?.toLowerCase() === data.testName?.toLowerCase())
      || patient.tests?.find(t => t.name?.toLowerCase().includes(data.testName?.toLowerCase()))
    if (!test) throw new Error(`لم يتم العثور على تحليل اسمه "${data.testName}" لدى المريض "${data.patientName}"`)

    const status = data.value?.trim() ? 'مكتمل' : 'معلق'
    const { error } = await supabase.from('tests').update({ value: data.value, status }).eq('id', test.id)
    if (error) throw error
  }

  // ============ الصوت الداخل: تسجيل المايك ثم تحويله لنص عبر Whisper على Groq ============

  const toggleListening = () => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        }
      })
      streamRef.current = stream
      audioChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        await transcribeAudio(audioBlob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch (err) {
      alert('محتاجين إذن الوصول للميكروفون عشان تقدر تسجل صوت')
    }
  }

  const stopListening = () => {
    mediaRecorderRef.current?.stop()
    setListening(false)
  }

  // قاموس مصطلحات علمية بنبعته مع كل تسجيل عشان يحسّن تعرف Whisper على أسماء التحاليل
  const LAB_VOCAB_HINT = 'Hemoglobin, Glucose, CBC, ESR, CRP, Vancomycin, Digoxin, Hemopexin, Creatinine, Urea, ALT, AST, TSH, T3, T4, Sodium, Potassium, Calcium'

  // الصوت بيتبعت مباشرة لـ Groq وبيتحذف من الذاكرة فورًا بعد الرد، من غير ما يتخزن في Supabase خالص
  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'whisper-large-v3')
      formData.append('language', 'ar')
      formData.append('prompt', LAB_VOCAB_HINT)

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      })
      const data = await res.json()
      const transcript = data.text?.trim()

      if (transcript) {
        sendMessage(transcript)
      } else {
        setLoading(false)
      }
    } catch (err) {
      setLoading(false)
      alert('حصل خطأ أثناء تحويل الصوت لنص، حاول تاني')
    }
  }

  // ============ الصوت الخارج: تحويل رد لابو لكلام عبر Orpheus على Groq ============

  // بيقسم الرد لقطع ≤200 حرف (حد Orpheus)، وبيحدد كل قطعة عربي ولا إنجليزي
  const splitForTTS = (text) => {
    const sentences = text.split(/(?<=[.!؟?\n])\s+/).filter(s => s.trim())
    const chunks = []

    sentences.forEach(sentence => {
      let remaining = sentence.trim()
      while (remaining.length > 0) {
        const piece = remaining.slice(0, 200)
        remaining = remaining.slice(200)
        if (piece.trim()) chunks.push(piece.trim())
      }
    })

    return chunks.map(chunk => ({
      text: chunk,
      isArabic: (chunk.match(/[\u0600-\u06FF]/g) || []).length > chunk.length * 0.3
    }))
  }

  // الصوت الناتج بيُشغَّل مباشرة من الذاكرة وبيتمسح فورًا بعد التشغيل، من غير تخزين في Supabase
  const speakText = async (text) => {
    const chunks = splitForTTS(text)

    for (const chunk of chunks) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: chunk.isArabic ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english',
            voice: chunk.isArabic ? 'lulwa' : 'hannah',
            input: chunk.text,
            response_format: 'wav'
          })
        })

        if (!res.ok) continue

        const audioBlob = await res.blob()
        const url = URL.createObjectURL(audioBlob)

        await new Promise(resolve => {
          const audio = new Audio(url)
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
          audio.play()
        })
      } catch (err) {
        // لو قطعة فشلت، نكمل اللي بعدها بدل ما نوقف الكلام كله
      }
    }
  }

  return (
    <div className="flex flex-col p-6 pb-0" style={{ height: 'calc(100vh - 65px)' }} dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>
          المساعد الذكي
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
          تحدث أو اكتب لمساعدك الذكي "لابو"
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => {
          if (msg.role === 'confirm') {
            return (
              <div key={i} className="flex justify-end">
                <ConfirmCard pending={msg.pending} onConfirm={() => confirmPending(i, msg.pending)} onCancel={() => cancelPending(i)} />
              </div>
            )
          }
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className="max-w-lg px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: msg.role === 'user' ? 'var(--primary-container)' : 'white',
                  color: msg.role === 'user' ? 'white' : 'var(--on-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--outline-variant)' : 'none',
                  lineHeight: '1.7'
                }}>
                {msg.content}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex justify-end">
            <div className="px-4 py-3 rounded-2xl text-sm bg-white" style={{ border: '1px solid var(--outline-variant)' }}>
              <span className="animate-pulse">لابو يفكر...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="py-4 flex gap-3" style={{ borderTop: '1px solid var(--outline-variant)' }}>
        <button onClick={toggleListening}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
          style={{
            background: listening ? '#fee2e2' : '#f1f3f4',
            border: listening ? '2px solid #ef4444' : '1px solid var(--outline-variant)'
          }}>
          {listening ? '🔴' : '🎤'}
        </button>

        <input type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="اكتب سؤالك أو أمرك هنا..."
          className="flex-1 px-4 py-3 rounded-xl outline-none text-right"
          style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
          onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
          onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
        />

        <button onClick={() => sendMessage(input)}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
          style={{ background: 'var(--primary-container)' }}>
          ➤
        </button>
      </div>
    </div>
  )
}

// كارت تأكيد الحفظ اللي بيظهر في الشات لما المساعد يطلب تسجيل مريض أو نتيجة
function ConfirmCard({ pending, onConfirm, onCancel }) {
  const { type, status, data, error } = pending

  return (
    <div className="max-w-lg w-full px-4 py-3 rounded-2xl text-sm bg-white" style={{ border: '1.5px solid var(--primary-container)', lineHeight: '1.7' }}>
      {type === 'new_patient' ? (
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
      ) : (
        <>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>🧪 تسجيل نتيجة تحليل - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>المريض:</strong> {data.patientName || '-'}</p>
            <p><strong>التحليل:</strong> {data.testName || '-'}</p>
            <p><strong>النتيجة:</strong> {data.value || '-'}</p>
          </div>
        </>
      )}

      {status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إلغاء
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'var(--primary-container)' }}>
            ✅ تأكيد الحفظ
          </button>
        </div>
      )}

      {status === 'saving' && (
        <p className="mt-3 text-xs animate-pulse" style={{ color: 'var(--on-surface-variant)' }}>جاري الحفظ...</p>
      )}
      {status === 'done' && (
        <p className="mt-3 text-xs font-medium" style={{ color: '#065f46' }}>✅ تم الحفظ بنجاح</p>
      )}
      {status === 'cancelled' && (
        <p className="mt-3 text-xs font-medium" style={{ color: 'var(--on-surface-variant)' }}>تم الإلغاء</p>
      )}
      {status === 'error' && (
        <p className="mt-3 text-xs font-medium" style={{ color: '#dc2626' }}>❌ {error || 'حصل خطأ أثناء الحفظ'}</p>
      )}
    </div>
  )
}

