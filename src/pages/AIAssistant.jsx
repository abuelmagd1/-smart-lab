import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'

const apiKey = import.meta.env.VITE_GROQ_API_KEY

export default function AIAssistant() {
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

بيانات المرضى الحالية في المعمل:
${patientsInfo || 'لا يوجد مرضى حالياً'}

إذا طُلب منك طباعة تقرير، اكتب التقرير كاملاً بشكل منظم.
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
          ]
        })
      })

      const data = await response.json()
      const reply = data.choices?.[0]?.message?.content || 'حدث خطأ، حاول مرة أخرى.'

      historyRef.current.push({ role: 'assistant', content: reply })
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])

      speakText(reply)

    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'حدث خطأ في الاتصال.' }])
    } finally {
      setLoading(false)
    }
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(track => track.stop())
        streamRef.current = null
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
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

  // الصوت بيتبعت مباشرة لـ Groq وبيتحذف من الذاكرة فورًا بعد الرد، من غير ما يتخزن في Supabase خالص
  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'whisper-large-v3')

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
        {messages.map((msg, i) => (
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
        ))}

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
