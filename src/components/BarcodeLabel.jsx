import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

// بيحول رقم المريض التسلسلي لكود ثابت الطول (8 أرقام) عشان يبقى متناسق على كل الملصقات
export const getBarcodeCode = (patient) => String(patient?.barcode_seq || 0).padStart(8, '0')

export default function BarcodeLabel({ patient, onClose }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (canvasRef.current && patient) {
      JsBarcode(canvasRef.current, getBarcodeCode(patient), {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 16,
        margin: 10,
      })
    }
  }, [patient])

const printLabel = () => {
  if (!canvasRef.current || !patient) return
  const dataUrl = canvasRef.current.toDataURL('image/png')
  const win = window.open('', '_blank')
  win.document.write(`
    <html dir="rtl">
    <head>
      <title>باركود العينة - ${patient.name}</title>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 80mm; height: 40mm; overflow: hidden; }
        body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; }
        .label { text-align: center; border: 1px solid #000; padding: 4px 8px; width: 78mm; height: 38mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .label img { width: 70mm; height: 20mm; object-fit: contain; }
        .label p { margin: 2px 0; font-size: 11px; line-height: 1.3; }
        @media print {
          @page { margin: 0; size: 80mm 40mm; }
          html, body { width: 80mm; height: 40mm; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <p><strong>${patient.name}</strong></p>
        <p>${patient.age} سنة • ${patient.gender}</p>
        <img src="${dataUrl}" />
      </div>
    </body>
    </html>
  `)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

  if (!patient) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }} dir="rtl">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
        <h2 className="font-bold text-lg mb-1" style={{ color: 'var(--on-surface)' }}>باركود العينة</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>{patient.name}</p>
        <div className="flex justify-center mb-4 overflow-x-auto">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إغلاق
          </button>
          <button onClick={printLabel}
            className="flex-1 py-2 rounded-lg text-sm text-white font-medium"
            style={{ background: 'var(--primary-container)' }}>
            🖨️ طباعة
          </button>
        </div>
      </div>
    </div>
  )
}
