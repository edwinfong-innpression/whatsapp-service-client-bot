import { INTENT } from '../config.js'
import { checkClass } from './checkClass.js'
import { attendance } from './attendance.js'

// 新增功能：建立 handler 檔案，然後喺呢度登記 intent -> handler
const handlers = {
  [INTENT.CHECK_CLASS]: checkClass,
  [INTENT.ATTENDANCE]: attendance
}

// ---- 執行後台互動動作 ----
export async function executeIntent(intent, slots, user) {
  console.log('intent.name', intent.name)
  const handler = handlers[intent.name]
  return handler ? handler(intent, slots, user) : null
}
