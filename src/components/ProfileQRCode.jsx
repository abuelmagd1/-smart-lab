import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// بيبني رابط سجل المريض الثابت من كود البوابة بتاعه
export const getRecordPortalLink = (profile) =>
  profile?.portal_code ? window.location.origin + '/my-record/' + profile.portal_code : null

export default function ProfileQRCode({ profile, onClose }) {
  const canvasRef = useRef(null)
  const printFrameRef = useRef(null)
  const [error, setError] = useState(false)
  const link = getRecordPortalLink(profile)

  useEffect(() => {
    if (canvasRef.current && link) {
      QRCode.toCanvas(canvasRef.current, link, { width: 220, margin: 1, color: { dark: '#1a2456', light: '#ffffff' } })
        .catch(() => setError(true))
    }
  }, [link])

  // بنستخدم إطار مخفي في نفس الصفحة بدل ما نفتح تاب جديد (window.open) - فتح تاب جديد
  // للطباعة كان بيسبب تعليق التطبيق لما ترجع له بعد الطباعة في بعض المتصفحات، والطريقة
  // دي (زي المستخدمة في صفحة التقارير) أضمن ومش بتفتح أي نافذة/تاب خالص
  const printQRCode = () => {
    if (!canvasRef.current || !profile) return
    const dataUrl = canvasRef.current.toDataURL('image/png')

    const html = `
      <html dir="rtl">
      <head>
        <title>سجل المريض - ${profile.name}</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 80mm; height: 100mm; overflow: hidden; }
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; }
          .card { text-align: center; border: 1px solid #000; border-radius: 6px; padding: 8px 10px; width: 78mm; height: 98mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
          .card img { width: 45mm; height: 45mm; }
          .card p { margin: 2px 0; line-height: 1.3; }
          @media print {
            @page { margin: 0; size: 80mm 100mm; }
            html, body { width: 80mm; height: 100mm; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <p style="font-size:13px; font-weight:bold;">${profile.name}</p>
          <img src="${dataUrl}" />
          <p style="font-size:11px;">امسح الكود بكاميرا موبايلك</p>
          <p style="font-size:11px;">عشان تشوف سجلك الطبي ونتايجك</p>
        </div>
      </body>
      </html>
    `

    const frame = printFrameRef.current
    frame.srcdoc = html
    frame.onload = () => {
      setTimeout(() => { frame.contentWindow.print() }, 300)
    }
  }

  if (!profile) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      dir="rtl"
    >
      <iframe ref={printFrameRef} style={{ display: 'none' }} title="qr-print-frame" />
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm text-center"
        style={{ zIndex: 10000, position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--on-surface)' }}>كود سجل المريض</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>{profile.name} • رابط ثابت لكل الزيارات</p>

        {!link ? (
          <p className="text-sm py-6" style={{ color: '#dc2626' }}>مفيش كود بوابة لملف المريض ده</p>
        ) : error ? (
          <p className="text-sm py-6" style={{ color: '#dc2626' }}>حصل خطأ أثناء توليد الكود</p>
        ) : (
          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إغلاق
          </button>
          <button onClick={printQRCode} disabled={!link || error}
            className="flex-1 py-2 rounded-lg text-sm text-white font-medium"
            style={{ background: 'var(--primary-container)', opacity: (!link || error) ? 0.6 : 1 }}>
            🖨️ طباعة
          </button>
        </div>
      </div>
    </div>
  )
}