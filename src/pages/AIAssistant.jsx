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

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_new_patient',
      description: 'يحفظ مريض جديد مباشرة في النظام بدون انتظار تأكيد. استخدمه فوراً لما يطلب المستخدم تسجيل مريض.',
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
      name: 'save_test_result',
      description: 'يحفظ نتيجة تحليل مباشرة بدون انتظار تأكيد.',
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
      description: 'يمسح مريض وكل تحاليله من النظام.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_tests_to_patient',
      description: 'يضيف تحاليل جديدة لمريض موجود.',
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
      description: 'يفتح صفحة التقارير ويحدد مريض معين للطباعة.',
      parameters: {
        type: 'object',
        properties: {
          patient_name: { type: 'string' }
        },
        required: ['patient_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_medical_info',
      description: 'يبحث عن معلومات طبية دقيقة وحديثة.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      }
    }
  }
]

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
      console.error('sendMessage error:', err)
    } finally {
      setLoading(false)
    }
  }

  const runAssistantTurn = async (depth = 0) => {
    if (depth > 6) return

    const patients = await getPatients()
    const patientsInfo = patients.map(p =>
      `- ${p.name} (${p.age} سنة، ${p.gender}) | ID: ${p.id} | دكتور: ${p.doctor || '-'} | تحاليل: ${p.tests?.map(t =>
        `${t.name}[ID:${t.id}] - النتيجة: ${t.value || 'لم تدخل'} ${t.unit || ''} - المعدل: ${t.normal_range || 'غير محدد'} - الحالة: ${t.status}`
      ).join(', ')}`
    ).join('\n')

    const systemPrompt = `أنت "لابو"، مساعد ذكي autonomous بتشتغل في معمل طبي، وعندك معرفة موسوعية واسعة في كل المجالات.

شخصيتك:
- بتتكلم بالعربية العامية المصرية البسيطة
- عندك معلومات دقيقة وعميقة في كل حاجة، وبتجاوب بثقة وحماس
- بتنفذ الطلبات فوراً بدون انتظار تأكيد لو الطلب واضح
- لما بتنفذ حاجة بتقول "تمام، عملت كذا ✅" بشكل مختصر
- لو في غلطة وقولك المستخدم، بتسأل إيه الصح وبعدين بتصلح فوراً

قواعد التنفيذ:
- save_new_patient: لخّص البيانات واسأل "البيانات صحيحة؟" قبل التسجيل. لو وافق نفّذ فوراً، لو رفض اسأل إيه الغلط
- save_test_result: احفظ فوراً بدون سؤال
- open_patient_report: افتح فوراً
- لو الطلب غامض، خمّن واسأل تأكيد بدون ما تنفذ

لو سُئلت مين عملك: رد بـ "عمي وعمك المهندس أبو المجد 😄"

قواعد الردود:
- لا تستخدم ### أو ** أو جداول
- ردودك مختصرة ومباشرة عند التنفيذ
- عند الأسئلة المعرفية، رد بروح وحماس

النصائح الغذائية: دايما دي أمثلة محددة بالعامية (مش "بروتين" بس، قول "فراخ وبيض وفول")

بيانات المرضى الحالية:
${patientsInfo || 'مفيش مرضى دلوقتي'}`

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
          messages: [
            { role: 'user', content: systemPrompt + '\n\nابدأ.' },
            { role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي عاوز تعمله وأنا هعمله فوراً!' },
            ...historyRef.current
          ],
          tools: TOOLS,
          tool_choice: 'auto',
          parallel_tool_calls: true
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        console.error('API error:', errData)
        setMessages(prev => [...prev, { role: 'assistant', content: 'في مشكلة مؤقتة، حاول تاني بعد شوية 🙏' }])
        return
      }

      const data = await response.json()
      const choice = data.choices?.[0]?.message

      if (!choice) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'مش فاهم السؤال، ممكن تعيد؟' }])
        return
      }

      if (choice.tool_calls?.length) {
        historyRef.current.push({ role: 'assistant', content: choice.content || '', tool_calls: choice.tool_calls })
        for (const call of choice.tool_calls) {
          const result = await handleToolCall(call)
          historyRef.current.push({ role: 'tool', tool_call_id: call.id, content: result })
        }
        await runAssistantTurn(depth + 1)
        return
      }

      const reply = choice.content || 'تمام!'
      historyRef.current.push({ role: 'assistant', content: reply })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      speakText(reply)

    } catch (err) {
      console.error('runAssistantTurn error:', err)
      setMessages(prev => [...prev, { role: 'assistant', content: 'في مشكلة في الاتصال، جرب تاني 🙏' }])
    }
  }

  const handleToolCall = async (call) => {
    let args = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch { }

    const showStatus = (text) => {
      setMessages(prev => [...prev, { role: 'status', content: text }])
    }

    try {
      if (call.function.name === 'save_new_patient') {
        showStatus(`⏳ بيسجل المريض ${args.name}...`)
        const { data: patient, error } = await supabase.from('patients').insert([{
          name: args.name, age: parseInt(args.age) || 0, gender: args.gender,
          phone: args.phone || null, doctor: args.doctor || null,
        }]).select().single()
        if (error) return `فشل تسجيل المريض: ${error.message}`

        if (args.tests?.length) {
          const { data: catalog } = await supabase.from('test_catalog').select('*').catch(() => ({ data: [] }))
          const testsToInsert = args.tests.map(name => {
            const found = catalog?.find(c => c.name?.toLowerCase() === name.toLowerCase())
              || catalog?.find(c => c.name?.toLowerCase().includes(name.toLowerCase()))
            return { patient_id: patient.id, name: found?.name || name, normal_range: found?.normal_range || null, unit: found?.unit || null, status: 'معلق' }
          })
          await supabase.from('tests').insert(testsToInsert)
        }
        return `تم تسجيل "${args.name}" بنجاح مع ${args.tests?.length || 0} تحليل`
      }

      if (call.function.name === 'save_test_result') {
        showStatus(`⏳ بيحفظ نتيجة ${args.test_name}...`)
        const patients = await getPatients()
        const patient = patients.find(p => p.name?.trim() === args.patient_name?.trim())
          || patients.find(p => p.name?.includes(args.patient_name))
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        const test = patient.tests?.find(t => t.name?.toLowerCase() === args.test_name?.toLowerCase())
          || patient.tests?.find(t => t.name?.toLowerCase().includes(args.test_name?.toLowerCase()))
        if (!test) return `مش لاقي تحليل "${args.test_name}" للمريض "${args.patient_name}"`

        const { error } = await supabase.from('tests').update({
          value: args.value,
          status: args.value?.trim() ? 'مكتمل' : 'معلق'
        }).eq('id', test.id)
        if (error) return `فشل حفظ النتيجة: ${error.message}`
        return `تم حفظ نتيجة "${args.test_name}" = ${args.value}`
      }

      if (call.function.name === 'update_patient_info') {
        showStatus(`⏳ بيعدل بيانات ${args.patient_name}...`)
        const patients = await getPatients()
        const patient = patients.find(p => p.name?.trim() === args.patient_name?.trim())
          || patients.find(p => p.name?.includes(args.patient_name))
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        const updates = {}
        if (args.new_name) updates.name = args.new_name
        if (args.new_age) updates.age = parseInt(args.new_age)
        if (args.new_gender) updates.gender = args.new_gender
        if (args.new_doctor) updates.doctor = args.new_doctor
        if (args.new_phone) updates.phone = args.new_phone

        const { error } = await supabase.from('patients').update(updates).eq('id', patient.id)
        if (error) return `فشل التعديل: ${error.message}`
        return `تم تعديل بيانات "${args.patient_name}" بنجاح`
      }

      if (call.function.name === 'delete_patient') {
        showStatus(`⏳ بيمسح المريض ${args.patient_name}...`)
        const patients = await getPatients()
        const patient = patients.find(p => p.name?.trim() === args.patient_name?.trim())
          || patients.find(p => p.name?.includes(args.patient_name))
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        await supabase.from('tests').delete().eq('patient_id', patient.id)
        const { error } = await supabase.from('patients').delete().eq('id', patient.id)
        if (error) return `فشل المسح: ${error.message}`
        return `تم مسح "${args.patient_name}" وكل تحاليله`
      }

      if (call.function.name === 'add_tests_to_patient') {
        showStatus(`⏳ بيضيف تحاليل...`)
        const patients = await getPatients()
        const patient = patients.find(p => p.name?.trim() === args.patient_name?.trim())
          || patients.find(p => p.name?.includes(args.patient_name))
        if (!patient) return `مش لاقي مريض اسمه "${args.patient_name}"`

        const { data: catalog } = await supabase.from('test_catalog').select('*').catch(() => ({ data: [] }))
        const testsToInsert = (args.tests || []).map(name => {
          const found = catalog?.find(c => c.name?.toLowerCase() === name.toLowerCase())
            || catalog?.find(c => c.name?.toLowerCase().includes(name.toLowerCase()))
          return { patient_id: patient.id, name: found?.name || name, normal_range: found?.normal_range || null, unit: found?.unit || null, status: 'معلق' }
        })
        await supabase.from('tests').insert(testsToInsert)
        return `تم إضافة ${args.tests?.length || 0} تحليل للمريض "${args.patient_name}"`
      }

      if (call.function.name === 'open_patient_report') {
        const patients = await getPatients()
        const target = (args.patient_name || '').trim()
        const match = patients.find(p => p.name?.trim() === target) || patients.find(p => p.name?.includes(target))
        if (match) {
          navigate('/reports', { state: { autoSelectPatientId: match.id } })
          return `تم فتح تقرير "${match.name}"`
        }
        return `مش لاقي مريض اسمه "${target}"`
      }

      if (call.function.name === 'search_medical_info') {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
              messages: [{ role: 'user', content: `جاوب بعربي بسيط بدون جداول أو Markdown: ${args.query || ''}` }]
            })
          })
          if (!res.ok) return 'مش لقيت معلومات كافية دلوقتي'
          const data = await res.json()
          return data.choices?.[0]?.message?.content || 'مش لقيت نتايج'
        } catch {
          return 'مش لقيت معلومات كافية دلوقتي'
        }
      }

    } catch (err) {
      console.error('handleToolCall error:', err)
      return 'حصل حاجة غلط، جرب تاني'
    }

    return 'تمام!'
  }

  const toggleListening = () => { if (listening) stopListening(); else startListening() }

  const startListening = async () => {
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []
        await transcribeAudio(audioBlob)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch {
      alert('محتاجين إذن الميكروفون')
    }
  }

  const stopListening = () => { mediaRecorderRef.current?.stop(); setListening(false) }

  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'whisper-large-v3')
      formData.append('language', 'ar')
      formData.append('prompt', 'Hemoglobin, Glucose, CBC, ESR, CRP, Creatinine, Urea, ALT, AST, TSH')
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      })
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      const transcript = data.text?.trim()
      if (transcript) sendMessage(transcript)
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const splitForTTS = (text) => {
    const clean = text.replace(/[#*|]/g, '').replace(/\n+/g, ' ')
    const sentences = clean.split(/(?<=[.!؟?])\s+/).filter(s => s.trim())
    const chunks = []
    sentences.forEach(sentence => {
      let remaining = sentence.trim()
      while (remaining.length > 0) {
        const piece = remaining.slice(0, 200)
        remaining = remaining.slice(200)
        if (piece.trim()) chunks.push({
          text: piece.trim(),
          isArabic: (piece.match(/[\u0600-\u06FF]/g) || []).length > piece.length * 0.3
        })
      }
    })
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
        const audioBlob = await res.blob()
        const url = URL.createObjectURL(audioBlob)
        await new Promise(resolve => {
          const audio = new Audio(url)
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { URL.revokeObjectURL(url); resolve() }
          audio.play()
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
          if (msg.role === 'status') {
            return (
              <div key={i} className="flex justify-center">
                <div className="px-3 py-1 rounded-full text-xs" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                  {msg.content}
                </div>
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