import 'dotenv/config'
import P from 'pino'

export const log = P({ level: 'info' })
export const ROLE = {
  DEV: 'innpression',           // 平台開發商（你哋）
  STORE: 'staff',       // 客戶（店舖）
  STORE_USER: 'user'
}
export const INTENT = {
  CHECK_CLASS: 'check_class',   // 查堂
  OPEN_CLASS: 'open_class',     // 開堂
  APPLY_CLASS: 'apply_class', // 報堂
  RESCHEDULE: 'reschedule',     // 調堂
  SWITCH: 'switch',     // 調堂
  SKIP: 'skip',     // 調堂
  ATTENDANCE: 'attendance',     // 點名
  EXIT_CLASS: 'exit_class', // 退堂
  UNSUPPORTED: 'unsupported',
  GENERAL_CHAT: 'general_chat',
}

export const ATTENDANCE_ACTION = {
  PRESENT: 'present', // 簽到
  ABSENT: 'absent',   // 缺席
  SICK: 'sick'        // 病假
}

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL
export const API_BASE = process.env.SYSTEM_API_BASE_URL
export const API_KEY = process.env.SYSTEM_API_KEY
export const ALLOWED_SENDERS = new Set(
  (process.env.ALLOWED_SENDERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)
export const ALLOWED_PHONES = new Set(
  (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

export const API_URL = {
  "dev": "https://tutordev-api.innpressionhost.com/request.php",
  "uat": "https://tutoring.innpressionhost.com/request.php",
  "t61": "https://joyful-api.innpressionhost.com/request.php"
}
