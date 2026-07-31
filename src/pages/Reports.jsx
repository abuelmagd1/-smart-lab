import { useEffect, useState, useRef, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import JsBarcode from 'jsbarcode'
import { getBarcodeCode } from '../components/BarcodeLabel'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const resultColor = {
  'طبيعي': { color: '#065f46', bg: '#d1fae5' },
  'مرتفع': { color: '#92400e', bg: '#fef3c7' },
  'منخفض': { color: '#1e40af', bg: '#dbeafe' },
  'تم التجميع': { color: '#374151', bg: '#f3f4f6' },
  'تم الاستلام': { color: '#1e40af', bg: '#dbeafe' },
  'قيد التحليل': { color: '#92400e', bg: '#fef3c7' },
  'معتمد': { color: '#065f46', bg: '#d1fae5' },
}

const periodFilters = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'الامس' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'older', label: 'قبل ذلك' },
]

const SECTION_LABELS = { RBC: 'RBC', Platelet: 'Platelet', WBC: 'WBC', WBC_DIFF: 'WBC - Diff' }

const DEFAULT_DESIGN = {
  // الهيدر
  report_header_color: '#1a2456',
  report_header_title: 'Laboratory Report',
  report_show_header_banner: true,
  report_letterhead_height: '90',
  // الباركود
  report_barcode_color: '#1a2456',
  report_show_barcode: true,
  // الجدول
  report_table_color: '#1a2456',
  report_table_text_color: '#333333',
  report_show_unit_column: true,
  report_show_range_column: true,
  report_zebra_stripes: true,
  // ألوان النتايج
  report_result_normal_color: '#000000',
  report_result_high_color: '#dc2626',
  report_result_low_color: '#2563eb',
  report_bold_abnormal: true,
  // الخط
  report_font_size: '11',
  report_font_family: 'Arial, sans-serif',
  // التذييل
  report_show_stamp_box: true,
  report_show_signature_line: true,
  report_footer_note: '',
  // الباقات والتاريخ
  report_show_history: true,
  report_show_trend_charts: true,
  // بيانات المريض - إظهار/إخفاء كل حقل لوحده
  report_show_patient_name: true,
  report_show_print_date: true,
  report_show_sex_age: true,
  report_show_visit_date: true,
  report_show_referred_by: true,
  // النصوص والتسميات الثابتة
  report_doctor_prefix: 'Dr.',
  report_stamp_text: 'ختم المعمل',
  report_barcode_label: 'PATIENT ID',
  report_panel_title: 'COMPLETE BLOOD COUNT',
  report_history_title: 'Patient History In Our Lab',
  report_show_bullets: true,
  // الأبعاد والحواف
  report_table_header_bg: '#f0f0f0',
  report_divider_color: '#cccccc',
  report_border_radius: '6',
  report_page_margin: '8',
}

// أعمدة أساسية شبه مؤكد إنها موجودة في lab_settings من قبل ميزة التصميم الموسّعة دي -
// بتستخدم كخط دفاع أخير في saveDesign لو المستخدم لسه معملوش حفظ قبل كده أصلاً
const ROUND1_DESIGN_KEYS = [
  'report_header_color', 'report_table_color', 'report_font_size', 'report_table_text_color',
  'report_result_normal_color', 'report_result_high_color', 'report_result_low_color', 'report_barcode_color',
]

const HISTORY_COLUMNS = [
  { key: 'WBCs - Total', label: 'WBCs' },
  { key: 'Neutrophil', label: 'Neut', abs: true },
  { key: 'Lymphocytes', label: 'Lymp', abs: true },
  { key: 'Monocytes', label: 'Mono', abs: true },
  { key: 'Eosinophil', label: 'Eosin', abs: true },
  { key: 'Basophil', label: 'Baso', abs: true },
  { key: 'RBCs Count', label: 'RBCs' },
  { key: 'Haemoglobin', label: 'Hgb' },
  { key: 'HCT', label: 'Hct' },
  { key: 'MCV', label: 'MCV' },
  { key: 'MCH', label: 'MCH' },
  { key: 'MCHC', label: 'MCHC' },
  { key: 'Platelet Count', label: 'PLT' },
]

// بيبني رابط واتساب مجاني (wa.me) - من غير أي API مدفوع
const buildWhatsAppLink = (phone, message) => {
  if (!phone) return null
  let clean = phone.replace(/[^\d]/g, '')
  if (clean.startsWith('0')) clean = '2' + clean // 01012345678 -> 201012345678
  else if (!clean.startsWith('2')) clean = '2' + clean
  return 'https://wa.me/' + clean + '?text=' + encodeURIComponent(message)
}

const getBucket = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7)
  const startOfMonth = new Date(startOfToday); startOfMonth.setDate(startOfMonth.getDate() - 30)
  if (date >= startOfToday) return 'today'
  if (date >= startOfYesterday) return 'yesterday'
  if (date >= startOfWeek) return 'week'
  if (date >= startOfMonth) return 'month'
  return 'older'
}

const splitTests = (patient) => {
  const singleTests = []
  const panelGroups = {}
  const allTests = patient.tests || []
  for (let i = 0; i < allTests.length; i++) {
    const t = allTests[i]
    if (t.panel_instance_id) {
      if (!panelGroups[t.panel_instance_id]) {
        panelGroups[t.panel_instance_id] = { panel_code: t.panel_code, items: [], comment: t.comment || '' }
      }
      panelGroups[t.panel_instance_id].items.push(t)
      if (t.comment) panelGroups[t.panel_instance_id].comment = t.comment
    } else {
      singleTests.push(t)
    }
  }
  Object.keys(panelGroups).forEach(key => {
    panelGroups[key].items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  })
  return { singleTests, panelGroups }
}

export default function Reports() {
  const location = useLocation()
  const showToast = useToast()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [historyRows, setHistoryRows] = useState([])
  const [settings, setSettings] = useState(null)
  // اسم "الطابعة المعتادة للتقارير" - بيتحفظ في المتصفح نفسه (localStorage)، ده مجرد تذكير مش اختيار فعلي
  // (المتصفح مايسمحش لأي موقع يختار طابعة تلقائيًا، ده قيد أمان من المتصفح نفسه مش حاجة نقدر نتخطاها)
  const [preferredPrinter, setPreferredPrinter] = useState(() => {
    try { return localStorage.getItem('reportPrinterName') || '' } catch { return '' }
  })
  const [editingPrinterName, setEditingPrinterName] = useState(false)
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [savingDesign, setSavingDesign] = useState(false)
  const [designSaved, setDesignSaved] = useState(false)
  const [sharingReport, setSharingReport] = useState(false)
  const [printing, setPrinting] = useState(false)
  const previewRef = useRef(null)
  const printFrameRef = useRef(null)
  const pdfContentRef = useRef(null)

  useEffect(() => { fetchPatients(); fetchSettings() }, [])

  useEffect(() => {
    const targetId = location.state?.autoSelectPatientId
    if (!loading && targetId && patients.length) {
      const match = patients.find(p => p.id === targetId)
      if (match) setSelectedPatient(match)
    }
  }, [loading, patients, location.state])

  useEffect(() => {
    if (selectedPatient) {
      fetchHistory(selectedPatient)
    } else {
      setHistoryRows([])
    }
  }, [selectedPatient])

  const fetchPatients = async () => {
    const { data, error } = await supabase
      .from('patients')
      .select('*, tests(*)')
      .order('created_at', { ascending: false })
    if (error) {
      showToast('حصل خطأ أثناء تحميل قائمة المرضى: ' + error.message, 'error', 5000)
    }
    setPatients(data || [])
    setLoading(false)
  }

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from('lab_settings').select('*').eq('user_id', user.id).maybeSingle()
    if (error) {
      showToast('حصل خطأ أثناء تحميل إعدادات المعمل: ' + error.message, 'error', 5000)
    }
    if (data) {
      setSettings(data)
      const merged = {}
      Object.keys(DEFAULT_DESIGN).forEach(key => {
        merged[key] = (data[key] !== undefined && data[key] !== null) ? data[key] : DEFAULT_DESIGN[key]
      })
      setDesign(merged)
    }
  }

  const fetchHistory = async (patient) => {
    if (!patient.phone) { setHistoryRows([]); return }

    const { data, error } = await supabase
      .from('patients')
      .select('id, created_at, tests(*)')
      .eq('phone', patient.phone)
      .neq('id', patient.id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      showToast('حصل خطأ أثناء تحميل تاريخ زيارات المريض: ' + error.message, 'error', 5000)
      setHistoryRows([])
      return
    }

    const rows = []
    const list = data || []
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      const cbcTests = (p.tests || []).filter(t => t.panel_code === 'CBC')
      if (cbcTests.length === 0) continue
      const byName = {}
      cbcTests.forEach(t => { byName[t.name] = t })
      rows.push({ date: p.created_at, byName })
    }
    setHistoryRows(rows)
  }

  const saveDesign = async () => {
    setSavingDesign(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSavingDesign(false)
      showToast('لازم تسجّل الدخول الأول عشان تحفظ التصميم', 'warning', 4000)
      return
    }

    let { error } = await supabase.from('lab_settings').upsert({ user_id: user.id, ...design }, { onConflict: 'user_id' })
    let partialSave = false

    // لو فيه أعمدة جديدة لسه مش موجودة في قاعدة البيانات، منسيبش الحفظ يفشل بالكامل -
    // بنحاول تاني ونحفظ بس الأعمدة اللي فعلاً موجودة (المعروفة من أول تحميل للإعدادات)
    if (error && (error.message?.includes('does not exist') || error.code === '42703' || error.code === 'PGRST204')) {
      const knownKeys = settings ? Object.keys(settings) : []
      const fallbackKeys = knownKeys.length > 0 ? knownKeys : ROUND1_DESIGN_KEYS
      const safeDesign = {}
      Object.keys(design).forEach(key => {
        if (fallbackKeys.includes(key)) safeDesign[key] = design[key]
      })
      const retry = await supabase.from('lab_settings').upsert({ user_id: user.id, ...safeDesign }, { onConflict: 'user_id' })
      error = retry.error
      if (!error) partialSave = true
    }

    setSavingDesign(false)
    if (error) {
      showToast('حصل خطأ أثناء حفظ التصميم: ' + error.message, 'error', 5000)
      return
    }
    setSettings(prev => ({ ...prev, ...design }))
    if (partialSave) {
      showToast('💾 اتحفظت الإعدادات المتاحة بس. عشان تحفظ باقي إعدادات التصميم الجديدة، لازم تشغّل كود الترحيل SQL المرفق في Supabase الأول', 'warning', 9000)
    } else {
      setDesignSaved(true)
      setTimeout(() => setDesignSaved(false), 2000)
    }
  }

  const filtered = patients
    .filter(p => periodFilter === 'all' || getBucket(p.created_at) === periodFilter)
    .filter(p => {
      if (!search.trim()) return true
      const q = search.trim()
      return p.name?.includes(q) || p.doctor?.includes(q) || p.phone?.includes(q)
    })

  const fs = parseInt(design.report_font_size) || 11

  const groupedTests = (patient) => {
    const groups = {}
    const singles = (patient.tests || []).filter(t => !t.panel_instance_id)
    singles.forEach(t => {
      const cat = t.category || 'General'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    })
    return groups
  }

  // بيحسب التكلفة الإجمالية للتحاليل: كل تحليل مفرد بسعره + كل باقة بسعرها مرة واحدة (مش لكل بند جواها)
  const computeTotalCost = (patient) => {
    const { singleTests, panelGroups } = splitTests(patient)
    let total = 0
    singleTests.forEach(t => { total += parseFloat(t.price) || 0 })
    Object.values(panelGroups).forEach(group => {
      const panelPrice = group.items && group.items[0] ? group.items[0].price : 0
      total += parseFloat(panelPrice) || 0
    })
    return total
  }

  const calcResultStatus = (value, range) => {
    const num = parseFloat(String(value).replace(',', '.'))
    if (isNaN(num) || !range) return null
    const matches = String(range).match(/-?\d+(\.\d+)?/g)
    if (!matches || matches.length < 2) return null
    const nums = matches.map(parseFloat).sort((a, b) => a - b)
    const low = nums[0]
    const high = nums[1]
    if (num > high) return 'مرتفع'
    if (num < low) return 'منخفض'
    return 'طبيعي'
  }

  const buildPanelHtml = (group, colors, fontSize) => {
    const hc = colors.hc
    const tc = colors.tc
    const ttc = colors.ttc
    const rHigh = colors.rHigh
    const rLow = colors.rLow
    const rNormal = colors.rNormal

    const bySection = {}
    group.items.forEach(item => {
      const sec = item.section || 'أخرى'
      if (!bySection[sec]) bySection[sec] = []
      bySection[sec].push(item)
    })

    const flagColor = (flag) => {
      if (flag === 'H') return rHigh
      if (flag === 'L') return rLow
      return rNormal
    }

    let sectionsHtml = ''
    const sectionKeys = Object.keys(bySection)
    for (let s = 0; s < sectionKeys.length; s++) {
      const section = sectionKeys[s]
      const items = bySection[section]
      const isDiff = section === 'WBC_DIFF'

      let rowsHtml = ''
      items.forEach(item => {
        if (isDiff) {
          const flagLabel = item.flag ? ('<b>' + item.flag + '</b> ') : ''
          rowsHtml += '<tr>' +
            '<td style="padding:3px 8px; font-size:' + fontSize + 'px; color:' + ttc + ';">' + item.name + '</td>' +
            '<td style="padding:3px 8px; font-size:' + fontSize + 'px; color:' + flagColor(item.flag) + '; font-weight:' + (item.flag ? 'bold' : 'normal') + ';">' + flagLabel + (item.relative_value || '---') + '</td>' +
            '<td style="padding:3px 8px; font-size:' + (fontSize - 1) + 'px; color:#666;">' + (item.normal_range || '') + '</td>' +
            '<td style="padding:3px 8px; font-size:' + fontSize + 'px; color:' + flagColor(item.flag) + '; font-weight:' + (item.flag ? 'bold' : 'normal') + ';">' + flagLabel + (item.absolute_value || '---') + '</td>' +
            '<td style="padding:3px 8px; font-size:' + (fontSize - 1) + 'px; color:#666;">' + (item.absolute_range || '') + '</td>' +
            '</tr>'
        } else {
          const flagLabel = item.flag ? ('<b>' + item.flag + '</b> ') : ''
          rowsHtml += '<tr>' +
            '<td colspan="2" style="padding:3px 8px; font-size:' + fontSize + 'px; color:' + ttc + ';"><strong>' + item.name + '</strong></td>' +
            '<td style="padding:3px 8px; font-size:' + fontSize + 'px; color:' + flagColor(item.flag) + '; font-weight:' + (item.flag ? 'bold' : 'normal') + ';">' + flagLabel + (item.value || '---') + '</td>' +
            '<td style="padding:3px 8px; font-size:' + (fontSize - 1) + 'px; color:#666;">' + (item.unit || '') + '</td>' +
            '<td style="padding:3px 8px; font-size:' + (fontSize - 1) + 'px; color:#666;">' + (item.normal_range || '') + '</td>' +
            '</tr>'
        }
      })

      let header
      if (isDiff) {
        header = '<tr style="background:' + tc + '12;">' +
          '<td style="padding:4px 8px; font-weight:bold; font-size:' + fontSize + 'px; color:' + tc + ';">' + SECTION_LABELS[section] + '</td>' +
          '<td colspan="2" style="padding:4px 8px; font-weight:bold; font-size:' + (fontSize - 1) + 'px; color:' + tc + '; text-align:center;">Relative %</td>' +
          '<td colspan="2" style="padding:4px 8px; font-weight:bold; font-size:' + (fontSize - 1) + 'px; color:' + tc + '; text-align:center;">Absolute</td>' +
          '</tr>'
      } else {
        header = '<tr style="background:' + tc + '12;">' +
          '<td colspan="5" style="padding:4px 8px; font-weight:bold; font-size:' + fontSize + 'px; color:' + tc + ';">■  ' + (SECTION_LABELS[section] || section) + '</td>' +
          '</tr>'
      }

      sectionsHtml += '<table style="width:100%; border-collapse:collapse; margin-bottom:4px;">' + header + rowsHtml + '</table>'
      if (s < sectionKeys.length - 1) {
        sectionsHtml += '<div style="border-bottom:1px dashed #ccc; margin:4px 0;"></div>'
      }
    }

    let commentHtml = ''
    if (group.comment) {
      commentHtml = '<div style="margin-top:8px; padding:6px 8px; background:#f8f9fa; border-right:3px solid ' + tc + '; font-size:' + (fontSize - 1) + 'px; color:#333;">' +
        '<strong style="color:' + tc + ';">Comment: </strong>' + group.comment +
        '</div>'
    }

    return '<div style="border:2px solid ' + hc + '; border-radius:6px; overflow:hidden; margin-bottom:10px;">' +
      '<div style="background:' + hc + '; color:white; text-align:center; padding:5px; font-size:' + (fontSize + 1) + 'px; font-weight:bold; letter-spacing:1px;">COMPLETE BLOOD COUNT</div>' +
      '<div style="padding:6px 10px;">' + sectionsHtml + commentHtml + '</div>' +
      '</div>'
  }

  const buildHistoryHtml = (colors, rows, fontSize) => {
    if (!rows.length) return ''
    const tc = colors.tc

    let headerCells = ''
    HISTORY_COLUMNS.forEach(c => {
      headerCells += '<th style="padding:3px 5px; font-size:9px; border:1px solid #ccc; background:#f0f0f0;">' + c.label + '</th>'
    })

    let rowsHtml = ''
    rows.forEach(row => {
      const dateStr = new Date(row.date).toLocaleDateString('en-GB')
      let cells = ''
      HISTORY_COLUMNS.forEach(c => {
        const item = row.byName[c.key]
        const val = c.abs ? (item ? item.absolute_value : '-') : (item ? item.value : '-')
        cells += '<td style="padding:3px 5px; font-size:9px; border:1px solid #ccc; text-align:center;">' + (val || '-') + '</td>'
      })
      rowsHtml += '<tr><td style="padding:3px 5px; font-size:9px; border:1px solid #ccc; font-weight:bold;">' + dateStr + '</td>' + cells + '</tr>'
    })

    return '<div style="margin-top:10px;">' +
      '<div style="font-size:' + fontSize + 'px; font-weight:bold; color:' + tc + '; margin-bottom:4px;">Patient History In Our Lab</div>' +
      '<table style="width:100%; border-collapse:collapse;">' +
      '<thead><tr><th style="padding:3px 5px; font-size:9px; border:1px solid #ccc; background:#f0f0f0;"></th>' + headerCells + '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      '</table></div>'
  }

  const savePreferredPrinter = (name) => {
    setPreferredPrinter(name)
    try { localStorage.setItem('reportPrinterName', name) } catch { /* ignore */ }
  }

  // بيبني نفس محتوى التقرير المستخدم بالظبط في زرار "طباعة التقرير" (من غير هيدر/فوتر صفحة الـ HTML الكاملة)
  // عشان نقدر نستخدمه في مكانين: نافذة الطباعة، وتحويله لصورة/PDF للمشاركة على واتساب
  const buildReportInnerHtml = (patient) => {
    const showBarcode = design.report_show_barcode !== false
    const barcodeCode = (showBarcode && patient.barcode_seq) ? getBarcodeCode(patient) : null

    let barcodeHtml = ''
    if (barcodeCode) {
      const canvas = document.createElement('canvas')
      try {
        JsBarcode(canvas, barcodeCode, {
          format: 'CODE128',
          width: 1.5,
          height: 35,
          displayValue: true,
          fontSize: 10,
          margin: 3,
          lineColor: design.report_barcode_color,
        })
        const dataUrl = canvas.toDataURL('image/png')
        barcodeHtml = `
          <div style="text-align:center; padding-right:10px; border-right:1px solid #eee; margin-right:10px; flex-shrink:0;">
            <div style="font-size:9px; font-weight:bold; color:${design.report_barcode_color}; margin-bottom:3px; letter-spacing:1px;">PATIENT ID</div>
            <img src="${dataUrl}" style="height:55px; display:block; margin:0 auto;" />
          </div>
        `
      } catch { }
    }

    const hc = design.report_header_color
    const tc = design.report_table_color
    const ttc = design.report_table_text_color
    const rNormal = design.report_result_normal_color
    const rHigh = design.report_result_high_color
    const rLow = design.report_result_low_color
    const colors = { hc, tc, ttc, rNormal, rHigh, rLow }

    const showHeaderBanner = design.report_show_header_banner !== false
    const headerTitle = design.report_header_title || 'Laboratory Report'
    const letterheadHeight = parseInt(design.report_letterhead_height) || 0
    const showUnit = design.report_show_unit_column !== false
    const showRange = design.report_show_range_column !== false
    const zebra = design.report_zebra_stripes !== false
    const boldAbnormal = design.report_bold_abnormal !== false
    const showStampBox = design.report_show_stamp_box !== false
    const showSignatureLine = design.report_show_signature_line !== false
    const footerNote = design.report_footer_note || ''
    const showHistory = design.report_show_history !== false

    const genderText = patient.gender === 'ذكر' ? 'Male' : 'Female'
    const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const visitDate = new Date(patient.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const groups = groupedTests(patient)
    const splitResult = splitTests(patient)
    const singleTests = splitResult.singleTests
    const panelGroups = splitResult.panelGroups
    const doctorName = settings?.doctor_name || 'اسم الطبيب'

    // بنبني أعمدة جدول التحاليل المفردة ديناميكيًا حسب إعدادات إظهار عمود الوحدة والمعدل الطبيعي
    const columns = [
      { label: 'Test Name', width: 35 },
      { label: 'Result', width: 20 },
      ...(showUnit ? [{ label: 'Unit', width: 15 }] : []),
      ...(showRange ? [{ label: 'Reference range', width: 30 }] : []),
    ]
    const totalWidth = columns.reduce((s, c) => s + c.width, 0)
    const colSpanCount = columns.length

    const tableHeaderHtml = columns.map(c => `
      <th style="padding:7px 10px; text-align:left; font-size:${fs}px; font-weight:bold; color:#333; border-bottom:2px solid ${tc}; border-top:1px solid #ddd; width:${((c.width / totalWidth) * 100).toFixed(1)}%;">${c.label}</th>
    `).join('')

    const tableRows = Object.entries(groups).map(([category, tests]) => `
      <tr style="background:${tc}18;">
        <td colspan="${colSpanCount}" style="padding:6px 10px; font-weight:bold; font-size:${fs + 1}px; color:${tc}; border-top:1px solid ${tc}40; border-bottom:1px solid ${tc}40;">■  ${category}</td>
      </tr>
      ${tests.map((t, ti) => {
        const num = parseFloat(String(t.value || '').replace(',', '.'))
        const matches = String(t.normal_range || '').match(/-?\d+(\.\d+)?/g)
        let status = t.status
        if (!isNaN(num) && matches && matches.length >= 2) {
          const sorted = matches.map(parseFloat).sort((a, b) => a - b)
          status = num > sorted[1] ? 'مرتفع' : num < sorted[0] ? 'منخفض' : 'طبيعي'
        }
        const color = status === 'مرتفع' ? rHigh : status === 'منخفض' ? rLow : rNormal
        const isAbnormal = status === 'مرتفع' || status === 'منخفض'
        const rowBg = zebra ? (ti % 2 === 0 ? 'white' : '#fafafa') : 'white'
        const cells = [
          `<td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">■  ${t.name}</td>`,
          `<td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${color}; font-weight:${boldAbnormal && isAbnormal ? 'bold' : 'normal'};">${t.value || '---'}</td>`,
          showUnit ? `<td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">${t.unit || ''}</td>` : '',
          showRange ? `<td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">${t.normal_range || '---'}</td>` : '',
        ].join('')
        return `<tr style="background:${rowBg};">${cells}</tr>`
      }).join('')}
    `).join('')

    let panelsHtml = ''
    Object.values(panelGroups).forEach(g => {
      panelsHtml += buildPanelHtml(g, colors, fs)
    })

    const historyHtml = (showHistory && Object.keys(panelGroups).length > 0) ? buildHistoryHtml(colors, historyRows, fs) : ''

    const singleTableHtml = singleTests.length > 0 ? `
      <table style="width:100%; border-collapse:collapse; margin-bottom:5px;">
        <thead>
          <tr style="background:#f0f0f0;">
            ${tableHeaderHtml}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>` : ''

    return `
      ${letterheadHeight > 0 ? `<div style="height:${letterheadHeight}px; margin-bottom:6mm;"></div>` : ''}
      <hr style="border:none; border-top:2px solid ${hc}; margin:10px 0;" />
      ${showHeaderBanner ? `
      <div style="background:${hc}; color:white; text-align:center; padding:6px; font-size:${fs + 2}px; font-weight:bold; margin-bottom:12px; border-radius:3px; letter-spacing:1px;">
        ${headerTitle}
      </div>` : ''}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 30px; flex:1;">
          ${[
            ['Patient Name :', patient.name],
            ['Print Date :', printDate],
            ['Sex / Age :', `${genderText} / ${patient.age || '-'} Years`],
            ['Visit Date :', visitDate],
            ['Referred By :', patient.doctor || '-'],
          ].map(([label, value]) => `
            <div style="display:flex; gap:5px; font-size:${fs}px;">
              <span style="font-weight:bold; color:${hc}; white-space:nowrap;">${label}</span>
              <span style="color:#333;">${value}</span>
            </div>
          `).join('')}
        </div>
        ${barcodeHtml}
      </div>
      <hr style="border:none; border-top:1px solid #ccc; margin:8px 0;" />

      ${panelsHtml}
      ${historyHtml}
      ${singleTableHtml}

      <div style="margin-top:25px; display:flex; justify-content:space-between; align-items:flex-end; padding-top:12px; border-top:2px solid ${hc};">
        ${showStampBox ? `
        <div style="width:100px; height:65px; border:2px dashed ${hc}; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:${fs}px; color:${hc}; font-weight:bold; direction:rtl;">
          ختم المعمل
        </div>` : '<div></div>'}
        <div style="text-align:center;">
          <div style="font-size:${fs + 1}px; font-weight:bold; color:${hc}; margin-bottom:25px;">Dr. ${doctorName}</div>
          ${showSignatureLine ? `<div style="width:160px; border-bottom:1px solid ${hc}; margin:0 auto;"></div>` : ''}
        </div>
      </div>
      ${footerNote ? `<div style="margin-top:10px; font-size:${fs - 1}px; color:#666; text-align:center;">${footerNote}</div>` : ''}
    `
  }

  const printReport = () => {
    if (!selectedPatient) return
    setPrinting(true)

    if (preferredPrinter) {
      showToast('🖨️ فاكرك اختار "' + preferredPrinter + '" من قائمة الطابعات في نافذة الطباعة', 'info', 6000)
    }

    const innerHtml = buildReportInnerHtml(selectedPatient)

    const html = `
      <html dir="ltr">
      <head>
        <title>Laboratory Report - ${selectedPatient.name}</title>
        <meta charset="UTF-8">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:${design.report_font_family || 'Arial, sans-serif'}; padding:20px 25px; background:white; font-size:${fs}px; color:#000; }
          @media print { @page { margin:8mm; size:A4; } }
        </style>
      </head>
      <body>
        ${innerHtml}
      </body>
      </html>
    `

    const frame = printFrameRef.current
    frame.srcdoc = html
    frame.onload = () => {
      setTimeout(() => {
        frame.contentWindow.print()
        setPrinting(false)
      }, 500)
    }
  }

  // بيولّد PDF من نفس محتوى التقرير اللي بيظهر عند الطباعة بالظبط، وبينسخ صورته للحافظة،
  // وينزّل ملف الـ PDF، وبعدين يفتح شات واتساب مع المريض مباشرة عشان يبعتله.
  const shareReportViaWhatsApp = async () => {
    if (!selectedPatient) return
    if (!selectedPatient.phone) {
      showToast('مفيش رقم موبايل مسجّل للمريض ده، مش هينفع نبعتله على واتساب', 'warning', 5000)
      return
    }
    setSharingReport(true)
    try {
      const innerHtml = buildReportInnerHtml(selectedPatient)
      const container = pdfContentRef.current
      container.innerHTML = innerHtml
      container.setAttribute('dir', 'ltr')
      container.style.fontFamily = design.report_font_family || 'Arial, sans-serif'
      container.style.fontSize = fs + 'px'
      container.style.color = '#000'

      // بستنى فريم واحد عشان الصور (الباركود) والتخطيط ياخدوا وقتهم يترسموا قبل التصوير
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const pdfBlob = pdf.output('blob')
      const fileName = 'تقرير-' + selectedPatient.name + '.pdf'

      // بننسخ صورة التقرير فعليًا لحافظة الجهاز (Clipboard) - ده زرار نسخ شغال بجد،
      // بعكس زرار النسخ في قائمة مشاركة النظام اللي بيبقى مش شغال غالبًا.
      // بعد النسخ تقدر تدوس Ctrl+V جوه شات واتساب مباشرة ويلزق الصورة
      let copiedToClipboard = false
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
          if (pngBlob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
            copiedToClipboard = true
          }
        }
      } catch { /* الحافظة مش متاحة أو المستخدم رفض الإذن - هنكمل عادي بتنزيل الـ PDF */ }

      // وبرضه بننزّل ملف الـ PDF على الجهاز (نسخة رسمية كاملة تصلح للطباعة أو الأرشفة)
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)

      if (copiedToClipboard) {
        showToast('📋 اتنسخت صورة التقرير — دوس Ctrl+V جوه شات واتساب اللي هيتفتح عشان تلزقها. واتحمّل ملف PDF كمان لو حبيت ترفقه', 'success', 9000)
      } else {
        showToast('📥 اتحمل ملف PDF بالتقرير، وهيتفتحلك شات واتساب مع المريض — ترفق الملف يدويًا من المرفقات', 'info', 8000)
      }

      const message = 'أهلاً ' + selectedPatient.name + '، ده تقرير نتيجة التحليل بتاعتك 🙏'
      const link = buildWhatsAppLink(selectedPatient.phone, message)
      setTimeout(() => window.open(link, '_blank'), 1200)
    } catch (err) {
      showToast('حصل خطأ أثناء تجهيز ملف الـ PDF: ' + err.message, 'error', 5000)
    } finally {
      if (pdfContentRef.current) pdfContentRef.current.innerHTML = ''
      setSharingReport(false)
    }
  }

  const PreviewPanel = ({ group, colors }) => {
    const hc = colors.hc
    const tc = colors.tc
    const ttc = colors.ttc
    const rHigh = colors.rHigh
    const rLow = colors.rLow
    const rNormal = colors.rNormal

    const bySection = {}
    group.items.forEach(item => {
      const sec = item.section || 'أخرى'
      if (!bySection[sec]) bySection[sec] = []
      bySection[sec].push(item)
    })

    const flagColor = (flag) => {
      if (flag === 'H') return rHigh
      if (flag === 'L') return rLow
      return rNormal
    }

    return (
      <div style={{ border: `2px solid ${hc}`, borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '5px', fontSize: `${fs + 1}px`, fontWeight: 'bold', letterSpacing: '1px' }}>
          COMPLETE BLOOD COUNT
        </div>
        <div style={{ padding: '6px 10px' }}>
          {Object.entries(bySection).map(([section, items]) => {
            const isDiff = section === 'WBC_DIFF'
            return (
              <div key={section}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
                  <tbody>
                    <tr style={{ background: `${tc}12` }}>
                      {isDiff ? (
                        <>
                          <td style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>{SECTION_LABELS[section]}</td>
                          <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Relative %</td>
                          <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Absolute</td>
                        </>
                      ) : (
                        <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>■  {SECTION_LABELS[section] || section}</td>
                      )}
                    </tr>
                    {items.map(item => isDiff ? (
                      <tr key={item.id}>
                        <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: ttc }}>{item.name}</td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                          {item.flag ? <b>{item.flag} </b> : null}{item.relative_value || '---'}
                        </td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.normal_range || ''}</td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                          {item.flag ? <b>{item.flag} </b> : null}{item.absolute_value || '---'}
                        </td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.absolute_range || ''}</td>
                      </tr>
                    ) : (
                      <tr key={item.id}>
                        <td colSpan={2} style={{ padding: '3px 8px', fontSize: `${fs}px`, color: ttc, fontWeight: 'bold' }}>{item.name}</td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                          {item.flag ? <b>{item.flag} </b> : null}{item.value || '---'}
                        </td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.unit || ''}</td>
                        <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.normal_range || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ borderBottom: '1px dashed #ccc', margin: '4px 0' }} />
              </div>
            )
          })}
          {group.comment && (
            <div style={{ marginTop: '8px', padding: '6px 8px', background: '#f8f9fa', borderRight: `3px solid ${tc}`, fontSize: `${fs - 1}px`, color: '#333' }}>
              <strong style={{ color: tc }}>Comment: </strong>{group.comment}
            </div>
          )}
        </div>
      </div>
    )
  }

  // رسم بياني بسيط (Sparkline) لاتجاه قيمة معينة عبر الزيارات السابقة - SVG خام من غير أي مكتبة خارجية، صفر تكلفة
  const TrendChart = ({ rows, metricKey, label, color }) => {
    const points = rows
      .map(r => ({ date: r.date, value: parseFloat(r.byName[metricKey]?.value) }))
      .filter(p => !isNaN(p.value))
      .reverse() // الصفوف جايه من الأحدث للأقدم، وعايزين نرسم من الأقدم للأحدث (يسار لليمين)

    if (points.length < 2) return null

    const width = 260
    const height = 64
    const padding = 8
    const values = points.map(p => p.value)
    const minV = Math.min(...values)
    const maxV = Math.max(...values)
    const range = maxV - minV || 1

    const coords = points.map((p, i) => {
      const x = padding + (i / (points.length - 1)) * (width - padding * 2)
      const y = height - padding - ((p.value - minV) / range) * (height - padding * 2)
      return { x, y, value: p.value }
    })

    const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ')
    const lineColor = color || '#1a2456'

    return (
      <div style={{ marginTop: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>
          📈 اتجاه {label} عبر آخر {points.length} زيارات
        </div>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" />
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="3" fill={lineColor} />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#6b7280' }}>
          <span>أقل: {minV}</span>
          <span>أعلى: {maxV}</span>
        </div>
      </div>
    )
  }

  const PreviewHistory = ({ colors, rows }) => {
    if (!rows.length) return null
    const tc = colors.tc
    return (
      <div style={{ marginTop: '10px' }}>
        <div style={{ fontSize: `${fs}px`, fontWeight: 'bold', color: tc, marginBottom: '4px' }}>Patient History In Our Lab</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', background: '#f0f0f0' }}></th>
              {HISTORY_COLUMNS.map(c => (
                <th key={c.key} style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', background: '#f0f0f0' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', fontWeight: 'bold' }}>
                  {new Date(row.date).toLocaleDateString('en-GB')}
                </td>
                {HISTORY_COLUMNS.map(c => {
                  const item = row.byName[c.key]
                  const val = c.abs ? (item ? item.absolute_value : '-') : (item ? item.value : '-')
                  return <td key={c.key} style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', textAlign: 'center' }}>{val || '-'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {design.report_show_trend_charts !== false && (
          <>
            <TrendChart rows={rows} metricKey="Haemoglobin" label="الهيموجلوبين (Hgb)" color="#dc2626" />
            <TrendChart rows={rows} metricKey="Platelet Count" label="الصفائح الدموية (PLT)" color="#1a2456" />
          </>
        )}
      </div>
    )
  }

  const PreviewReport = ({ patient }) => {
    if (!patient || !settings) return null

    const doctorName = settings.doctor_name || 'اسم الطبيب'
    const printDate = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const visitDate = new Date(patient.created_at).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const genderText = patient.gender === 'ذكر' ? 'Male' : patient.gender === 'أنثى' ? 'Female' : patient.gender || '-'
    const groups = groupedTests(patient)
    const splitResult = splitTests(patient)
    const singleTests = splitResult.singleTests
    const panelGroups = splitResult.panelGroups

    const hc = design.report_header_color
    const tc = design.report_table_color
    const ttc = design.report_table_text_color
    const rNormal = design.report_result_normal_color
    const rHigh = design.report_result_high_color
    const rLow = design.report_result_low_color
    const bc = design.report_barcode_color
    const colors = { hc, tc, ttc, rNormal, rHigh, rLow }

    const showBarcode = design.report_show_barcode !== false
    const showHeaderBanner = design.report_show_header_banner !== false
    const headerTitle = design.report_header_title || 'Laboratory Report'
    const letterheadHeight = parseInt(design.report_letterhead_height) || 0
    const showUnit = design.report_show_unit_column !== false
    const showRange = design.report_show_range_column !== false
    const zebra = design.report_zebra_stripes !== false
    const boldAbnormal = design.report_bold_abnormal !== false
    const showStampBox = design.report_show_stamp_box !== false
    const showSignatureLine = design.report_show_signature_line !== false
    const footerNote = design.report_footer_note || ''
    const showHistory = design.report_show_history !== false
    const fontFamily = design.report_font_family || 'Arial, sans-serif'

    const previewColumns = [
      'Test Name', 'Result',
      ...(showUnit ? ['Unit'] : []),
      ...(showRange ? ['Reference range'] : []),
    ]
    const colWidths = { 'Test Name': '35%', 'Result': '20%', 'Unit': '15%', 'Reference range': '30%' }

    return (
      <div style={{ fontFamily, fontSize: `${fs}px`, color: '#000', background: 'white', padding: '20px 25px' }}>

        {letterheadHeight > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '8mm', marginBottom: '6mm' }}>
            <div style={{ height: `${letterheadHeight}px` }}></div>
            <div style={{ height: `${letterheadHeight}px` }}></div>
            <div style={{ height: `${letterheadHeight}px` }}></div>
          </div>
        )}

        <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '10px 0' }} />

        {showHeaderBanner && (
          <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '6px', fontSize: `${fs + 2}px`, fontWeight: 'bold', marginBottom: '12px', borderRadius: '3px', letterSpacing: '1px' }}>
            {headerTitle}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 30px', flex: 1 }}>
            {[
              ['Patient Name :', patient.name],
              ['Print Date :', printDate],
              ['Sex / Age :', `${genderText} / ${patient.age || '-'} Years`],
              ['Visit Date :', visitDate],
              ['Referred By :', patient.doctor || '-'],
            ].map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', gap: '5px', fontSize: `${fs}px` }}>
                <span style={{ fontWeight: 'bold', color: hc, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ color: '#333' }}>{value}</span>
              </div>
            ))}
          </div>

          {showBarcode && patient.barcode_seq && (
            <div style={{ textAlign: 'center', paddingRight: '10px', borderRight: `1px solid #eee`, marginRight: '10px' }}>
              <div style={{ fontSize: '9px', fontWeight: 'bold', color: bc, marginBottom: '3px', letterSpacing: '1px' }}>PATIENT ID</div>
              <div style={{ background: '#f8f9ff', border: `1px solid ${bc}30`, borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', color: bc, letterSpacing: '2px' }}>
                  {getBarcodeCode(patient)}
                </div>
              </div>
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />

        {Object.values(panelGroups).map((group, i) => (
          <PreviewPanel key={i} group={group} colors={colors} />
        ))}

        {showHistory && Object.keys(panelGroups).length > 0 && <PreviewHistory colors={colors} rows={historyRows} />}

        {singleTests.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', marginBottom: '5px' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                {previewColumns.map((h, i) => (
                  <th key={i} style={{
                    padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`,
                    fontWeight: 'bold', color: '#333',
                    borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd',
                    width: colWidths[h]
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([category, tests]) => (
                <Fragment key={category}>
                  <tr style={{ background: `${tc}18` }}>
                    <td colSpan={previewColumns.length} style={{
                      padding: '6px 10px', fontWeight: 'bold', fontSize: `${fs + 1}px`,
                      color: tc, borderTop: `1px solid ${tc}40`, borderBottom: `1px solid ${tc}40`
                    }}>■  {category}</td>
                  </tr>
                  {tests.map((t, ti) => {
                    const computedStatus = calcResultStatus(t.value, t.normal_range) || t.status
                    const isAbnormal = computedStatus === 'مرتفع' || computedStatus === 'منخفض'
                    return (
                      <tr key={ti} style={{ background: zebra ? (ti % 2 === 0 ? 'white' : '#fafafa') : 'white' }}>
                        <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>■  {t.name}</td>
                        <td style={{
                          padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee',
                          color: computedStatus === 'مرتفع' ? rHigh : computedStatus === 'منخفض' ? rLow : rNormal,
                          fontWeight: (boldAbnormal && isAbnormal) ? 'bold' : 'normal'
                        }}>{t.value || '---'}</td>
                        {showUnit && <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.unit || ''}</td>}
                        {showRange && <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.normal_range || '---'}</td>}
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
          {showStampBox ? (
            <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, color: hc, fontWeight: 'bold', direction: 'rtl' }}>
              ختم المعمل
            </div>
          ) : <div />}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: `${fs + 1}px`, fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {doctorName}</div>
            {showSignatureLine && <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }}></div>}
          </div>
        </div>
        {footerNote && (
          <div style={{ marginTop: '10px', fontSize: `${fs - 1}px`, color: '#666', textAlign: 'center' }}>{footerNote}</div>
        )}
      </div>
    )
  }

  const DesignToggle = ({ label, dkey }) => {
    const on = design[dkey] !== false
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{label}</label>
        <button type="button" onClick={() => setDesign(prev => ({ ...prev, [dkey]: !on }))}
          aria-pressed={on}
          style={{
            width: '34px', height: '18px', borderRadius: '9px', position: 'relative',
            background: on ? 'var(--primary-container)' : '#d1d5db', border: 'none', cursor: 'pointer', flexShrink: 0,
          }}>
          <span style={{
            position: 'absolute', top: '2px', [on ? 'right' : 'left']: '2px',
            width: '14px', height: '14px', borderRadius: '50%', background: 'white',
          }} />
        </button>
      </div>
    )
  }

  const DesignSection = ({ title, children }) => (
    <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--outline-variant)' }}>
      <h4 className="text-xs font-bold mb-2" style={{ color: 'var(--on-surface)' }}>{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  )

  return (
    <div className="p-6" dir="rtl">

      <iframe ref={printFrameRef} style={{ display: 'none' }} title="print-frame" />
      <div ref={pdfContentRef} dir="ltr" style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', background: 'white', padding: '20px 25px', boxSizing: 'border-box' }} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>التقارير</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>عرض وطباعة تقارير المرضى</p>
      </div>

      {!selectedPatient ? (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {periodFilters.map(f => (
              <button key={f.key} onClick={() => setPeriodFilter(f.key)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: periodFilter === f.key ? 'var(--primary-container)' : '#f1f3f4',
                  color: periodFilter === f.key ? 'white' : 'var(--on-surface-variant)'
                }}>
                {f.label}
              </button>
            ))}
            <span className="text-xs self-center mr-1" style={{ color: 'var(--on-surface-variant)' }}>
              {filtered.length} نتيجة
            </span>
          </div>

          <div className="relative mb-4">
            <input type="text" placeholder="ابحث بالاسم أو الدكتور أو رقم الهاتف..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg outline-none text-right"
              style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', paddingLeft: search ? '36px' : '16px' }}
              onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
              onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="مسح البحث"
                className="absolute top-1/2 flex items-center justify-center"
                style={{ left: '8px', transform: 'translateY(-50%)', width: '22px', height: '22px', borderRadius: '50%', background: '#f1f3f4', color: 'var(--on-surface-variant)', fontSize: '13px', border: 'none', cursor: 'pointer' }}>
                ✕
              </button>
            )}
          </div>

          {loading ? (
            <LoadingSpinner label="جاري تحميل قائمة المرضى..." fullHeight />
          ) : filtered.length === 0 ? (
            <div>
              <EmptyState
                icon="🔍"
                title="لا يوجد مرضى مطابقين"
                subtitle={search ? 'جرّب كلمة بحث مختلفة أو غيّر فلتر الفترة الزمنية' : 'لسه مفيش مرضى مسجلين في الفترة دي'}
              />
              {(search || periodFilter !== 'all') && (
                <div className="text-center -mt-2">
                  <button onClick={() => { setSearch(''); setPeriodFilter('all') }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                    ↺ إلغاء البحث والفلاتر
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(patient => (
                <div key={patient.id} className="bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>{patient.name}</h2>
                      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                        {patient.age} سنة • {patient.gender} • {patient.doctor}
                      </p>
                    </div>
                    <button onClick={() => setSelectedPatient(patient)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--primary-container)' }}>
                      👁️ عرض التقرير
                    </button>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#f1f3f4' }}>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التحليل</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>النتيجة</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patient.tests?.map((t, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                          <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{t.name}</td>
                          <td className="p-3 text-sm" style={{ color: 'var(--on-surface)' }}>{t.value || t.relative_value || '-'}</td>
                          <td className="p-3">
                            <span className="text-xs font-medium px-2 py-1 rounded-full"
                              style={{ background: resultColor[t.status]?.bg || '#fef3c7', color: resultColor[t.status]?.color || '#92400e' }}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">

          <div className="bg-white rounded-xl p-4 w-full lg:w-[260px] lg:flex-shrink-0 lg:sticky lg:top-5 order-2 lg:order-1" style={{ border: '1px solid var(--outline-variant)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--on-surface)' }}>🎨 التصميم التقرير</h3>
              <button onClick={() => setDesign(DEFAULT_DESIGN)}
                className="text-xs"
                style={{ color: 'var(--primary-container)' }}
                title="رجّع الألوان وحجم الخط للوضع الافتراضي">
                ↺ افتراضي
              </button>
            </div>

            <div className="space-y-2">
              <DesignToggle label="إظهار شريط العنوان" dkey="report_show_header_banner" />
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>نص العنوان</label>
                <input type="text" value={design.report_header_title}
                  onChange={e => setDesign(prev => ({ ...prev, report_header_title: e.target.value }))}
                  className="w-full px-2 py-1 rounded-lg outline-none text-right text-xs"
                  style={{ border: '1px solid var(--outline-variant)' }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>لون الهيدر</label>
                <input type="color" value={design.report_header_color}
                  onChange={e => setDesign(prev => ({ ...prev, report_header_color: e.target.value }))}
                  style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>مسافة الشعار فوق التقرير: {design.report_letterhead_height}px</label>
                <input type="range" min="0" max="180" step="5" value={design.report_letterhead_height}
                  onChange={e => setDesign(prev => ({ ...prev, report_letterhead_height: e.target.value }))}
                  className="w-full" />
              </div>
            </div>

            <DesignSection title="🏷️ الباركود">
              <DesignToggle label="إظهار الباركود" dkey="report_show_barcode" />
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>لون الباركود والـ ID</label>
                <input type="color" value={design.report_barcode_color}
                  onChange={e => setDesign(prev => ({ ...prev, report_barcode_color: e.target.value }))}
                  style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }} />
              </div>
            </DesignSection>

            <DesignSection title="📋 الجدول">
              {[
                { label: 'لون الجدول', key: 'report_table_color' },
                { label: 'لون نص الجدول', key: 'report_table_text_color' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.label}</label>
                  <input type="color" value={design[item.key]}
                    onChange={e => setDesign(prev => ({ ...prev, [item.key]: e.target.value }))}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                </div>
              ))}
              <DesignToggle label="إظهار عمود الوحدة" dkey="report_show_unit_column" />
              <DesignToggle label="إظهار عمود المعدل الطبيعي" dkey="report_show_range_column" />
              <DesignToggle label="تلوين الصفوف بالتبادل" dkey="report_zebra_stripes" />
            </DesignSection>

            <DesignSection title="🎯 ألوان النتائج">
              {[
                { label: 'لون النتيجة الطبيعية', key: 'report_result_normal_color' },
                { label: 'لون النتيجة المرتفعة', key: 'report_result_high_color' },
                { label: 'لون النتيجة المنخفضة', key: 'report_result_low_color' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.label}</label>
                  <input type="color" value={design[item.key]}
                    onChange={e => setDesign(prev => ({ ...prev, [item.key]: e.target.value }))}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                </div>
              ))}
              <DesignToggle label="تخانة (Bold) النتائج غير الطبيعية" dkey="report_bold_abnormal" />
            </DesignSection>

            <DesignSection title="🔤 الخط">
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>حجم الخط: {design.report_font_size}px</label>
                <input type="range" min="9" max="14" value={design.report_font_size}
                  onChange={e => setDesign(prev => ({ ...prev, report_font_size: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>نوع الخط</label>
                <select value={design.report_font_family}
                  onChange={e => setDesign(prev => ({ ...prev, report_font_family: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded-lg outline-none text-xs"
                  style={{ border: '1px solid var(--outline-variant)', background: 'white' }}>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Tahoma, sans-serif">Tahoma</option>
                  <option value="'Segoe UI', sans-serif">Segoe UI</option>
                  <option value="Calibri, sans-serif">Calibri</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                </select>
              </div>
            </DesignSection>

            <DesignSection title="✍️ التذييل">
              <DesignToggle label="إظهار مكان ختم المعمل" dkey="report_show_stamp_box" />
              <DesignToggle label="إظهار خط توقيع الدكتور" dkey="report_show_signature_line" />
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>ملاحظة أسفل التقرير (اختياري)</label>
                <textarea rows={2} value={design.report_footer_note}
                  onChange={e => setDesign(prev => ({ ...prev, report_footer_note: e.target.value }))}
                  placeholder="مثلاً: النتائج للاستخدام الطبي فقط"
                  className="w-full px-2 py-1 rounded-lg outline-none text-right text-xs resize-none"
                  style={{ border: '1px solid var(--outline-variant)' }} />
              </div>
            </DesignSection>

            <DesignSection title="🧾 الباقات والتاريخ">
              <DesignToggle label="إظهار سجل الزيارات السابقة" dkey="report_show_history" />
              <DesignToggle label="إظهار الرسم البياني للاتجاه" dkey="report_show_trend_charts" />
            </DesignSection>

            <button onClick={saveDesign} disabled={savingDesign}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-4"
              style={{ background: designSaved ? '#10b981' : 'var(--primary-container)', opacity: savingDesign ? 0.7 : 1 }}>
              {designSaved ? '✅ تم الحفظ' : savingDesign ? 'جاري...' : '💾 حفظ التصميم'}
            </button>

            <div className="mt-4" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem' }}>
              <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>🖨️ الطابعة المعتادة (تذكير بس)</label>
              {editingPrinterName ? (
                <input type="text" autoFocus defaultValue={preferredPrinter}
                  placeholder="مثلاً: HP LaserJet مكتب الاستقبال"
                  onBlur={e => { savePreferredPrinter(e.target.value.trim()); setEditingPrinterName(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                  className="w-full px-2 py-1.5 rounded-lg outline-none text-right text-xs"
                  style={{ border: '1.5px solid var(--primary-container)' }} />
              ) : (
                <button onClick={() => setEditingPrinterName(true)}
                  className="w-full px-2 py-1.5 rounded-lg text-right text-xs"
                  style={{ border: '1px solid var(--outline-variant)', color: preferredPrinter ? 'var(--on-surface)' : 'var(--on-surface-variant)' }}>
                  {preferredPrinter || 'اضغط لتحديد اسم الطابعة...'}
                </button>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)', opacity: 0.8 }}>
                المتصفح مش بيسمح باختيار طابعة تلقائيًا، فده بس تذكير هيظهرلك وقت الطباعة.
              </p>
            </div>

            <button onClick={printReport} disabled={printing}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-2 flex items-center justify-center gap-2"
              style={{ background: '#1a2456', opacity: printing ? 0.7 : 1 }}
              title="يفتح نافذة طباعة المتصفح على نفس الطابعة المتصلة بالجهاز">
              {printing && (
                <span className="animate-spin" style={{
                  width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: 'white', borderRadius: '50%', display: 'inline-block',
                }} />
              )}
              {printing ? 'جاري التجهيز...' : '🖨️ طباعة التقرير'}
            </button>

            <button onClick={shareReportViaWhatsApp} disabled={sharingReport}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-2 flex items-center justify-center gap-2"
              style={{ background: '#25D366', opacity: sharingReport ? 0.7 : 1 }}
              title="يجهز نسخة PDF من التقرير، ينسخها للحافظة، وينزّلها، ويفتح شات واتساب مع المريض">
              {sharingReport && (
                <span className="animate-spin" style={{
                  width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: 'white', borderRadius: '50%', display: 'inline-block',
                }} />
              )}
              {sharingReport ? 'جاري تجهيز الـ PDF...' : '📤 مشاركة عبر واتساب (PDF)'}
            </button>
            {!selectedPatient.phone && (
              <p className="text-xs mt-1 text-center" style={{ color: '#dc2626' }}>
                ⚠️ مفيش رقم موبايل مسجّل لـ{selectedPatient.name}
              </p>
            )}

            <button onClick={() => setSelectedPatient(null)}
              className="w-full py-2 rounded-lg text-xs font-medium mt-2"
              style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
              ← رجوع
            </button>
          </div>

          {/* صندوق التكلفة - للدكتور فقط، لا يظهر في الطباعة أبدًا */}
          <div className="bg-white rounded-xl p-4 w-full lg:w-[200px] lg:flex-shrink-0 lg:sticky lg:top-5 order-3 lg:order-2" style={{ border: '1px solid var(--outline-variant)' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--on-surface)' }}>💰 التكلفة الإجمالية</h3>
            <div className="text-center py-3 rounded-lg" style={{ background: '#f0fdf4' }}>
              <span className="text-2xl font-bold" style={{ color: '#065f46' }}>
                {computeTotalCost(selectedPatient).toLocaleString('ar-EG')}
              </span>
              <span className="text-sm mr-1" style={{ color: '#065f46' }}>جنيه</span>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--on-surface-variant)' }}>
              هذا المبلغ للاستخدام الداخلي فقط ولا يظهر عند طباعة التقرير.
            </p>
          </div>

          <div className="w-full lg:flex-1 order-1 lg:order-3 bg-white rounded-xl overflow-hidden overflow-x-auto" style={{ border: '1px solid var(--outline-variant)' }}>
            {settings ? (
              <div ref={previewRef}>
                <PreviewReport patient={selectedPatient} />
              </div>
            ) : (
              <LoadingSpinner label="جاري تجهيز معاينة التقرير..." fullHeight />
            )}
          </div>

        </div>
      )}
    </div>
  )
}