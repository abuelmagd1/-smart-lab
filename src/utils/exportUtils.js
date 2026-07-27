// تصدير بيانات لملف CSV يفتح مباشرة في Excel - من غير أي مكتبة خارجية أو تعديل package.json
// (CSV بيتفتح في Excel عادي زي أي ملف .xlsx، الفرق إنه نص بسيط مش صيغة Excel الثنائية)

// بيحوّط أي قيمة فيها فاصلة أو سطر جديد أو علامة تنصيص بعلامات تنصيص، وبيهرب أي "
const escapeCSVValue = (value) => {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// headers: [{ key: 'name', label: 'الاسم' }, ...]
// rows: [{ name: 'أحمد', ... }, ...]
export const exportToCSV = (filename, headers, rows) => {
  const headerLine = headers.map(h => escapeCSVValue(h.label)).join(',')
  const dataLines = rows.map(row =>
    headers.map(h => escapeCSVValue(row[h.key])).join(',')
  )
  // \uFEFF (BOM) في الأول عشان Excel يعرض الحروف العربية صح من غير ما تتحول لرموز غريبة
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
