import { useState, useRef, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const apiKey = import.meta.env.VITE_GROQ_API_KEY

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
]

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
      description: 'يجاوب على أي سؤال طبي أو عام.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  }
]

const fetchWithRetry = async (body) => {
  // جرب كل الموديلات مع tools
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
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
      await new Promise(r => setTimeout(r, 800))
    }
  }

  // last resort: جرب من غير tools
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

export default function AIAssistant() {
  const navigate = useNavigate()
  const { chatMessages: messages, setChatMessages: setMessages, chatHistoryRef: historyRef } = useOutletContext()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const messagesEndRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  const getPatients = async () => {
    try {
      const { data } = await supabase.from('patients').select('*, tests(*)')
      return data || []
    } catch { return [] }
  }

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

  const sendMessage = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setLoading(true)
    historyRef.current.push({ role: 'user', content: trimmed })
    try { await runAssistantTurn() } catch { }
    finally { setLoading(false) }
  }

  const runAssistantTurn = async (depth = 0) => {
    if (depth > 8) return

    const patients = await getPatients()
    const patientsInfo = patients.length
      ? patients.map(p =>
        `- ${p.name} (${p.age}سنة، ${p.gender}) | دكتور: ${p.doctor || '-'} | تحاليل: ${p.tests?.map(t =>
          `${t.name}: ${t.value || 'لم تدخل'} ${t.unit || ''} [${t.normal_range || ''}] - ${t.status}`
        ).join(', ') || 'لا يوجد'}`
      ).join('\n')
      : 'مفيش مرضى دلوقتي'

    const systemPrompt = `أنت "لابو"، مساعد ذكي في معمل طبي، شخصيتك:
- بتتكلم بالعربية العامية المصرية البسيطة وبروح وحماس
- عندك معرفة موسوعية في كل المجالات (طب، علوم، تاريخ، رياضة، فن، وأي حاجة تانية)
- بتنفذ الطلبات فوراً لو واضحة
- بتقول "تمام ✅" بعد أي تنفيذ
- لو سألوا مين عملك: "عمي وعمك المهندس أبو المجد 😄"

قواعد التنفيذ:
- save_new_patient: لخّص البيانات واسأل تأكيد الأول، لو وافق نفّذ فوراً
- save_test_result: نفّذ فوراً بدون سؤال
- open_patient_report: افتح فوراً
- answer_question: استخدمها للأسئلة العامة والطبية وأي معلومة

قواعد الردود:
- لا ### ولا ** ولا جداول
- مختصر عند التنفيذ، مفصّل وبحماس عند الأسئلة
- النصائح الغذائية: أمثلة بالعامية (مش "بروتين"، قول "فراخ وبيض وفول")

بيانات المرضى:
${patientsInfo}`

    const data = await fetchWithRetry({
      messages: [
        { role: 'user', content: systemPrompt + '\n\nابدأ.' },
        { role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي عاوز تعمله!' },
        ...historyRef.current
      ],
      tools: TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_tokens: 2048
    })

    // لو فشل كل حاجة، مش بنظهر أي error للمستخدم
    if (!data) {
      console.error('all models failed silently')
      return
    }

    const choice = data.choices[0].message

    if (choice.tool_calls?.length) {
      historyRef.current.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })
      for (const call of choice.tool_calls) {
        const result = await handleToolCall(call, patients)
        historyRef.current.push({ role: 'tool', tool_call_id: call.id, content: String(result) })
      }
      await runAssistantTurn(depth + 1)
      return
    }

    const reply = choice.content || 'تمام!'
    historyRef.current.push({ role: 'assistant', content: reply })
    setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    speakText(reply)
  }

  const handleToolCall = async (call, patients) => {
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
          const { data: catalog } = await supabase.from('test_catalog').select('*')
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
        const allPatients = patients.length ? patients : await getPatients()
        const patient = findPatient(allPatients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        const test = findTest(patient.tests, args.test_name)
        if (!test) return `مش لاقي تحليل "${args.test_name}"`

        const { error } = await supabase.from('tests').update({
          value: args.value, status: 'مكتمل'
        }).eq('id', test.id)

        if (error) return `مش قدر يحفظ، جرب تاني`
        return `تم حفظ "${args.test_name}" = ${args.value} ✅`
      }

      if (call.function.name === 'update_patient_info') {
        showStatus(`⏳ بيعدل بيانات ${args.patient_name}...`)
        const allPatients = patients.length ? patients : await getPatients()
        const patient = findPatient(allPatients, args.patient_name)
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
        const allPatients = patients.length ? patients : await getPatients()
        const patient = findPatient(allPatients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        await supabase.from('tests').delete().eq('patient_id', patient.id)
        const { error } = await supabase.from('patients').delete().eq('id', patient.id)
        if (error) return `مش قدر يمسح، جرب تاني`
        return `تم مسح "${args.patient_name}" وكل تحاليله ✅`
      }

      if (call.function.name === 'add_tests_to_patient') {
        showStatus(`⏳ بيضيف تحاليل...`)
        const allPatients = patients.length ? patients : await getPatients()
        const patient = findPatient(allPatients, args.patient_name)
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        const { data: catalog } = await supabase.from('test_catalog').select('*')
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
        const allPatients = patients.length ? patients : await getPatients()
        const match = findPatient(allPatients, args.patient_name)
        if (match) {
          navigate('/reports', { state: { autoSelectPatientId: match.id } })
          return `تم فتح تقرير "${match.name}" ✅`
        }
        return `مش لاقي مريض اسمه "${args.patient_name}"`
      }

      if (call.function.name === 'answer_question') {
        const data = await fetchWithRetry({
          messages: [{
            role: 'user',
            content: `أجب بالعربية العامية المصرية بدون جداول أو رموز markdown: ${args.query}`
          }],
          max_tokens: 1024
        })
        return data?.choices?.[0]?.message?.content || 'مش عارف أجاوب دلوقتي'
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

  const speakText = async (text) => {
    const chunks = splitForTTS(text)
    for (const chunk of chunks) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: chunk.isArabic ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english',
            voice: chunk.isArabic ? 'lulwa' : 'hannah',
            input: chunk.text,
            response_format: 'wav'
          })
        })
        if (!res.ok) continue
        const url = URL.createObjectURL(await res.blob())
        await new Promise(resolve => {
          const audio = new Audio(url)
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
          audio.play().catch(() => resolve())
        })
      } catch { }
    }
  }

  return (
    <div className="flex flex-col p-6 pb-0" style={{ height: 'calc(100vh - 65px)' }} dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المساعد الذكي</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تحدث أو اكتب لمساعدك الذكي "لابو"</p>
      </div>

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

        {loading && (
          <div className="flex justify-end">
            <div className="px-4 py-3 rounded-2xl text-sm bg-white" style={{ border: '1px solid var(--outline-variant)' }}>
              <span className="animate-pulse">لابو شغال...</span>
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