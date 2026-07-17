import { useEffect, useState, useRef, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import JsBarcode from 'jsbarcode'
import { getBarcodeCode } from '../components/BarcodeLabel'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

const resultColor = {
  'Ø·Ø¨ÙŠØ¹ÙŠ': { color: '#065f46', bg: '#d1fae5' },
  'Ù…Ø±ØªÙØ¹': { color: '#92400e', bg: '#fef3c7' },
  'Ù…Ù†Ø®ÙØ¶': { color: '#1e40af', bg: '#dbeafe' },
  'ØªÙ… Ø§Ù„ØªØ¬Ù…ÙŠØ¹': { color: '#374151', bg: '#f3f4f6' },
  'ØªÙ… Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…': { color: '#1e40af', bg: '#dbeafe' },
  'Ù‚ÙŠØ¯ Ø§Ù„ØªØ­Ù„ÙŠÙ„': { color: '#92400e', bg: '#fef3c7' },
  'Ù…Ø¹ØªÙ…Ø¯': { color: '#065f46', bg: '#d1fae5' },
}

const periodFilters = [
  { key: 'all', label: 'Ø§Ù„ÙƒÙ„' },
  { key: 'today', label: 'Ø§Ù„ÙŠÙˆÙ…' },
  { key: 'yesterday', label: 'Ø§Ù„Ø§Ù…Ø³' },
  { key: 'week', label: 'Ø¢Ø®Ø± Ø£Ø³Ø¨ÙˆØ¹' },
  { key: 'month', label: 'Ø¢Ø®Ø± Ø´Ù‡Ø±' },
  { key: 'older', label: 'Ù‚Ø¨Ù„ Ø°Ù„Ùƒ' },
]

const SECTION_LABELS = { RBC: 'RBC', Platelet: 'Platelet', WBC: 'WBC', WBC_DIFF: 'WBC - Diff' }

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
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [historyRows, setHistoryRows] = useState([])
  const [settings, setSettings] = useState(null)
  const [design, setDesign] = useState({
    report_header_color: '#1a2456',
    report_table_color: '#1a2456',
    report_font_size: '11',
    report_table_text_color: '#333333',
    report_result_normal_color: '#000000',
    report_result_high_color: '#dc2626',
    report_result_low_color: '#2563eb',
    report_barcode_color: '#1a2456',
  })
  const [savingDesign, setSavingDesign] = useState(false)
  const [designSaved, setDesignSaved] = useState(false)
  const previewRef = useRef(null)
  const printFrameRef = useRef(null)

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
    const { data } = await supabase
      .from('patients')
      .select('*, tests(*)')
      .order('created_at', { ascending: false })
    setPatients(data || [])
    setLoading(false)
  }

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('lab_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setSettings(data)
      setDesign({
        report_header_color: data.report_header_color || '#1a2456',
        report_table_color: data.report_table_color || '#1a2456',
        report_font_size: data.report_font_size || '11',
        report_table_text_color: data.report_table_text_color || '#333333',
        report_result_normal_color: data.report_result_normal_color || '#000000',
        report_result_high_color: data.report_result_high_color || '#dc2626',
        report_result_low_color: data.report_result_low_color || '#2563eb',
        report_barcode_color: data.report_barcode_color || '#1a2456',
      })
    }
  }

  const fetchHistory = async (patient) => {
    if (!patient.phone) { setHistoryRows([]); return }

    const { data } = await supabase
      .from('patients')
      .select('id, created_at, tests(*)')
      .eq('phone', patient.phone)
      .neq('id', patient.id)
      .order('created_at', { ascending: false })
      .limit(5)

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
    await supabase.from('lab_settings').update(design).eq('user_id', user.id)
    setSettings(prev => ({ ...prev, ...design }))
    setSavingDesign(false)
    setDesignSaved(true)
    setTimeout(() => setDesignSaved(false), 2000)
  }

  const filtered = patients
    .filter(p => periodFilter === 'all' || getBucket(p.created_at) === periodFilter)
    .filter(p => p.name?.includes(search))

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

  // Ø¨ÙŠØ­Ø³Ø¨ Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ© Ù„Ù„ØªØ­Ø§Ù„ÙŠÙ„: ÙƒÙ„ ØªØ­Ù„ÙŠÙ„ Ù…ÙØ±Ø¯ Ø¨Ø³Ø¹Ø±Ù‡ + ÙƒÙ„ Ø¨Ø§Ù‚Ø© Ø¨Ø³Ø¹Ø±Ù‡Ø§ Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© (Ù…Ø´ Ù„ÙƒÙ„ Ø¨Ù†Ø¯ Ø¬ÙˆØ§Ù‡Ø§)
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
    if (num > high) return 'Ù…Ø±ØªÙØ¹'
    if (num < low) return 'Ù…Ù†Ø®ÙØ¶'
    return 'Ø·Ø¨ÙŠØ¹ÙŠ'
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
      const sec = item.section || 'Ø£Ø®Ø±Ù‰'
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
          '<td colspan="5" style="padding:4px 8px; font-weight:bold; font-size:' + fontSize + 'px; color:' + tc + ';">â–  ' + (SECTION_LABELS[section] || section) + '</td>' +
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

  const printReport = () => {
    if (!selectedPatient) return

    const barcodeCode = selectedPatient.barcode_seq
      ? getBarcodeCode(selectedPatient)
      : null

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

    const genderText = selectedPatient.gender === 'Ø°ÙƒØ±' ? 'Male' : 'Female'
    const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const visitDate = new Date(selectedPatient.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const groups = groupedTests(selectedPatient)
    const splitResult = splitTests(selectedPatient)
    const singleTests = splitResult.singleTests
    const panelGroups = splitResult.panelGroups
    const doctorName = settings?.doctor_name || 'Ø§Ø³Ù… Ø§Ù„Ø·Ø¨ÙŠØ¨'

    const tableRows = Object.entries(groups).map(([category, tests]) => `
      <tr style="background:${tc}18;">
        <td colspan="4" style="padding:6px 10px; font-weight:bold; font-size:${fs + 1}px; color:${tc}; border-top:1px solid ${tc}40; border-bottom:1px solid ${tc}40;">â–  ${category}</td>
      </tr>
      ${tests.map((t, ti) => {
        const num = parseFloat(String(t.value || '').replace(',', '.'))
        const matches = String(t.normal_range || '').match(/-?\d+(\.\d+)?/g)
        let status = t.status
        if (!isNaN(num) && matches && matches.length >= 2) {
          const sorted = matches.map(parseFloat).sort((a, b) => a - b)
          status = num > sorted[1] ? 'Ù…Ø±ØªÙØ¹' : num < sorted[0] ? 'Ù…Ù†Ø®ÙØ¶' : 'Ø·Ø¨ÙŠØ¹ÙŠ'
        }
        const color = status === 'Ù…Ø±ØªÙØ¹' ? rHigh : status === 'Ù…Ù†Ø®ÙØ¶' ? rLow : rNormal
        return `
          <tr style="background:${ti % 2 === 0 ? 'white' : '#fafafa'};">
            <td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">â–  ${t.name}</td>
            <td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${color}; font-weight:${status === 'Ù…Ø±ØªÙØ¹' || status === 'Ù…Ù†Ø®ÙØ¶' ? 'bold' : 'normal'};">${t.value || '---'}</td>
            <td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">${t.unit || ''}</td>
            <td style="padding:6px 10px; font-size:${fs}px; border-bottom:1px solid #eee; color:${ttc};">${t.normal_range || '---'}</td>
          </tr>
        `
      }).join('')}
    `).join('')

    let panelsHtml = ''
    Object.values(panelGroups).forEach(g => {
      panelsHtml += buildPanelHtml(g, colors, fs)
    })

    const historyHtml = Object.keys(panelGroups).length > 0 ? buildHistoryHtml(colors, historyRows, fs) : ''

    const singleTableHtml = singleTests.length > 0 ? `
      <table style="width:100%; border-collapse:collapse; margin-bottom:5px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="padding:7px 10px; text-align:left; font-size:${fs}px; font-weight:bold; color:#333; border-bottom:2px solid ${tc}; border-top:1px solid #ddd; width:35%;">Test Name</th>
            <th style="padding:7px 10px; text-align:left; font-size:${fs}px; font-weight:bold; color:#333; border-bottom:2px solid ${tc}; border-top:1px solid #ddd; width:20%;">Result</th>
            <th style="padding:7px 10px; text-align:left; font-size:${fs}px; font-weight:bold; color:#333; border-bottom:2px solid ${tc}; border-top:1px solid #ddd; width:15%;">Unit</th>
            <th style="padding:7px 10px; text-align:left; font-size:${fs}px; font-weight:bold; color:#333; border-bottom:2px solid ${tc}; border-top:1px solid #ddd; width:30%;">Reference range</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>` : ''

    const html = `
      <html dir="ltr">
      <head>
        <title>Laboratory Report - ${selectedPatient.name}</title>
        <meta charset="UTF-8">
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:Arial, sans-serif; padding:20px 25px; background:white; font-size:${fs}px; color:#000; }
          @media print { @page { margin:8mm; size:A4; } }
        </style>
      </head>
      <body>
        <div style="height:90px; margin-bottom:6mm;"></div>
        <hr style="border:none; border-top:2px solid ${hc}; margin:10px 0;" />
        <div style="background:${hc}; color:white; text-align:center; padding:6px; font-size:${fs + 2}px; font-weight:bold; margin-bottom:12px; border-radius:3px; letter-spacing:1px;">
          Laboratory Report
        </div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 30px; flex:1;">
            ${[
              ['Patient Name :', selectedPatient.name],
              ['Print Date :', printDate],
              ['Sex / Age :', `${genderText} / ${selectedPatient.age || '-'} Years`],
              ['Visit Date :', visitDate],
              ['Referred By :', selectedPatient.doctor || '-'],
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
          <div style="width:100px; height:65px; border:2px dashed ${hc}; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:${fs}px; color:${hc}; font-weight:bold; direction:rtl;">
            Ø®ØªÙ… Ø§Ù„Ù…Ø¹Ù…Ù„
          </div>
          <div style="text-align:center;">
            <div style="font-size:${fs + 1}px; font-weight:bold; color:${hc}; margin-bottom:25px;">Dr. ${doctorName}</div>
            <div style="width:160px; border-bottom:1px solid ${hc}; margin:0 auto;"></div>
          </div>
        </div>
      </body>
      </html>
    `

    const frame = printFrameRef.current
    frame.srcdoc = html
    frame.onload = () => {
      setTimeout(() => { frame.contentWindow.print() }, 500)
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
      const sec = item.section || 'Ø£Ø®Ø±Ù‰'
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
                        <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>â–  {SECTION_LABELS[section] || section}</td>
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
      </div>
    )
  }

  const PreviewReport = ({ patient }) => {
    if (!patient || !settings) return null

    const doctorName = settings.doctor_name || 'Ø§Ø³Ù… Ø§Ù„Ø·Ø¨ÙŠØ¨'
    const printDate = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const visitDate = new Date(patient.created_at).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const genderText = patient.gender === 'Ø°ÙƒØ±' ? 'Male' : patient.gender === 'Ø£Ù†Ø«Ù‰' ? 'Female' : patient.gender || '-'
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

    return (
      <div style={{ fontFamily: 'Arial, sans-serif', fontSize: `${fs}px`, color: '#000', background: 'white', padding: '20px 25px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '8mm', marginBottom: '6mm' }}>
          <div style={{ height: '90px' }}></div>
          <div style={{ height: '90px' }}></div>
          <div style={{ height: '90px' }}></div>
        </div>

        <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '10px 0' }} />

        <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '6px', fontSize: `${fs + 2}px`, fontWeight: 'bold', marginBottom: '12px', borderRadius: '3px', letterSpacing: '1px' }}>
          Laboratory Report
        </div>

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

          {patient.barcode_seq && (
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

        {Object.keys(panelGroups).length > 0 && <PreviewHistory colors={colors} rows={historyRows} />}

        {singleTests.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', marginBottom: '5px' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                {['Test Name', 'Result', 'Unit', 'Reference range'].map((h, i) => (
                  <th key={i} style={{
                    padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`,
                    fontWeight: 'bold', color: '#333',
                    borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd',
                    width: i === 0 ? '35%' : i === 1 ? '20%' : i === 2 ? '15%' : '30%'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([category, tests]) => (
                <Fragment key={category}>
                  <tr style={{ background: `${tc}18` }}>
                    <td colSpan={4} style={{
                      padding: '6px 10px', fontWeight: 'bold', fontSize: `${fs + 1}px`,
                      color: tc, borderTop: `1px solid ${tc}40`, borderBottom: `1px solid ${tc}40`
                    }}>â–  {category}</td>
                  </tr>
                  {tests.map((t, ti) => {
                    const computedStatus = calcResultStatus(t.value, t.normal_range) || t.status
                    return (
                      <tr key={ti} style={{ background: ti % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>â–  {t.name}</td>
                        <td style={{
                          padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee',
                          color: computedStatus === 'Ù…Ø±ØªÙØ¹' ? rHigh : computedStatus === 'Ù…Ù†Ø®ÙØ¶' ? rLow : rNormal,
                          fontWeight: (computedStatus === 'Ù…Ø±ØªÙØ¹' || computedStatus === 'Ù…Ù†Ø®ÙØ¶') ? 'bold' : 'normal'
                        }}>{t.value || '---'}</td>
                        <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.unit || ''}</td>
                        <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.normal_range || '---'}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
          <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, color: hc, fontWeight: 'bold', direction: 'rtl' }}>
            Ø®ØªÙ… Ø§Ù„Ù…Ø¹Ù…Ù„
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: `${fs + 1}px`, fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {doctorName}</div>
            <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }}></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6" dir="rtl">

      <iframe ref={printFrameRef} style={{ display: 'none' }} title="print-frame" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ±</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>Ø¹Ø±Ø¶ ÙˆØ·Ø¨Ø§Ø¹Ø© ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ù…Ø±Ø¶Ù‰</p>
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
              {filtered.length} Ù†ØªÙŠØ¬Ø©
            </span>
          </div>

          <input type="text" placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ø±ÙŠØ¶..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />

          {loading ? (
            <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--on-surface-variant)' }}>Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø±Ø¶Ù‰ Ù…Ø·Ø§Ø¨Ù‚ÙŠÙ†</div>
          ) : (
            <div className="space-y-4">
              {filtered.map(patient => (
                <div key={patient.id} className="bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>{patient.name}</h2>
                      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                        {patient.age} Ø³Ù†Ø© â€¢ {patient.gender} â€¢ {patient.doctor}
                      </p>
                    </div>
                    <button onClick={() => setSelectedPatient(patient)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--primary-container)' }}>
                      ðŸ‘ï¸ Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚Ø±ÙŠØ±
                    </button>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#f1f3f4' }}>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>Ø§Ù„ØªØ­Ù„ÙŠÙ„</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>Ø§Ù„Ù†ØªÙŠØ¬Ø©</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>Ø§Ù„Ø­Ø§Ù„Ø©</th>
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
        <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>

          <div className="bg-white rounded-xl p-4 flex-shrink-0" style={{ width: '220px', border: '1px solid var(--outline-variant)', position: 'sticky', top: '20px' }}>
            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--on-surface)' }}>ðŸŽ¨ ØªØµÙ…ÙŠÙ… Ø§Ù„ØªÙ‚Ø±ÙŠØ±</h3>

            <div className="space-y-3">
              {[
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ù‡ÙŠØ¯Ø±', key: 'report_header_color' },
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ø¬Ø¯ÙˆÙ„', key: 'report_table_color' },
                { label: 'Ù„ÙˆÙ† Ù†Øµ Ø§Ù„Ø¬Ø¯ÙˆÙ„', key: 'report_table_text_color' },
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠØ©', key: 'report_result_normal_color' },
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø§Ù„Ù…Ø±ØªÙØ¹Ø©', key: 'report_result_high_color' },
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ù†ØªÙŠØ¬Ø© Ø§Ù„Ù…Ù†Ø®ÙØ¶Ø©', key: 'report_result_low_color' },
                { label: 'Ù„ÙˆÙ† Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ ÙˆØ§Ù„Ù€ ID', key: 'report_barcode_color' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.label}</label>
                  <input type="color" value={design[item.key]}
                    onChange={e => setDesign(prev => ({ ...prev, [item.key]: e.target.value }))}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                </div>
              ))}

              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>Ø­Ø¬Ù… Ø§Ù„Ø®Ø·: {design.report_font_size}px</label>
                <input type="range" min="9" max="14" value={design.report_font_size}
                  onChange={e => setDesign(prev => ({ ...prev, report_font_size: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>

            <button onClick={saveDesign} disabled={savingDesign}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-4"
              style={{ background: designSaved ? '#10b981' : 'var(--primary-container)', opacity: savingDesign ? 0.7 : 1 }}>
              {designSaved ? 'âœ… ØªÙ… Ø§Ù„Ø­ÙØ¸' : savingDesign ? 'Ø¬Ø§Ø±ÙŠ...' : 'ðŸ’¾ Ø­ÙØ¸ Ø§Ù„ØªØµÙ…ÙŠÙ…'}
            </button>

            <button onClick={printReport}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-2"
              style={{ background: '#1a2456' }}>
              ðŸ–¨ï¸ Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±
            </button>

            <button onClick={() => setSelectedPatient(null)}
              className="w-full py-2 rounded-lg text-xs font-medium mt-2"
              style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
              â† Ø±Ø¬ÙˆØ¹
            </button>
          </div>

          {/* ØµÙ†Ø¯ÙˆÙ‚ Ø§Ù„ØªÙƒÙ„ÙØ© - Ù„Ù„Ø¯ÙƒØªÙˆØ± ÙÙ‚Ø·ØŒ Ù„Ø§ ÙŠØ¸Ù‡Ø± ÙÙŠ Ø§Ù„Ø·Ø¨Ø§Ø¹Ø© Ø£Ø¨Ø¯Ù‹Ø§ */}
          <div className="bg-white rounded-xl p-4 flex-shrink-0" style={{ width: '200px', border: '1px solid var(--outline-variant)', position: 'sticky', top: '20px' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--on-surface)' }}>ðŸ’° Ø§Ù„ØªÙƒÙ„ÙØ© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©</h3>
            <div className="text-center py-3 rounded-lg" style={{ background: '#f0fdf4' }}>
              <span className="text-2xl font-bold" style={{ color: '#065f46' }}>
                {computeTotalCost(selectedPatient).toLocaleString('ar-EG')}
              </span>
              <span className="text-sm mr-1" style={{ color: '#065f46' }}>Ø¬Ù†ÙŠÙ‡</span>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--on-surface-variant)' }}>
              Ù‡Ø°Ø§ Ø§Ù„Ù…Ø¨Ù„Øº Ù„Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø¯Ø§Ø®Ù„ÙŠ ÙÙ‚Ø· ÙˆÙ„Ø§ ÙŠØ¸Ù‡Ø± Ø¹Ù†Ø¯ Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±.
            </p>
          </div>

          <div className="flex-1 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--outline-variant)' }}>
            <div ref={previewRef}>
              <PreviewReport patient={selectedPatient} />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
