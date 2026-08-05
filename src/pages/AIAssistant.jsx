import { useState, useRef, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'
import { formatAge } from '../utils/referenceRanges'
import { summarizeFinances, buildFinancialReportHTML, getSimpleRange } from '../utils/financeUtils'

// المفتاح اتشال من هنا خالص - بقى محفوظ سيرفر-سايد بس جوه Supabase Edge Function (gemini-proxy)
// عشان محدش يقدر يشوفه من المتصفح تاني

// سلسلة موديلات احتياطية - لو أي موديل مشغول (overloaded) بيجرب اللي بعده تلقائيًا وبالترتيب
const MODEL_CHAIN = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']
const INTERACTIONS_PATH = '/v1/interactions'

const TTS_MODEL = 'gemini-3.1-flash-tts-preview'
const GENERATE_CONTENT_PATH = '/v1beta/models/' + TTS_MODEL + ':generateContent'

// بيفصّل محتوى الـ <body> بس من أي صفحة HTML جاهزة، عشان نقدر نغلّفه بنفس قالب التصميم الموحّد
const extractBodyContent = (html) => {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  return match ? match[1] : html
}

// القالب البصري الموحّد (هيدر بتدرج لوني + بطاقة محتوى + فوتر) - مستخدم في كل أنواع تقارير الـ PDF
// عشان أي تقرير في السيستم (مالي أو عام) يطلع بنفس الهوية البصرية بالظبط
const buildBrandedPdfShell = (title, innerHtml) => {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + title + '</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<style>' +
    ':root{--navy:#1a2456;--navy-light:#2d3a7a;--teal:#0e7c86;--gold:#c9a227;--bg:#f4f6fb;--ink:#1f2430;--muted:#6b7280;--line:#e6e9f2;}' +
    '*{margin:0;padding:0;box-sizing:border-box;}' +
    'html,body{background:var(--bg);}' +
    'body{font-family:"Segoe UI","Tahoma",Arial,sans-serif;color:var(--ink);padding:0 0 40px;}' +
    '.print-btn{position:fixed;top:18px;left:18px;z-index:50;background:linear-gradient(135deg,var(--navy),var(--navy-light));color:#fff;border:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 20px rgba(26,36,86,0.35);letter-spacing:.3px;transition:transform .15s ease;}' +
    '.print-btn:hover{transform:translateY(-2px);}' +
    '.page{max-width:900px;margin:0 auto;padding:0 28px;}' +
    '.header-band{background:linear-gradient(135deg,var(--navy) 0%,var(--navy-light) 55%,var(--teal) 100%);padding:46px 28px 34px;margin-bottom:0;position:relative;overflow:hidden;}' +
    '.header-band::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 85% 15%,rgba(201,162,39,0.25),transparent 55%);}' +
    '.header-inner{max-width:900px;margin:0 auto;position:relative;z-index:2;}' +
    '.brand-row{display:flex;align-items:center;gap:12px;margin-bottom:18px;}' +
    '.brand-dot{width:10px;height:10px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 4px rgba(201,162,39,0.25);}' +
    '.brand-name{color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;}' +
    '.doc-title{color:#fff;font-size:28px;font-weight:800;margin-bottom:10px;letter-spacing:.2px;}' +
    '.doc-meta{color:rgba(255,255,255,0.82);font-size:13px;display:flex;gap:18px;flex-wrap:wrap;}' +
    '.doc-meta span{display:flex;align-items:center;gap:6px;}' +
    '.content-card{background:#fff;margin:-26px auto 0;max-width:900px;border-radius:18px;box-shadow:0 18px 40px rgba(26,36,86,0.12);padding:34px 30px;position:relative;z-index:3;}' +
    '.doc-section{margin-bottom:28px;}' +
    '.doc-section:last-child{margin-bottom:0;}' +
    '.section-heading{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700;color:var(--navy);margin-bottom:14px;}' +
    '.heading-bar{width:5px;height:18px;border-radius:3px;background:linear-gradient(180deg,var(--gold),var(--teal));display:inline-block;}' +
    '.section-text{font-size:13.5px;line-height:2;color:#374151;background:#fafbfe;border:1px solid var(--line);border-radius:12px;padding:16px 18px;}' +
    '.table-wrap{border:1px solid var(--line);border-radius:14px;overflow:hidden;}' +
    'table{width:100%;border-collapse:collapse;font-size:13px;}' +
    'thead tr{background:linear-gradient(135deg,var(--navy),var(--navy-light));}' +
    'thead th{color:#fff;text-align:right;padding:12px 14px;font-weight:600;font-size:12.5px;letter-spacing:.3px;}' +
    'tbody td{padding:11px 14px;border-bottom:1px solid var(--line);color:#2b3140;}' +
    'tbody tr:last-child td{border-bottom:none;}' +
    '.row-even{background:#ffffff;}' +
    '.row-odd{background:#f7f9fd;}' +
    'tbody tr{transition:background .15s ease;}' +
    '.empty-cell{color:#b6bcc9;}' +
    '.footer-note{max-width:900px;margin:26px auto 0;text-align:center;font-size:11.5px;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:8px;}' +
    '.footer-line{flex:1;max-width:120px;height:1px;background:var(--line);}' +
    '.fade-in{opacity:0;animation:fadeInUp .5s ease forwards;}' +
    '@keyframes fadeInUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}' +
    '@media print{' +
    '.print-btn{display:none;}' +
    'body{background:#fff;}' +
    '.header-band{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    'thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    '.content-card{box-shadow:none;margin-top:-26px;}' +
    '.fade-in{opacity:1;animation:none;}' +
    '@page{margin:10mm;}' +
    '}' +
    '</style></head><body>' +
    '<button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>' +
    '<div class="header-band"><div class="header-inner">' +
    '<div class="brand-row"><span class="brand-dot"></span><span class="brand-name">Smart Lab System</span></div>' +
    '<h1 class="doc-title">' + title + '</h1>' +
    '<div class="doc-meta"><span>📅 ' + dateStr + '</span><span>🕐 ' + timeStr + '</span></div>' +
    '</div></div>' +
    '<div class="page"><div class="content-card">' + innerHtml + '</div>' +
    '<div class="footer-note"><span class="footer-line"></span><span>تم إنشاؤه بواسطة لابو 🤖 - Smart Lab System</span><span class="footer-line"></span></div>' +
    '</div>' +
    '</body></html>'
}

// بيحوّل صف نصي مفصول بعلامة | (زي "أحمد|35|ذكر") لمصفوفة خلايا - أسهل وأضمن بكتير للموديل من إنه يطلّع
// مصفوفة جوه مصفوفة أثناء الـ streaming، وده هو السبب الرئيسي إن الجداول كانت بتوصل فاضية أو مكسورة
const parsePipeRow = (row) => {
  if (Array.isArray(row)) return row
  return String(row == null ? '' : row).split('|').map(function (c) { return c.trim() })
}

// بيبني صفحة PDF عامة من أي محتوى (نص أو جداول) - بيستخدم نفس القالب الموحّد
const buildGenericPdfHTML = (title, sections) => {
  const sectionsHtml = (sections || []).map(function (s, idx) {
    const delay = (idx * 0.06).toFixed(2)
    if (s.type === 'table' && s.columns && s.rows) {
      const headerCells = s.columns.map(function (c) {
        return '<th>' + c + '</th>'
      }).join('')
      const bodyRows = s.rows.map(function (rawRow, ri) {
        const rowCells = parsePipeRow(rawRow)
        // بنكمّل أي خلايا ناقصة بفراغات عشان لو الموديل بعت صف أعمدته أقل، الجدول برضه يفضل متساوي وميتكسرش شكله
        while (rowCells.length < s.columns.length) rowCells.push('')
        const cells = rowCells.slice(0, s.columns.length).map(function (cell) {
          return '<td>' + (cell == null || cell === '' ? '<span class="empty-cell">—</span>' : cell) + '</td>'
        }).join('')
        return '<tr class="' + (ri % 2 === 0 ? 'row-even' : 'row-odd') + '">' + cells + '</tr>'
      }).join('')
      return '<section class="doc-section fade-in" style="animation-delay:' + delay + 's">' +
        (s.heading ? '<h2 class="section-heading"><span class="heading-bar"></span>' + s.heading + '</h2>' : '') +
        '<div class="table-wrap"><table><thead><tr>' + headerCells + '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>' +
        '</section>'
    }
    return '<section class="doc-section fade-in" style="animation-delay:' + delay + 's">' +
      (s.heading ? '<h2 class="section-heading"><span class="heading-bar"></span>' + s.heading + '</h2>' : '') +
      '<p class="section-text">' + (s.text || '') + '</p></section>'
  }).join('')

  return buildBrandedPdfShell(title, sectionsHtml)
}

// حماية بسيطة ضد فتح كذا تقرير مكرر في وقت متقارب جدًا (مثلاً لو الموديل استدعى الأداة مرتين بالغلط)
let lastPdfOpenAt = 0
const PDF_OPEN_COOLDOWN_MS = 1500

// بيفتح أي HTML جاهز في تاب جديد بأمان (Blob URL بدل document.write المباشر، بيمنع أي تعليق للتاب الأساسي)
const openHtmlInNewTab = (html) => {
  const now = Date.now()
  if (now - lastPdfOpenAt < PDF_OPEN_COOLDOWN_MS) return 'cooldown'
  lastPdfOpenAt = now

  const blob = new Blob([html], { type: 'text/html' })
  const blobUrl = URL.createObjectURL(blob)
  const win = window.open(blobUrl, '_blank')
  if (!win) { URL.revokeObjectURL(blobUrl); return false }
  setTimeout(function () { URL.revokeObjectURL(blobUrl) }, 60000)
  return true
}

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
const formatTimer = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

const SUGGESTIONS = ['سجّل مريض جديد', 'إيه أسباب ارتفاع السكر؟', 'اعرض حالة مريض معين', 'افتح تقرير مريض للطباعة']

const MAX_RECORDING_MS = 120000
const MAX_IMAGES = 4
const MAX_IMAGE_MB = 8
const AUTO_RESET_AFTER_TURNS = 8 // بعد كل 8 ردود، نبدأ سياق جديد مع Gemini عشان الرد يفضل سريع

const fetchWithTimeout = async (url, options, timeoutMs) => {
  options = options || {}
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(function () { timedOut = true; controller.abort() }, timeoutMs)

  const outerSignal = options.signal
  const onOuterAbort = function () { controller.abort() }
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort()
    else outerSignal.addEventListener('abort', onOuterAbort)
  }

  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }))
  } catch (err) {
    if (err.name === 'AbortError' && timedOut) {
      const timeoutErr = new Error('انتهى وقت الانتظار، الخدمة بطيئة دلوقتي')
      timeoutErr.name = 'TimeoutError'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort)
  }
}

const fetchWithRetry = async (url, options, timeoutMs, retries) => {
  try {
    return await fetchWithTimeout(url, options, timeoutMs)
  } catch (err) {
    if (retries > 0 && err.name !== 'AbortError' && err.name !== 'TimeoutError') {
      await new Promise(function (r) { setTimeout(r, 1000) })
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

// بيكلم Supabase Edge Function (gemini-proxy) بدل ما يكلم Gemini مباشرة - المفتاح بقى محفوظ سيرفر-سايد بس
const callGeminiProxy = async (path, body, signal, timeoutMs) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('لازم تسجّل دخول عشان تستخدم المساعد الذكي')

  const proxyUrl = supabase.supabaseUrl + '/functions/v1/gemini-proxy'
  return fetchWithTimeout(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    signal: signal,
    body: JSON.stringify({ path: path, body: body }),
  }, timeoutMs || 35000)
}

const callGeminiProxyWithRetry = async (path, body, signal, timeoutMs, retries) => {
  try {
    return await callGeminiProxy(path, body, signal, timeoutMs)
  } catch (err) {
    if (retries > 0 && err.name !== 'AbortError' && err.name !== 'TimeoutError') {
      await new Promise(function (r) { setTimeout(r, 1000) })
      return callGeminiProxyWithRetry(path, body, signal, timeoutMs, retries - 1)
    }
    throw err
  }
}

const blobToBase64 = (blob) => {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader()
    reader.onloadend = function () { resolve(reader.result.split(',')[1]) }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// بيضغط الصورة (تصغير الأبعاد + ضغط JPEG) قبل تحويلها لـ base64 وإرسالها للابو.
const compressImageToBase64 = (file, maxSize, quality) => {
  maxSize = maxSize || 1600
  quality = quality || 0.85
  return new Promise(function (resolve, reject) {
    const reader = new FileReader()
    reader.onerror = function () { reject(new Error('فشل قراءة الصورة')) }
    reader.onload = function (e) {
      const img = new Image()
      img.onerror = function () { reject(new Error('الملف ده مش صورة صالحة')) }
      img.onload = function () {
        let width = img.width
        let height = img.height
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round(height * (maxSize / width)); width = maxSize }
          else { width = Math.round(width * (maxSize / height)); height = maxSize }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl.split(',')[1])
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const pcmBase64ToWavBlob = (base64Pcm, sampleRate, numChannels, bitDepth) => {
  sampleRate = sampleRate || 24000
  numChannels = numChannels || 1
  bitDepth = bitDepth || 16
  const binary = atob(base64Pcm)
  const pcmBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) pcmBytes[i] = binary.charCodeAt(i)

  const blockAlign = numChannels * (bitDepth / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = pcmBytes.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = function (offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcmBytes)
  return new Blob([buffer], { type: 'audio/wav' })
}

const audioBufferToWavBlob = (audioBuffer) => {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitDepth = 16

  let interleaved
  if (numChannels === 2) {
    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)
    interleaved = new Float32Array(left.length * 2)
    for (let i = 0, j = 0; i < left.length; i++, j += 2) {
      interleaved[j] = left[i]
      interleaved[j + 1] = right[i]
    }
  } else {
    interleaved = audioBuffer.getChannelData(0)
  }

  const dataSize = interleaved.length * (bitDepth / 8)
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = function (offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }

  const blockAlign = numChannels * (bitDepth / 8)
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < interleaved.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, interleaved[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

const convertRecordingToWav = async (audioBlob) => {
  const arrayBuffer = await audioBlob.arrayBuffer()
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const audioCtx = new AudioContextClass()
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    return audioBufferToWavBlob(audioBuffer)
  } finally {
    audioCtx.close()
  }
}

const resolvePatient = (patients, name, age) => {
  const target = (name || '').trim()
  if (!target) return { notFound: true }
  let candidates = patients.filter(function (p) { return p.name && p.name.trim() === target })
  if (candidates.length === 0) candidates = patients.filter(function (p) { return p.name && p.name.includes(target) })
  if (candidates.length === 0) return { notFound: true }
  if (candidates.length > 1 && age) {
    const narrowed = candidates.filter(function (p) { return String(p.age) === String(age) })
    if (narrowed.length === 1) return { match: narrowed[0] }
  }
  if (candidates.length === 1) return { match: candidates[0] }
  return { ambiguous: candidates }
}

const ambiguityMessage = (candidates) => {
  const list = candidates.map(function (p) {
    return '- ' + p.name + ' (' + formatAge(p.age, p.age_unit) + '، ' + p.gender + (p.doctor ? '، دكتور: ' + p.doctor : '') + ')'
  }).join('\n')
  return 'في أكتر من مريض بنفس الاسم تقريبًا، اسأل المستخدم يحدد المريض بالظبط (بالسن أو الدكتور المحوّل):\n' + list
}

const matchTestsAgainstCatalog = (testNames, catalog) => {
  const matched = []
  const notFound = []
  testNames.forEach(function (name) {
    const found = (catalog && catalog.find(function (c) { return c.name.toLowerCase() === name.toLowerCase() }))
      || (catalog && catalog.find(function (c) { return c.name.toLowerCase().includes(name.toLowerCase()) }))
    if (found) matched.push({ name: found.name, normal_range: found.normal_range, unit: found.unit })
    else { matched.push({ name: name, normal_range: null, unit: null }); notFound.push(name) }
  })
  return { matched: matched, notFound: notFound }
}

const TOOLS = [
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
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
  },
  {
    type: 'function',
    name: 'list_patients',
    description: 'يرجع عدد المرضى المسجلين وقائمة بأسمائهم، مع إمكانية فلترة بفترة زمنية معينة. استخدمها لو المستخدم سأل عن عدد المرضى، طلب قائمة الأسماء، أو طلب تقرير/PDF عن مرضى فترة معينة (مثلاً "مرضى الأسبوع اللي فات").',
    parameters: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'تاريخ البداية بصيغة YYYY-MM-DD (اختياري)' },
        to_date: { type: 'string', description: 'تاريخ النهاية بصيغة YYYY-MM-DD (اختياري، شامل هذا اليوم)' }
      }
    }
  },
  {
    type: 'function',
    name: 'search_medical_info',
    description: 'يبحث في الإنترنت عن معلومات طبية دقيقة وحديثة.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'generate_financial_report',
    description: 'يجهّز تقرير مالي (عدد مرضى، إيراد، تحصيل، مصروفات، صافي ربح، أكتر تحاليل وأطباء) لفترة معينة، ويفتحه في تاب جديد جاهز للطباعة أو الحفظ كملف PDF. عملية قراءة آمنة بالكامل (مش بتعدّل أي بيانات)، فنفّذها فورًا بدون انتظار تأكيد أي وقت المستخدم يطلب تقرير أو "PDF" عن الفلوس أو الإيراد.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'month', 'year'], description: 'الفترة المطلوبة: day = اليوم، month = الشهر الحالي، year = السنة الحالية' }
      },
      required: ['period']
    }
  },
  {
    type: 'function',
    name: 'generate_document_pdf',
    description: 'ينشئ تقرير PDF عام أنيق ومصمّم باحترافية من أي محتوى في السيستم (بيانات مريض، قايمة نتائج، قايمة مرضى، ملخص حالة، أو أي نص/جدول تاني) ويفتحه في تاب جديد جاهز للطباعة أو الحفظ. استخدمها لأي طلب PDF أو "طباعة" عام غير التقرير المالي (اللي له أداته الخاصة generate_financial_report). عملية قراءة آمنة تمامًا، نفّذها فورًا بدون انتظار تأكيد.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'عنوان التقرير' },
        sections: {
          type: 'array',
          description: 'أقسام التقرير، كل قسم إما جدول أو نص',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'عنوان القسم (اختياري)' },
              type: { type: 'string', enum: ['table', 'text'] },
              text: { type: 'string', description: 'مطلوب لو type = text' },
              columns: { type: 'array', items: { type: 'string' }, description: 'أسماء أعمدة الجدول، مطلوب لو type = table' },
              rows: {
                type: 'array',
                items: { type: 'string' },
                description: 'صفوف الجدول، مطلوب لو type = table. كل صف هو نص واحد بس، وخلاياه مفصولة بعلامة | (خط مائل رأسي)، وعدد الخلايا لازم يساوي عدد الأعمدة. مثال لعمودين "الاسم" و"السن": ["أحمد محمد|35", "سارة علي|28"]. متبعتش مصفوفة جوه مصفوفة أبدًا، الصف نص واحد بس.'
              }
            }
          }
        }
      },
      required: ['title', 'sections']
    }
  }
]

// ردود جاهزة محلية للأسئلة الشائعة جدًا - بتشتغل من غير أي اتصال بـ Gemini خالص
const OFFLINE_FAQ = [
  { keys: ['سجل مريض', 'تسجيل مريض', 'مريض جديد'], answer: 'تقدر تسجّل مريض جديد من زرار "➕ مريض جديد" في القائمة الجانبية، أو من نفس الشات لو الخدمة الذكية رجعت شغالة.' },
  { keys: ['نتائج', 'نتيجة التحليل', 'فين النتائج'], answer: 'نتائج التحاليل موجودة في صفحة "🔬 نتائج التحاليل" من القائمة الجانبية.' },
  { keys: ['طباعة', 'اطبع', 'تقرير'], answer: 'تقدر تطبع تقرير أي مريض من صفحة "📄 التقارير"، اختار المريض ودوس "طباعة التقرير".' },
  { keys: ['باركود'], answer: 'زرار الباركود موجود جنب كل مريض في صفحة "نتائج التحاليل".' },
  { keys: ['ازيك', 'عامل ايه', 'اخبارك'], answer: 'أهلاً بيك! أنا لابو، بس دلوقتي شغال في وضع محدود لأن الخدمة الذكية مشغولة شوية. جرّب تاني بعد شوية أو استخدم القائمة الجانبية مباشرة.' },
]

const findOfflineAnswer = (userText) => {
  const t = (userText || '').toLowerCase()
  const match = OFFLINE_FAQ.find(function (f) { return f.keys.some(function (k) { return t.includes(k) }) })
  return match ? match.answer : null
}

// أدوات نتيجتها واضحة بذاتها ومش محتاجة "جولة تانية" مع الموديل عشان يلخصها
const SKIP_FOLLOWUP_TOOLS = ['generate_financial_report', 'open_patient_report', 'generate_document_pdf']

const SYSTEM_INSTRUCTION = 'أنت "لابو"، مساعد ذكي autonomous بتشتغل في معمل طبي، وعندك معرفة موسوعية واسعة في كل المجالات (طب، علوم، تاريخ، تكنولوجيا، رياضة، فن، حياة عامة... أي موضوع).\n\n' +
  'شخصيتك:\n' +
  '- بتتكلم بالعربية العامية المصرية البسيطة\n' +
  '- عندك معلومات دقيقة وعميقة في كل حاجة تقريباً، ولما حد يسألك سؤال عام (مش بس طبي) جاوبه بثقة ومعرفة حقيقية\n' +
  '- أسلوبك في الرد ممتع وجذاب: تشبيهات بسيطة، نكتة خفيفة أحياناً، حماس في الكلام، مش رد جاف أو روبوتي\n' +
  '- لما بتنفذ حاجة فورًا، بتقول "تمام، عملت كذا ✅" بشكل مختصر وبطعم شخصيتك\n' +
  '- لو المستخدم بعتلك صورة (زي نتيجة تحليل ورقية، أو تقرير طبي، أو أي صورة تانية)، افحصها كويس واستخرج منها أي بيانات مفيدة (اسم مريض، نوع تحليل، قيم، إلخ) وساعده بيها في كلامه، بس متستخدمش أي أداة من غير ما تتأكد من البيانات الأول\n\n' +
  'الأدوات المتاحة لك وإزاي تستخدمها:\n' +
  '- list_patients: استخدمها بس لو المستخدم سأل عن عدد المرضى أو طلب قائمة الأسماء (تقدر كمان تحدد from_date/to_date لو المستخدم قصد فترة معينة). متفترضش إنك عارف القائمة من نفسك.\n' +
  '- find_patient: استخدمها أول ما تحتاج أي تفصيل عن مريض معين (تحاليله، نتائجه، حالته). لا تخمّن بيانات مريض من نفسك أبدًا.\n\n' +
  'قواعد التأكيد قبل التنفيذ (مهم جدًا، أمان البيانات الطبية يعتمد عليها):\n' +
  '- propose_new_patient، propose_test_result، propose_update_patient، propose_delete_patient: الأربعة دول بيعرضوا البيانات في الشات للمستخدم يأكدها بنفسه، وما بيحفظوش أو يعدّلوا أو يمسحوا حاجة فعليًا. لو استخدمت واحدة منهم، قول للمستخدم إن البيانات معروضة وتنتظر تأكيده، ومتقولش أبدًا إن العملية "تمت".\n' +
  '- add_tests_to_patient و open_patient_report و find_patient و list_patients و search_medical_info و generate_financial_report و generate_document_pdf: آمنين (إضافة بس، أو قراءة، أو بحث)، فنفّذهم فورًا بدون انتظار تأكيد.\n' +
  '- generate_document_pdf: استخدمها لأي طلب PDF أو تقرير عام (قايمة مرضى، نتائج تحليل، ملخص حالة مريض، أو أي محتوى تاني في السيستم)، بس لو الطلب عن الفلوس/الإيراد استخدم generate_financial_report بدلها. لو محتاج بيانات مريض أو تحاليل عشان تبني منها التقرير، استخدم find_patient أو list_patients الأول عشان تجيب البيانات الحقيقية قبل ما تبني الجدول، لا تخترع بيانات من عندك أبدًا. تذكّر: كل صف في الجدول لازم يبقى نص واحد وخلاياه مفصولة بعلامة | بس، مش مصفوفة.\n' +
  '- لو الأداة رجعت لك رسالة فيها "في أكتر من مريض بنفس الاسم"، اسأل المستخدم يحدد قبل ما تكمل، لا تخمّن.\n\n' +
  'التعامل مع الكلام الغامض أو الصوت غير الواضح:\n' +
  '- لو الرسالة غير واضحة وما تقدرش تحدد بدقة إنها تطابق أمر معين، لا تستخدم أي أداة فوراً، خمّن أقرب أمر واسأل المستخدم بوضوح\n' +
  '- لو رد بالإيجاب، استخدم الأداة المناسبة. لو رد بالنفي، قول له يتكلم أو يكتب أوضح ولا تنفذ أي شيء\n\n' +
  'لو سُئلت عن هويتك أو مين اللي عملك:\n' +
  '- رد بس بـ: "عمي وعمك المهندس أبو المجد 😄" ومتفتحش الموضوع أكتر\n\n' +
  'قواعد الردود:\n' +
  '- لا تستخدم ### أو ** أو جداول\n' +
  '- ردودك مختصرة ومباشرة لما تكون بتنفذ أمر، وأطول شوية مع روح وحماس لما يسألك سؤال عام أو معرفي\n\n' +
  'قواعد النصائح الغذائية:\n' +
  '- لما تقترح أنواع أكل معينة، لازم تدي أمثلة ملموسة بالعامية المصرية (زي "كل أكل غني بالحديد، زي اللحمة والسبانخ والعدس")'

export default function AIAssistant() {
  const navigate = useNavigate()
  const context = useOutletContext() || {}
  const messages = context.chatMessages
  const setMessages = context.setChatMessages
  const historyRef = context.chatHistoryRef
  const showToast = useToast()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [pendingImages, setPendingImages] = useState([])

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isSendingRef = useRef(false)
  const recordingTimeoutRef = useRef(null)
  const recordingIntervalRef = useRef(null)
  const currentAudioRef = useRef(null)
  const turnCountRef = useRef(0)

  useEffect(function () {
    if (messages && messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(function () {
    if (textareaRef.current) textareaRef.current.focus()
  }, [])

  useEffect(function () {
    return function () {
      if (streamRef.current) streamRef.current.getTracks().forEach(function (t) { t.stop() })
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

  if (!historyRef.current || Array.isArray(historyRef.current)) {
    historyRef.current = { previousId: null }
  }

  const getPatientsLight = async () => {
    const res = await supabase.from('patients').select('id, name, age, age_unit, gender, phone, doctor, created_at')
    return res.data || []
  }

  const getPatientWithTests = async (patientId) => {
    const res = await supabase.from('patients').select('*, tests(*)').eq('id', patientId).single()
    return res.data || null
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
    if (navigator.clipboard) navigator.clipboard.writeText(content)
    setCopiedIndex(i)
    setTimeout(function () { setCopiedIndex(null) }, 1500)
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

  const handleImageButtonClick = () => {
    if (pendingImages.length >= MAX_IMAGES) {
      showStatus('⚠️ الحد الأقصى ' + MAX_IMAGES + ' صور في المرة الواحدة')
      return
    }
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const handleImageFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    const room = MAX_IMAGES - pendingImages.length
    if (room <= 0) {
      showStatus('⚠️ الحد الأقصى ' + MAX_IMAGES + ' صور في المرة الواحدة')
      return
    }

    const toProcess = files.slice(0, room)
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i]
      if (!file.type.startsWith('image/')) continue
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        showStatus('⚠️ الصورة "' + file.name + '" أكبر من ' + MAX_IMAGE_MB + ' ميجا')
        continue
      }
      try {
        const base64 = await compressImageToBase64(file)
        const previewUrl = URL.createObjectURL(file)
        const imageItem = { id: Date.now() + '_' + Math.random().toString(36).slice(2), mimeType: 'image/jpeg', base64: base64, previewUrl: previewUrl }
        setPendingImages(function (prev) { return prev.concat([imageItem]) })
      } catch (err) {
        showStatus('⚠️ فشل تحميل الصورة "' + file.name + '"')
      }
    }
  }

  const removePendingImage = (id) => {
    setPendingImages(function (prev) {
      const target = prev.find(function (p) { return p.id === id })
      if (target && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(function (p) { return p.id !== id })
    })
  }

  const startNewConversation = () => {
    stopSpeaking()
    if (loading) stopGeneration()
    pendingImages.forEach(function (img) { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl) })
    setPendingImages([])
    historyRef.current = { previousId: null }
    turnCountRef.current = 0
    setMessages([{ role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي تعمله وأنا هعمله فوراً!' }])
  }

  const sendMessage = async (text) => {
    const trimmed = (text || '').trim()
    const imagesToSend = pendingImages
    if (!trimmed && imagesToSend.length === 0) return
    if (isSendingRef.current) return
    isSendingRef.current = true

    stopSpeaking()
    const userMessageText = trimmed || 'صف الصورة دي وقولّي رأيك فيها'

    setMessages(function (prev) {
      return prev.concat([{
        role: 'user',
        content: userMessageText,
        images: imagesToSend.map(function (img) { return img.previewUrl }),
        time: Date.now()
      }])
    })
    setInput('')
    setPendingImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    turnCountRef.current += 1
    if (turnCountRef.current > AUTO_RESET_AFTER_TURNS && historyRef.current.previousId) {
      historyRef.current.previousId = null
      turnCountRef.current = 1
      showStatus('🔄 بدأت سياق جديد مع لابو عشان الرد يفضل سريع (بيانات المرضى والتحاليل زي ما هي، بس نسي تفاصيل كلامنا القديم في المحادثة دي)')
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const patients = await getPatientsLight()
      const contentBlocks = [{ type: 'text', text: userMessageText }]
      imagesToSend.forEach(function (img) {
        contentBlocks.push({ type: 'image', mime_type: img.mimeType, data: img.base64 })
      })
      const streamState = { id: null, text: '', startTime: performance.now(), firstTokenAt: null, flushTimer: null }
      await runAssistantTurn(controller.signal, [{ type: 'user_input', content: contentBlocks }], patients, 0, streamState)
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(function (prev) { return prev.concat([{ role: 'status', content: '⏹ تم إيقاف الطلب', time: Date.now() }]) })
      } else if (err.name === 'TimeoutError') {
        setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: 'الخدمة بطيئة دلوقتي ومحتاجة وقت أطول من المتوقع.', retryText: userMessageText, time: Date.now() }]) })
      } else {
        const errMsg = err.message || 'غير معروف'
        const isQuotaError = /quota|rate.?limit|resource_exhausted/i.test(errMsg)

        if (isQuotaError) {
          const offlineAnswer = findOfflineAnswer(userMessageText)
          if (offlineAnswer) {
            setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: '🔌 (رد جاهز محلي - الخدمة الذكية مشغولة دلوقتي)\n\n' + offlineAnswer, time: Date.now() }]) })
            return
          }
        }

        const retryMatch = errMsg.match(/retry in ([\d.]+)s/i)
        const retryUnlockAt = retryMatch ? Date.now() + Math.ceil(parseFloat(retryMatch[1])) * 1000 : null
        setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: 'حدث خطأ تقني: ' + errMsg + '\n\nلو المشكلة استمرت، افتح Console (F12) وابعت التفاصيل.', retryText: userMessageText, retryUnlockAt: retryUnlockAt, time: Date.now() }]) })
      }
    } finally {
      isSendingRef.current = false
      setLoading(false)
      abortControllerRef.current = null
      if (textareaRef.current) textareaRef.current.focus()
    }
  }

  const stopGeneration = () => { if (abortControllerRef.current) abortControllerRef.current.abort() }

  const runAssistantTurn = async (signal, inputPayload, patients, depth, streamState, modelIndex) => {
    if (depth > 6) return
    modelIndex = modelIndex || 0
    const modelToUse = MODEL_CHAIN[modelIndex] || MODEL_CHAIN[MODEL_CHAIN.length - 1]

    const body = {
      model: modelToUse,
      input: inputPayload,
      tools: TOOLS,
      system_instruction: SYSTEM_INSTRUCTION,
      generation_config: { thinking_level: 'low' },
      stream: true
    }
    if (historyRef.current.previousId) body.previous_interaction_id = historyRef.current.previousId

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('لازم تسجّل دخول عشان تستخدم المساعد الذكي')

    const response = await fetch(supabase.supabaseUrl + '/functions/v1/gemini-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      signal: signal,
      body: JSON.stringify({ path: INTERACTIONS_PATH + '?alt=sse', body: body })
    })

    if (!response.ok || !response.body) {
      let apiErrorMsg = 'رمز الخطأ: ' + response.status
      try {
        const errData = await response.json()
        if (errData.error && errData.error.message) apiErrorMsg = errData.error.message
      } catch (e) { /* الرد مش JSON، هنكتفي برمز الخطأ */ }

      const isOverloaded = /overloaded|high demand|503/i.test(apiErrorMsg) || response.status === 503
      if (isOverloaded && modelIndex < MODEL_CHAIN.length - 1) {
        showStatus('🔄 موديل "' + modelToUse + '" مشغول دلوقتي، بيجرب موديل بديل...')
        return runAssistantTurn(signal, inputPayload, patients, depth, streamState, modelIndex + 1)
      }

      throw new Error('خطأ من Gemini API: ' + apiErrorMsg)
    }

    const functionCallsMap = {}
    const functionCallOrder = []
    let finalInteractionId = null
    let finalStatus = null

    const handleSSEEvent = function (eventType, data) {
      if (eventType === 'step.start' && data.step) {
        if (data.step.type === 'function_call') {
          functionCallsMap[data.index] = { name: data.step.name, id: data.step.id, argsText: '' }
          functionCallOrder.push(data.index)
        }
      } else if (eventType === 'step.delta' && data.delta) {
        if (data.delta.type === 'text') {
          appendAssistantStreamText(streamState, data.delta.text)
        } else if (data.delta.type === 'arguments' || data.delta.type === 'arguments_delta') {
          const fc = functionCallsMap[data.index]
          if (fc) fc.argsText += (data.delta.partial_arguments || data.delta.arguments_delta || data.delta.text || '')
        }
      } else if (eventType === 'interaction.completed' && data.interaction) {
        finalInteractionId = data.interaction.id
        finalStatus = data.interaction.status
      } else if (eventType === 'error') {
        throw new Error('خطأ من Gemini API: ' + ((data.error && data.error.message) || 'غير معروف'))
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })

      let sepIndex
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        if (!rawEvent.trim()) continue

        let eventType = null
        let dataStr = ''
        rawEvent.split('\n').forEach(function (line) {
          if (line.indexOf('event:') === 0) eventType = line.slice(6).trim()
          else if (line.indexOf('data:') === 0) dataStr += line.slice(5).trim()
        })

        if (dataStr) {
          let data
          try { data = JSON.parse(dataStr) } catch (e) { continue }
          handleSSEEvent(eventType, data)
        }
      }
    }

    if (streamState.flushTimer) {
      clearTimeout(streamState.flushTimer)
      streamState.flushTimer = null
      const sid = streamState.id
      const fullText = streamState.text
      if (sid) setMessages(function (prev) { return prev.map(function (m) { return m.streamId === sid ? Object.assign({}, m, { content: fullText }) : m }) })
    }

    if (finalInteractionId) historyRef.current.previousId = finalInteractionId

    if (finalStatus === 'requires_action' && functionCallOrder.length > 0) {
      const functionResults = []
      const executedNames = []
      let lastVisibleResult = ''
      for (let i = 0; i < functionCallOrder.length; i++) {
        const fc = functionCallsMap[functionCallOrder[i]]
        let args = {}
        try { args = fc.argsText ? JSON.parse(fc.argsText) : {} } catch (e) { args = {} }
        let resultText
        try {
          resultText = await handleToolCall({ name: fc.name, id: fc.id, arguments: args }, signal, patients)
        } catch (err) {
          if (err.name === 'AbortError') throw err
          resultText = 'حصل خطأ غير متوقع في تنفيذ هذه العملية: ' + err.message
        }
        executedNames.push(fc.name)
        lastVisibleResult = resultText
        functionResults.push({
          type: 'function_result',
          name: fc.name,
          call_id: fc.id,
          result: [{ type: 'text', text: resultText }]
        })
      }

      const allSkippable = executedNames.length > 0 && executedNames.every(function (n) { return SKIP_FOLLOWUP_TOOLS.indexOf(n) !== -1 })
      if (allSkippable) {
        setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: lastVisibleResult, time: Date.now() }]) })
        historyRef.current.previousId = null
        return
      }

      await runAssistantTurn(signal, functionResults, patients, depth + 1, streamState, modelIndex)
      return
    }

    if (!streamState.text) {
      setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: 'حدث خطأ، حاول مرة أخرى.', time: Date.now() }]) })
    }
  }

  const showStatus = (text) => {
    setMessages(function (prev) { return prev.concat([{ role: 'status', content: text, time: Date.now() }]) })
  }

  const appendAssistantStreamText = (streamState, chunk) => {
    if (!chunk) return
    if (streamState.firstTokenAt === null) {
      streamState.firstTokenAt = performance.now()
    }
    streamState.text += chunk

    if (!streamState.id) {
      streamState.id = 'stream_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: chunk, time: Date.now(), streamId: streamState.id }]) })
      return
    }

    const sid = streamState.id
    if (streamState.flushTimer) return
    streamState.flushTimer = setTimeout(function () {
      streamState.flushTimer = null
      const fullText = streamState.text
      setMessages(function (prev) { return prev.map(function (m) { return m.streamId === sid ? Object.assign({}, m, { content: fullText }) : m }) })
    }, 80)
  }

  const handleToolCall = async (call, signal, patients) => {
    const args = call.arguments || {}
    const name = call.name

    if (name === 'propose_new_patient') {
      setMessages(function (prev) {
        return prev.concat([{
          role: 'confirm', time: Date.now(),
          pending: { type: 'new_patient', status: 'pending', data: { name: args.name || '', age: args.age || '', gender: args.gender || '', phone: args.phone || '', doctor: args.doctor || '', testNames: args.tests || [] } }
        }])
      })
      return 'تم عرض بيانات المريض الجديد على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا.'
    }

    if (name === 'propose_test_result') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      setMessages(function (prev) {
        return prev.concat([{
          role: 'confirm', time: Date.now(),
          pending: { type: 'test_result', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name, testName: args.test_name || '', value: args.value || '' } }
        }])
      })
      return 'تم عرض النتيجة على المستخدم في الشات لتأكيد الحفظ. لم يتم الحفظ فعليًا.'
    }

    if (name === 'propose_update_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      const updates = {}
      if (args.new_name) updates.name = args.new_name
      if (args.new_age) updates.age = parseInt(args.new_age)
      if (args.new_gender) updates.gender = args.new_gender
      if (args.new_doctor) updates.doctor = args.new_doctor
      if (args.new_phone) updates.phone = args.new_phone

      setMessages(function (prev) {
        return prev.concat([{
          role: 'confirm', time: Date.now(),
          pending: { type: 'update_info', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name, updates: updates } }
        }])
      })
      return 'تم عرض التعديل المطلوب على المستخدم في الشات لتأكيد الحفظ. لم يتم التعديل فعليًا.'
    }

    if (name === 'propose_delete_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      setMessages(function (prev) {
        return prev.concat([{
          role: 'confirm', time: Date.now(),
          pending: { type: 'delete', status: 'pending', data: { patientId: resolved.match.id, patientName: resolved.match.name } }
        }])
      })
      return 'تم عرض طلب الحذف على المستخدم في الشات لتأكيده. لم يتم الحذف فعليًا.'
    }

    if (name === 'add_tests_to_patient') {
      try {
        const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
        if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
        if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

        showStatus('⏳ بيضيف تحاليل للمريض ' + resolved.match.name + '...')
        const catalogRes = await supabase.from('test_catalog').select('*')
        const catalog = catalogRes.data
        const matchResult = matchTestsAgainstCatalog(args.tests || [], catalog)

        const testsToInsert = matchResult.matched.map(function (t) {
          return { patient_id: resolved.match.id, name: t.name, normal_range: t.normal_range, unit: t.unit, status: 'تم التجميع' }
        })
        await supabase.from('tests').insert(testsToInsert)

        let msg = 'تم إضافة ' + matchResult.matched.length + ' تحليل للمريض "' + resolved.match.name + '"'
        if (matchResult.notFound.length) msg += '. تنبيه: التحاليل دي مش موجودة في قائمة التحاليل المعتمدة فتم تسجيلها من غير معدل طبيعي محدد: ' + matchResult.notFound.join(', ')
        return msg
      } catch (err) {
        return 'فشل إضافة التحاليل: ' + err.message
      }
    }

    if (name === 'list_patients') {
      let filtered = patients
      if (args.from_date) {
        const fromTs = new Date(args.from_date + 'T00:00:00').getTime()
        filtered = filtered.filter(function (p) { return p.created_at && new Date(p.created_at).getTime() >= fromTs })
      }
      if (args.to_date) {
        const toTs = new Date(args.to_date + 'T23:59:59').getTime()
        filtered = filtered.filter(function (p) { return p.created_at && new Date(p.created_at).getTime() <= toTs })
      }

      if (!filtered.length) return 'مفيش مرضى مطابقين للفترة دي.'

      const MAX_LISTED = 50
      const shown = filtered.slice(0, MAX_LISTED)
      const roster = shown.map(function (p) { return p.name + ' (' + formatAge(p.age, p.age_unit) + '، ' + p.gender + ')' }).join('، ')
      const extra = filtered.length > MAX_LISTED ? ' (وعرضنا أول ' + MAX_LISTED + ' بس، العدد الكلي أكبر من كده)' : ''
      return 'عدد المرضى المطابقين: ' + filtered.length + extra + '. الأسماء: ' + roster
    }

    if (name === 'find_patient') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      showStatus('⏳ بيجيب بيانات ' + resolved.match.name + '...')
      const full = await getPatientWithTests(resolved.match.id)
      const p = full || resolved.match
      const testsInfo = (p.tests && p.tests.length)
        ? p.tests.map(function (t) {
          return t.name + ' - النتيجة: ' + (t.value || 'لم تدخل بعد') + ' ' + (t.unit || '') + ' - المعدل الطبيعي: ' + (t.normal_range || 'غير محدد') + ' - الحالة: ' + t.status
        }).join('. ')
        : 'لا توجد تحاليل مسجلة'
      return 'بيانات المريض "' + p.name + '": ' + formatAge(p.age, p.age_unit) + '، ' + p.gender + '، دكتور محوّل: ' + (p.doctor || 'غير محدد') + '. التحاليل: ' + testsInfo
    }

    if (name === 'open_patient_report') {
      const resolved = resolvePatient(patients, args.patient_name, args.patient_age)
      if (resolved.notFound) return 'مش لاقي مريض اسمه "' + args.patient_name + '"'
      if (resolved.ambiguous) return ambiguityMessage(resolved.ambiguous)

      navigate('/reports', { state: { autoSelectPatientId: resolved.match.id } })
      return 'تم فتح تقرير "' + resolved.match.name + '" جاهز للطباعة'
    }

    if (name === 'search_medical_info') {
      try {
        showStatus('🔎 بيبحث في الإنترنت...')
        const res = await callGeminiProxyWithRetry(INTERACTIONS_PATH, {
          model: MODEL_CHAIN[0],
          input: 'ابحث وجاوب بعربي بسيط بدون جداول أو Markdown: ' + (args.query || ''),
          tools: [{ type: 'google_search' }],
          generation_config: { thinking_level: 'low' }
        }, signal, 45000, 1)
        const data = await safeJson(res)
        const steps = data.steps || []
        let textOut = ''
        steps.filter(function (s) { return s.type === 'model_output' }).forEach(function (s) {
          (s.content || []).forEach(function (c) { if (c.type === 'text') textOut += c.text })
        })
        return textOut || 'مش لقيت نتايج.'
      } catch (err) {
        if (err.name === 'AbortError') throw err
        if (err.name === 'TimeoutError') return 'البحث في الإنترنت أخذ وقت طويل، اعتمد على معلوماتك العامة بدلاً من ذلك.'
        return 'حصل خطأ في البحث.'
      }
    }

    if (name === 'generate_financial_report') {
      try {
        showStatus('📄 بيجهّز التقرير المالي...')
        const period = args.period || 'month'
        const { start, end, label } = getSimpleRange(period)

        const [patientsRes, expensesRes] = await Promise.all([
          supabase.from('patients').select('*, tests(*)').gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
          supabase.from('lab_expenses').select('*').gte('expense_date', start.toISOString().slice(0, 10)).lt('expense_date', end.toISOString().slice(0, 10)),
        ])

        if (patientsRes.error) throw patientsRes.error

        const summary = summarizeFinances(patientsRes.data || [], expensesRes.data || [])
        const rangeLabel = start.toLocaleDateString('ar-EG') + ' → ' + new Date(end.getTime() - 1).toLocaleDateString('ar-EG')
        const rawHtml = buildFinancialReportHTML(summary, { periodLabel: label, rangeLabel })
        const innerContent = extractBodyContent(rawHtml)
        const html = buildBrandedPdfShell('التقرير المالي - ' + label, innerContent)

        const opened = openHtmlInNewTab(html)
        if (opened === 'cooldown') return 'لسه فاتح تقرير من ثانية، من فضلك استنى شوية وحاول تاني.'
        if (!opened) {
          return 'المتصفح منع فتح تاب جديد (pop-up). من فضلك اسمح بالنوافذ المنبثقة لهذا الموقع من إعدادات المتصفح وحاول تاني.'
        }

        return 'تم تجهيز التقرير المالي عن "' + label + '" وفتحه في تاب جديد. من فيه، دوس زرار "🖨️ طباعة / حفظ PDF" وفي نافذة الطباعة اختار Save as PDF عشان تحفظه كملف.'
      } catch (err) {
        return 'حصل خطأ أثناء تجهيز التقرير المالي: ' + err.message
      }
    }

    if (name === 'generate_document_pdf') {
      try {
        showStatus('📄 بيجهّز التقرير...')
        const html = buildGenericPdfHTML(args.title || 'تقرير', args.sections || [])
        const opened = openHtmlInNewTab(html)
        if (opened === 'cooldown') return 'لسه فاتح تقرير من ثانية، من فضلك استنى شوية وحاول تاني.'
        if (!opened) {
          return 'المتصفح منع فتح تاب جديد (pop-up). من فضلك اسمح بالنوافذ المنبثقة لهذا الموقع من إعدادات المتصفح وحاول تاني.'
        }
        return 'تم تجهيز تقرير "' + (args.title || '') + '" بتصميم احترافي وفتحه في تاب جديد. من فيه، دوس زرار "🖨️ طباعة / حفظ PDF" وفي نافذة الطباعة اختار Save as PDF عشان تحفظه كملف.'
      } catch (err) {
        return 'حصل خطأ أثناء تجهيز التقرير: ' + err.message
      }
    }

    return 'أداة غير معروفة.'
  }

  const confirmPending = async (index, pending) => {
    setMessages(function (prev) { return prev.map(function (m, i) { return i === index ? Object.assign({}, m, { pending: Object.assign({}, m.pending, { status: 'saving' }) }) : m }) })
    try {
      if (pending.type === 'new_patient') await executeNewPatient(pending.data)
      else if (pending.type === 'test_result') await executeTestResult(pending.data)
      else if (pending.type === 'update_info') await executeUpdatePatient(pending.data)
      else if (pending.type === 'delete') await executeDeletePatient(pending.data)
      setMessages(function (prev) { return prev.map(function (m, i) { return i === index ? Object.assign({}, m, { pending: Object.assign({}, m.pending, { status: 'done' }) }) : m }) })
    } catch (err) {
      setMessages(function (prev) { return prev.map(function (m, i) { return i === index ? Object.assign({}, m, { pending: Object.assign({}, m.pending, { status: 'error', error: err.message }) }) : m }) })
    }
  }

  const cancelPending = (index) => {
    setMessages(function (prev) { return prev.map(function (m, i) { return i === index ? Object.assign({}, m, { pending: Object.assign({}, m.pending, { status: 'cancelled' }) }) : m }) })
  }

  const executeNewPatient = async (data) => {
    const insertRes = await supabase.from('patients').insert([{
      name: data.name, age: parseInt(data.age), gender: data.gender, phone: data.phone || null, doctor: data.doctor || null
    }]).select().single()
    if (insertRes.error) throw insertRes.error
    const patient = insertRes.data

    if (data.testNames && data.testNames.length) {
      const catalogRes = await supabase.from('test_catalog').select('*')
      const matchResult = matchTestsAgainstCatalog(data.testNames, catalogRes.data)
      const testsToInsert = matchResult.matched.map(function (t) {
        return { patient_id: patient.id, name: t.name, normal_range: t.normal_range, unit: t.unit, status: 'تم التجميع' }
      })
      const testsRes = await supabase.from('tests').insert(testsToInsert)
      if (testsRes.error) throw testsRes.error
    }
  }

  const executeTestResult = async (data) => {
    const status = (data.value && data.value.trim()) ? 'معتمد' : 'تم التجميع'
    const patient = await getPatientWithTests(data.patientId)
    let test = null
    if (patient && patient.tests) {
      test = patient.tests.find(function (t) { return t.name && t.name.toLowerCase() === data.testName.toLowerCase() })
      if (!test) test = patient.tests.find(function (t) { return t.name && t.name.toLowerCase().includes(data.testName.toLowerCase()) })
    }
    if (!test) throw new Error('مش لاقي تحليل اسمه "' + data.testName + '" لدى المريض')

    const updateRes = await supabase.from('tests').update({ value: data.value, status: status }).eq('id', test.id)
    if (updateRes.error) throw updateRes.error
  }

  const executeUpdatePatient = async (data) => {
    const res = await supabase.from('patients').update(data.updates).eq('id', data.patientId)
    if (res.error) throw res.error
  }

  const executeDeletePatient = async (data) => {
    await supabase.from('tests').delete().eq('patient_id', data.patientId)
    const res = await supabase.from('patients').delete().eq('id', data.patientId)
    if (res.error) throw res.error
  }

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
      const recorder = new MediaRecorder(stream, { mimeType: mimeType })
      recorder.ondataavailable = function (e) { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async function () {
        if (streamRef.current) streamRef.current.getTracks().forEach(function (t) { t.stop() })
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
      recordingIntervalRef.current = setInterval(function () { setRecordingSeconds(function (s) { return s + 1 }) }, 1000)

      recordingTimeoutRef.current = setTimeout(function () {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          showStatus('⏱ تم إيقاف التسجيل تلقائيًا (الحد الأقصى دقيقتين)')
          stopListening()
        }
      }, MAX_RECORDING_MS)
    } catch (e) {
      alert('محتاجين إذن الميكروفون')
    }
  }

  const stopListening = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop()
    setListening(false)
    if (recordingTimeoutRef.current) { clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null }
    if (recordingIntervalRef.current) { clearInterval(recordingIntervalRef.current); recordingIntervalRef.current = null }
  }

  const transcribeAudio = async (audioBlob) => {
    setLoading(true)
    try {
      const wavBlob = await convertRecordingToWav(audioBlob)
      const base64Audio = await blobToBase64(wavBlob)

      const res = await callGeminiProxyWithRetry(INTERACTIONS_PATH, {
        model: MODEL_CHAIN[0],
        input: [
          {
            type: 'user_input',
            content: [
              { type: 'text', text: 'انسخ الكلام في التسجيل الصوتي ده حرفيًا كنص (عربي أو إنجليزي)، من غير أي تعليق أو شرح إضافي، النص بس.' },
              { type: 'audio', data: base64Audio, mime_type: 'audio/wav' }
            ]
          }
        ],
        generation_config: { thinking_level: 'low' }
      }, undefined, 25000, 1)

      if (!res.ok) {
        const errData = await safeJson(res).catch(function () { return {} })
        const apiErrorMsg = (errData.error && errData.error.message) ? errData.error.message : ('رمز الخطأ: ' + res.status)
        setLoading(false)
        showStatus('⚠️ خطأ في تحويل الصوت: ' + apiErrorMsg)
        return
      }

      const data = await safeJson(res)
      const steps = data.steps || []
      let transcript = ''
      steps.filter(function (s) { return s.type === 'model_output' }).forEach(function (s) {
        (s.content || []).forEach(function (c) { if (c.type === 'text') transcript += c.text })
      })
      transcript = transcript.trim()

      if (transcript) {
        sendMessage(transcript)
      } else {
        setLoading(false)
        showStatus('⚠️ مش قدرت أسمع كلام واضح، جرّب تاني')
      }
    } catch (err) {
      setLoading(false)
      if (err.name === 'TimeoutError') showStatus('⏱ تحويل الصوت أخذ وقت طويل، حاول تاني')
      else showStatus('⚠️ حصل خطأ أثناء تحويل الصوت لنص، حاول تاني')
    }
  }

  const splitForTTS = (text) => {
    const MAX_CHUNK = 4000
    const clean = text.replace(/[#*|]/g, '').replace(/\n+/g, ' ')
    const sentences = clean.split(/(?<=[.!؟?])\s+/).filter(function (s) { return s.trim() })
    const chunks = []
    let current = ''
    sentences.forEach(function (sentence) {
      const trimmed = sentence.trim()
      if (!trimmed) return
      if (trimmed.length > MAX_CHUNK) {
        if (current) { chunks.push(current); current = '' }
        let remaining = trimmed
        while (remaining.length > 0) {
          chunks.push(remaining.slice(0, MAX_CHUNK))
          remaining = remaining.slice(MAX_CHUNK)
        }
        return
      }
      if (current && (current.length + trimmed.length + 1) > MAX_CHUNK) {
        chunks.push(current)
        current = trimmed
      } else {
        current = current ? current + ' ' + trimmed : trimmed
      }
    })
    if (current) chunks.push(current)
    return chunks
  }

  const speakText = async (text) => {
    stopSpeaking()
    const chunks = splitForTTS(text)
    if (chunks.length === 0) return
    setIsSpeaking(true)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      try {
        const res = await callGeminiProxy(GENERATE_CONTENT_PATH, {
          contents: [{ parts: [{ text: chunk }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
          }
        }, undefined, 15000)

        if (!res.ok) continue

        const data = await safeJson(res)
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []
        const audioPart = parts.find(function (p) { return p.inlineData })
        if (!audioPart) continue

        const wavBlob = pcmBase64ToWavBlob(audioPart.inlineData.data)
        const url = URL.createObjectURL(wavBlob)

        await new Promise(function (resolve) {
          const audio = new Audio(url)
          currentAudioRef.current = audio
          audio.onended = function () { URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve() }
          audio.onerror = function () { URL.revokeObjectURL(url); if (currentAudioRef.current === audio) currentAudioRef.current = null; resolve() }
          audio.play()
        })
      } catch (e) { /* لو قطعة فشلت، نكمل اللي بعدها */ }
    }

    setIsSpeaking(false)
  }

  return (
    <div className="flex flex-col p-6 pb-0 relative" style={{ height: 'calc(100vh - 65px)' }} dir="rtl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المساعد الذكي</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تحدث أو اكتب لمساعدك الذكي "لابو"</p>
        </div>
        <button onClick={startNewConversation} aria-label="بدء محادثة جديدة"
          className="text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 flex-shrink-0"
          style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)', border: '1px solid var(--outline-variant)' }}>
          🆕 محادثة جديدة
        </button>
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
            {SUGGESTIONS.map(function (s, idx) {
              return (
                <button key={idx} onClick={function () { sendMessage(s) }}
                  className="text-xs px-3 py-2 rounded-full transition-all"
                  style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                  {s}
                </button>
              )
            })}
          </div>
        )}

        {messages.map(function (msg, i) {
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
                <ConfirmCard pending={msg.pending} onConfirm={function () { confirmPending(i, msg.pending) }} onCancel={function () { cancelPending(i) }} />
              </div>
            )
          }
          return (
            <div key={i} className={'flex flex-col ' + (msg.role === 'user' ? 'items-start' : 'items-end')}>
              <div className="max-w-lg px-4 py-3 rounded-2xl text-sm"
                style={{
                  background: msg.role === 'user' ? 'var(--primary-container)' : 'white',
                  color: msg.role === 'user' ? 'white' : 'var(--on-surface)',
                  border: msg.role === 'assistant' ? '1px solid var(--outline-variant)' : 'none',
                  lineHeight: '1.8'
                }}>
                {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {msg.images.map(function (src, idx) {
                      return <img key={idx} src={src} alt="صورة مرفقة" className="w-20 h-20 object-cover rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.4)' }} />
                    })}
                  </div>
                )}
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content}
              </div>

              <div className="flex items-center gap-2 mt-1 px-1">
                {msg.time && <span className="text-xs" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>{formatClock(msg.time)}</span>}
                {msg.role === 'assistant' && (
                  <button onClick={function () { copyMessage(i, msg.content) }} aria-label="نسخ الرد"
                    className="text-xs" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>
                    {copiedIndex === i ? '✅ تم النسخ' : '📋 نسخ'}
                  </button>
                )}
                {msg.role === 'assistant' && msg.content && (
                  <button onClick={function () { speakText(msg.content) }} aria-label="سماع الرد بصوت عالي"
                    className="text-xs" style={{ color: 'var(--on-surface-variant)', opacity: 0.7 }}>
                    🔊 اسمع
                  </button>
                )}
                {msg.retryText && (
                  <RetryButton retryText={msg.retryText} retryUnlockAt={msg.retryUnlockAt} onRetry={sendMessage} />
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
        <button onClick={function () { if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' }) }}
          aria-label="النزول لآخر رسالة"
          className="absolute left-1/2 -translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center shadow-md text-sm"
          style={{ bottom: '90px', background: 'white', border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
          ⬇
        </button>
      )}

      {pendingImages.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '10px' }}>
          {pendingImages.map(function (img) {
            return (
              <div key={img.id} className="relative">
                <img src={img.previewUrl} alt="صورة مرفقة" className="w-16 h-16 object-cover rounded-lg" style={{ border: '1px solid var(--outline-variant)' }} />
                <button onClick={function () { removePendingImage(img.id) }} aria-label="إزالة الصورة"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ background: '#dc2626' }}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="py-4 flex gap-3 items-end" style={{ borderTop: pendingImages.length > 0 ? 'none' : '1px solid var(--outline-variant)' }}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageFilesSelected} style={{ display: 'none' }} />

        <button onClick={handleImageButtonClick} aria-label="إرفاق صورة" disabled={pendingImages.length >= MAX_IMAGES}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: '#f1f3f4', border: '1px solid var(--outline-variant)', opacity: pendingImages.length >= MAX_IMAGES ? 0.5 : 1 }}>
          🖼️
        </button>

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
          onFocus={function (e) { e.target.style.border = '2px solid var(--primary-container)' }}
          onBlur={function (e) { e.target.style.border = '1px solid var(--outline-variant)' }}
        />

        <button onClick={function () { sendMessage(input) }} disabled={loading || (!input.trim() && pendingImages.length === 0)} aria-label="إرسال"
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
          style={{ background: 'var(--primary-container)', opacity: (loading || (!input.trim() && pendingImages.length === 0)) ? 0.5 : 1 }}>
          ➤
        </button>
      </div>
    </div>
  )
}

function RetryButton({ retryText, retryUnlockAt, onRetry }) {
  const [remaining, setRemaining] = useState(function () {
    return retryUnlockAt ? Math.max(0, Math.ceil((retryUnlockAt - Date.now()) / 1000)) : 0
  })

  useEffect(function () {
    if (!retryUnlockAt) return
    const interval = setInterval(function () {
      setRemaining(Math.max(0, Math.ceil((retryUnlockAt - Date.now()) / 1000)))
    }, 1000)
    return function () { clearInterval(interval) }
  }, [retryUnlockAt])

  const locked = remaining > 0

  return (
    <button onClick={function () { if (!locked) onRetry(retryText) }} disabled={locked} aria-label="إعادة المحاولة"
      className="text-xs font-medium" style={{ color: locked ? 'var(--on-surface-variant)' : 'var(--primary-container)', opacity: locked ? 0.7 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}>
      {locked ? `⏱ حاول تاني بعد ${remaining} ث` : '🔄 حاول تاني'}
    </button>
  )
}

function ConfirmCard(props) {
  const pending = props.pending
  const onConfirm = props.onConfirm
  const onCancel = props.onCancel
  const type = pending.type
  const status = pending.status
  const data = pending.data
  const error = pending.error

  return (
    <div className="max-w-lg w-full px-4 py-3 rounded-2xl text-sm bg-white"
      style={{ border: type === 'delete' ? '1.5px solid #dc2626' : '1.5px solid var(--primary-container)', lineHeight: '1.7' }}>

      {type === 'new_patient' && (
        <div>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>📋 تسجيل مريض جديد - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>الاسم:</strong> {data.name || '-'}</p>
            <p><strong>السن:</strong> {data.age || '-'} • <strong>النوع:</strong> {data.gender || '-'}</p>
            {data.phone && <p><strong>التليفون:</strong> {data.phone}</p>}
            {data.doctor && <p><strong>الدكتور:</strong> {data.doctor}</p>}
            <p><strong>التحاليل:</strong> {data.testNames && data.testNames.length ? data.testNames.join(', ') : 'لا يوجد'}</p>
          </div>
        </div>
      )}

      {type === 'test_result' && (
        <div>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>🧪 تسجيل نتيجة تحليل - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>المريض:</strong> {data.patientName || '-'}</p>
            <p><strong>التحليل:</strong> {data.testName || '-'}</p>
            <p><strong>النتيجة:</strong> {data.value || '-'}</p>
          </div>
        </div>
      )}

      {type === 'update_info' && (
        <div>
          <p className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>✏️ تعديل بيانات مريض - يحتاج تأكيدك</p>
          <div className="space-y-1 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            <p><strong>المريض:</strong> {data.patientName}</p>
            {Object.keys(data.updates || {}).map(function (key) {
              return <p key={key}><strong>{key}:</strong> {String(data.updates[key])}</p>
            })}
          </div>
        </div>
      )}

      {type === 'delete' && (
        <div>
          <p className="font-semibold mb-2" style={{ color: '#dc2626' }}>⚠️ حذف مريض نهائيًا - يحتاج تأكيدك</p>
          <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            هيتم حذف المريض <strong>{data.patientName}</strong> وكل تحاليله نهائيًا. مش هترجع.
          </p>
        </div>
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
