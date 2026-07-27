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
