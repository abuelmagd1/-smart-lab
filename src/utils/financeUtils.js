// بيحسب إجمالي المبلغ الفعلي المحصّل/المطلوب من مريض معين، مع تصحيح مهم:
//
// ملحوظة مهمة عن بنية البيانات الحالية: لما تُضاف باقة (زي CBC) لمريض، كل بند فرعي
// جوه الباقة (HGB, WBCs, PLT...) بياخد نسخة من *سعر الباقة الكامل* في عمود price بتاعه
// (شوف NewPatient.jsx). يعني لو باقة CBC فيها 15 بند وسعرها 100 جنيه، هتلاقي 15 صف
// كل واحد فيهم price=100. لو جمعت price لكل صفوف المريض عادي، هتحسب الباقة الواحدة
// 15 مرة (1500 جنيه بدل 100). الدالة دي بتتجنب المشكلة دي بإنها تاخد سعر الباقة
// مرة واحدة بس لكل panel_instance_id، وتجمع التحاليل المفردة عادي.
export const calculatePatientRevenue = (patient) => {
  const seenPanelInstances = new Set()
  let total = 0
  ;(patient.tests || []).forEach(t => {
    if (t.panel_instance_id) {
      if (!seenPanelInstances.has(t.panel_instance_id)) {
        seenPanelInstances.add(t.panel_instance_id)
        total += t.price || 0
      }
    } else {
      total += t.price || 0
    }
  })
  return total
}

// نفس فكرة تقسيم الفترات الزمنية المستخدمة في باقي صفحات النظام (اليوم/امبارح/آخر أسبوع...)
export const getDateBucket = (dateStr) => {
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

export const PERIOD_FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'امبارح' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'older', label: 'قبل ذلك' },
]

export const pctChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

// بيلخّص بيانات المرضى (إيراد، تحصيل، أكتر تحاليل/أطباء) + المصروفات لفترة معينة في تقرير واحد،
// بما فيها صافي الربح (المحصّل فعليًا ناقص المصروفات). دي الدالة المشتركة اللي بيستخدمها
// كل من صفحة الإحصائيات ولابو (لما يجهّز تقرير PDF)، عشان الحساب يفضل متطابق في كل مكان
export const summarizeFinances = (patients, expenses) => {
  let totalRevenue = 0
  let totalOrders = 0
  let collected = 0
  let pending = 0
  const doctorsMap = {}
  const rankMap = {}

  patients.forEach(p => {
    if (p.doctor) {
      doctorsMap[p.doctor] = (doctorsMap[p.doctor] || 0) + 1
    }
    const cost = calculatePatientRevenue(p)
    if (p.paid) collected += cost
    else pending += cost

    const seenPanelInstances = new Set()
    ;(p.tests || []).forEach(t => {
      if (t.panel_instance_id) {
        if (!seenPanelInstances.has(t.panel_instance_id)) {
          seenPanelInstances.add(t.panel_instance_id)
          totalRevenue += t.price || 0
          totalOrders += 1
          const key = t.panel_code || 'باقة'
          if (!rankMap[key]) rankMap[key] = { name: key, count: 0, type: 'باقة', revenue: 0 }
          rankMap[key].count += 1
          rankMap[key].revenue += t.price || 0
        }
      } else {
        totalRevenue += t.price || 0
        totalOrders += 1
        const key = t.name
        if (!rankMap[key]) rankMap[key] = { name: key, count: 0, type: 'مفرد', revenue: 0 }
        rankMap[key].count += 1
        rankMap[key].revenue += t.price || 0
      }
    })
  })

  const ranked = Object.values(rankMap).sort((a, b) => b.count - a.count)
  const topDoctors = Object.entries(doctorsMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const netProfit = collected - totalExpenses

  return {
    totalPatients: patients.length,
    totalRevenue,
    totalOrders,
    collected,
    pending,
    ranked,
    topDoctors,
    totalExpenses,
    netProfit,
  }
}

// بيحسب بداية ونهاية فترة بسيطة (يوم/شهر/سنة) - مستخدمة في تقرير لابو السريع
export const getSimpleRange = (period) => {
  const now = new Date()
  let start, end, label
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end = new Date(start); end.setDate(end.getDate() + 1)
    label = 'اليوم'
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1)
    end = new Date(now.getFullYear() + 1, 0, 1)
    label = 'السنة الحالية'
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    label = 'الشهر الحالي'
  }
  return { start, end, label }
}

// بيبني تقرير مالي كصفحة HTML جاهزة للطباعة/الحفظ كـ PDF (من غير أي مكتبة PDF خارجية) -
// المستخدم بيدوس Ctrl+P أو زرار الطباعة، ويختار "Save as PDF" من نافذة الطباعة العادية في المتصفح
export const buildFinancialReportHTML = (summary, meta) => {
  const periodLabel = meta?.periodLabel || ''
  const rangeLabel = meta?.rangeLabel || ''
  const labName = meta?.labName || 'المعمل'

  const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  const rankedRows = summary.ranked.slice(0, 12).map(r =>
    `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.type)}</td><td>${r.count}</td><td>${r.revenue.toLocaleString('ar-EG')} جنيه</td></tr>`
  ).join('')

  const doctorRows = summary.topDoctors.slice(0, 12).map(d =>
    `<tr><td>${escapeHtml(d.name)}</td><td>${d.count} مريض</td></tr>`
  ).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>تقرير مالي - ${escapeHtml(periodLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 32px; color: #1a2456; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
  .card { border: 1px solid #ddd; border-radius: 10px; padding: 14px 18px; min-width: 140px; flex: 1; }
  .card .label { font-size: 12px; color: #666; }
  .card .value { font-size: 19px; font-weight: bold; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th, td { text-align: right; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
  th { background: #f5f5f5; }
  h2 { font-size: 16px; margin-top: 0; margin-bottom: 12px; }
  .print-btn { padding: 10px 22px; border-radius: 8px; background: #1a2456; color: white; border: none; cursor: pointer; font-size: 14px; margin-bottom: 20px; }
  @media print { .no-print { display: none !important; } body { padding: 12px; } }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
  <h1>${escapeHtml(labName)} — تقرير مالي</h1>
  <p class="sub">الفترة: ${escapeHtml(periodLabel)} (${escapeHtml(rangeLabel)})</p>

  <div class="cards">
    <div class="card"><div class="label">عدد المرضى</div><div class="value">${summary.totalPatients.toLocaleString('ar-EG')}</div></div>
    <div class="card"><div class="label">إجمالي الإيراد</div><div class="value">${summary.totalRevenue.toLocaleString('ar-EG')} جنيه</div></div>
    <div class="card"><div class="label">تم تحصيله</div><div class="value" style="color:#065f46">${summary.collected.toLocaleString('ar-EG')} جنيه</div></div>
    <div class="card"><div class="label">متبقي</div><div class="value" style="color:#dc2626">${summary.pending.toLocaleString('ar-EG')} جنيه</div></div>
    <div class="card"><div class="label">إجمالي المصروفات</div><div class="value" style="color:#92400e">${summary.totalExpenses.toLocaleString('ar-EG')} جنيه</div></div>
    <div class="card"><div class="label">صافي الربح</div><div class="value" style="color:${summary.netProfit >= 0 ? '#065f46' : '#dc2626'}">${summary.netProfit.toLocaleString('ar-EG')} جنيه</div></div>
  </div>

  <h2>🏆 أكتر التحاليل طلبًا</h2>
  <table>
    <thead><tr><th>الاسم</th><th>النوع</th><th>العدد</th><th>الإيراد</th></tr></thead>
    <tbody>${rankedRows || '<tr><td colspan="4">لا توجد بيانات في هذه الفترة</td></tr>'}</tbody>
  </table>

  <h2>👨‍⚕️ الأطباء الأكثر تحويلاً</h2>
  <table>
    <thead><tr><th>الاسم</th><th>عدد المرضى المحوّلين</th></tr></thead>
    <tbody>${doctorRows || '<tr><td colspan="2">لا توجد بيانات في هذه الفترة</td></tr>'}</tbody>
  </table>

  <p class="sub no-print">لحفظ التقرير كملف PDF: دوس زرار الطباعة فوق، وفي نافذة الطباعة اختار "Save as PDF" بدل الطابعة.</p>
</body>
</html>`
}