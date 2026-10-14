// ---- 通用功能 ----

// ---- 本地時間 ----
export function formatLocalDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---- 文字修正 ----
export function toSafeText(v) {
  if (typeof v === 'string') return v
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}
