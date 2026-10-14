import { API_URL } from '../config.js'

// 查堂
export async function checkClass(intent, slots, user) {
  const body = new URLSearchParams()
  body.append('get_all_data_by_datatype', JSON.stringify({ data_type: 'lesson_data', filter_item: [{ key: 'date', value: slots.date }] }))

  const res = await fetch(API_URL[user.collections[0]], {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) return `發生錯誤 HTTP ${res.status}`

  const payload_content = await res.text()
  try {
    const payload = JSON.parse(payload_content)['result']
    const lesson = payload.map(p => `${p.name} - ${p.date} ${p.start_time}-${p.end_time}`)
    if (lesson.length === 0) return `當日沒有任何課堂`
    return lesson.join(',\n')
  } catch {
    return `發生錯誤 Invalid JSON: ${payload_content}`
  }
}
