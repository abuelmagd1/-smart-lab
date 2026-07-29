import { supabase } from '../supabase'

// تسمية وحدة السن بالعربي، تستخدم في أي مكان بيعرض سن المريض
export const AGE_UNIT_LABELS = { Years: 'سنة', Months: 'شهر', Days: 'يوم' }

// بيرجع نص جاهز للعرض زي "27 سنة" أو "2 يوم"، مع fallback لـ "سنة" لو الوحدة مش مسجلة
export const formatAge = (age, unit) => {
  if (age === null || age === undefined || age === '') return '-'
  const label = AGE_UNIT_LABELS[unit] || 'سنة'
  return `${age} ${label}`
}

// بيحوّل عمر المريض لعدد أيام تقريبي
export const ageToApproxDays = (age, unit = 'Years') => {
  const value = Number(age) || 0
  switch (unit) {
    case 'Days': return value
    case 'Months': return Math.round(value * 30.44)
    case 'Years':
    default: return Math.round(value * 365.25)
  }
}

// بيرجع المعدل الطبيعي المطابق لسن ونوع المريض لتحليل/مكوّن معين
export const getReferenceRange = async (testName, component, ageDays, gender) => {
  const { data, error } = await supabase.rpc('get_reference_range', {
    p_test_name: testName,
    p_component: component,
    p_age_days: ageDays,
    p_gender: gender,
  })

  if (error) {
    console.error('فشل جلب المعدل الطبيعي:', error)
    return null
  }
  return data?.[0] || null
}

// بيجيب كل مكوّنات تحليل مركّب (زي كل مكوّنات CBC) دفعة واحدة
export const getReferenceRangesForTest = async (testName, ageDays, gender) => {
  const { data, error } = await supabase
    .from('test_reference_ranges')
    .select('component, min_value, max_value, unit')
    .eq('test_name', testName)
    .lte('age_min_days', ageDays)
    .gte('age_max_days', ageDays)
    .or(`gender.is.null,gender.eq.${gender}`)

  if (error) {
    console.error('فشل جلب المعدلات الطبيعية:', error)
    return []
  }

  const byComponent = {}
  for (const row of data || []) {
    const key = row.component || '__single__'
    if (!byComponent[key] || row.gender) byComponent[key] = row
  }
  return Object.values(byComponent)
}

// بيتحقق هل قيمة النتيجة خارج المعدل الطبيعي ولا لأ
export const isOutOfRange = (value, minValue, maxValue) => {
  const num = parseFloat(value)
  if (isNaN(num) || minValue == null || maxValue == null) return null
  return num < minValue || num > maxValue
}
