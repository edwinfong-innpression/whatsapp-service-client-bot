import { INTENT } from '../config.js'
import { parseAttendanceAction } from './intent.js'

// ---- 提取訊息內data ----
export function fillSlotsFromText(session, text = '') {
  if (!session.slots) session.slots = {}

  const t = text.trim()

  // 抽 classId
  const classId =
    t.match(/(?:class|班|堂|課)\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] ||
    t.match(/\b([A-Z]\d{2,}|\d{3,})\b/)?.[1] || null

  // 抽 student
  const student =
    t.match(/(?:學生|student|user)\s*[:：]?\s*([^\s,，]+)/i)?.[1] || null

  // 抽 date
  const date = t.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null

  // 抽 attendance action
  let action = null
  if (/(簽到|出席|present|check-?in)/i.test(t)) action = 'present'
  else if (/(缺席|absent)/i.test(t)) action = 'absent'
  else if (/(病假|sick)/i.test(t)) action = 'sick'

  // 抽 order
  const orderToken = t.match(/\b(?:DN[-\s]?\d+|\d+)\b/i)?.[0] || null
  const orderId = orderToken ? (orderToken.match(/(\d+)/)?.[1] || null) : null

  // 只覆蓋有抽到嘅值；冇抽到就保留原值
  if (classId) session.slots.classId = classId
  if (student) session.slots.student = student
  if (date) session.slots.date = date
  if (action) session.slots.action = action
  if (orderId) session.slots.orderId = orderId

  return session.slots
}

// ---- detail data 拆解 ----
export function extractSlots(text = '', intent) {
  const t = text.trim()
  let action = null
  if (intent?.name === INTENT.ATTENDANCE) {
    action = parseAttendanceAction(t) // 重用你現有 function
  }

  const classId =
    t.match(/(?:class|班|堂|課)\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1] ||
    t.match(/\b([A-Z]\d{2,}|\d{3,})\b/)?.[1] || null

  const student =
    t.match(/(?:學生|student|user)\s*[:：]?\s*([^\s,，]+)/i)?.[1] || null

  const date = t.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null

  return { classId, student, date, action }
}

// ---- detail data 欠缺測試 ----
export function missingSlots(intentName, slots) {
  const req = {
    check_class: ['date'],                 // 或 ['classId']，按你業務改
    open_class: ['classId', 'date'],
    apply_class: ['classId', 'student'],
    reschedule: ['classId', 'date'],
    switch: ['classId', 'date'],
    skip: ['classId'],
    attendance: ['classId', 'student', 'action'],
    exit_class: ['classId', 'student']
  }[intentName] || []

  return req.filter((k) => !slots[k])
}

// ---- detail data 整合 ----
export function mergePreferNonNull(base = {}, patch = {}) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out
}

// ---- detail data 整合 ----
export function askForMissing(intentName, miss = []) {
  const labels = {
    classId: '班堂ID',
    student: '學生',
    date: '日期（YYYY-MM-DD）',
    action: '點名動作（簽到 / 缺席 / 病假）',
    orderId: '訂單編號（例如 DN-120）'
  }

  // 逐個 intent 自訂優先追問（自然啲）
  if (intentName === INTENT.ATTENDANCE) {
    if (miss.includes('action')) return '請先講點名動作：簽到、缺席，定病假？'
    if (miss.includes('classId')) return '請提供班堂ID，例如：A101'
    if (miss.includes('student')) return '請提供學生名，例如：Chan Tai Man'
  }

  if (intentName === 'open_class') {
    if (miss.includes('classId')) return '請提供要開堂嘅班堂ID，例如：A101'
    if (miss.includes('date')) return '請提供開堂日期（YYYY-MM-DD），例如：2026-09-03'
  }

  if (intentName === INTENT.CHECK_CLASS) {
    if (miss.includes('date')) return '請提供查堂日期（YYYY-MM-DD），例如：2026-09-03'
  }

  if (intentName === 'apply_class') {
    if (miss.includes('classId')) return '請提供要報堂嘅班堂ID，例如：A101'
    if (miss.includes('student')) return '請提供學生名，例如：Chan Tai Man'
  }

  if (intentName === 'reschedule') {
    if (miss.includes('classId')) return '請提供要調堂嘅班堂ID，例如：A101'
    if (miss.includes('date')) return '請提供新日期（YYYY-MM-DD），例如：2026-09-10'
  }

  if (intentName === 'switch') {
    // if (miss.includes('classId')) return '請提供要調堂嘅班堂ID，例如：A101'
    // if (miss.includes('date')) return '請提供新日期（YYYY-MM-DD），例如：2026-09-10'
  }

  if (intentName === 'skip') {
    // if (miss.includes('classId')) return '請提供要調堂嘅班堂ID，例如：A101'
    // if (miss.includes('date')) return '請提供新日期（YYYY-MM-DD），例如：2026-09-10'
  }

  if (intentName === 'exit_class') {
    if (miss.includes('classId')) return '請提供要退堂嘅班堂ID，例如：A101'
    if (miss.includes('student')) return '請提供學生名，例如：Chan Tai Man'
  }

  // fallback
  const missingText = miss.map(k => labels[k] || k).join('、')
  return `請補充以下資料：${missingText}`
}
