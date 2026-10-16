import { INTENT, ATTENDANCE_ACTION } from '../config.js'
import { aiDetectIntent } from './ai.js'

// ---- AI+keyword 混合功能檢測 ----
export async function detectIntentHybrid(text, role) {
  const forced = forceIntentByKeyword(text)
  if (forced) return { name: forced, confidence: 0.99, source: 'force' }

  // 1) 先 rule-based（高精準關鍵字）
  const rb = detectIntent(text)
  if (rb.name !== INTENT.UNSUPPORTED) return { ...rb, source: 'rule' }

  // 2) 再 AI（只喺 rule 判唔到先問）
  const ai = await aiDetectIntent(text, role) || { name: 'general_chat', confidence: 0.3 }

  // 嚴格限制：AI 置信度低就唔好信
  if (ai && ai.name !== INTENT.GENERAL_CHAT && ai.confidence >= 0.78) {
    return { ...ai, source: 'ai' }
  }

  // 3) 最後先 general
  return { name: INTENT.GENERAL_CHAT, confidence: 0.6, source: 'fallback' }
}

// ---- 強制Keyword檢測 ----
export function forceIntentByKeyword(text='') {
  const t = text
  if (/(點名|簽到|缺席|病假)/i.test(t)) return INTENT.ATTENDANCE
  if (/(查堂|查課)/i.test(t)) return INTENT.CHECK_CLASS
  // if (/(開堂|開課)/i.test(t)) return INTENT.OPEN_CLASS
  if (/(報堂|報名)/i.test(t)) return INTENT.APPLY_CLASS
  if (/(調堂|改期)/i.test(t)) return INTENT.RESCHEDULE
  if (/(調課程|轉班)/i.test(t)) return INTENT.SWITCH
  if (/(跳堂)/i.test(t)) return INTENT.SKIP
  if (/(退堂|退課)/i.test(t)) return INTENT.EXIT_CLASS
  return null
}

// ---- Keyword檢測 ----
export function detectIntent(text = '') {
  const t = text.trim()

  if (/(查堂|查課|check\s*class)/i.test(t)) return { name: INTENT.CHECK_CLASS, confidence: 0.95 }
  // if (/(開堂|開課|open\s*class)/i.test(t)) return { name: INTENT.OPEN_CLASS, confidence: 0.95 }
  if (/(報堂|報課|報名|enroll|book\s*class)/i.test(t)) return { name: INTENT.APPLY_CLASS, confidence: 0.92 }
  if (/(調堂|改堂|改期|reschedule|change\s*class)/i.test(t)) return { name: INTENT.RESCHEDULE, confidence: 0.9 }
  if (/(調課程|轉班|switch|change\s*course)/i.test(t)) return { name: INTENT.SWITCH, confidence: 0.9 }
  if (/(跳堂|skip|skip\s*class)/i.test(t)) return { name: INTENT.SKIP, confidence: 0.9 }
  if (/(點名|attendance|check-?in|簽到|缺席|病假)/i.test(t)) {
    return {
      name: INTENT.ATTENDANCE,
      confidence: 0.93,
      subAction: parseAttendanceAction(t) // present/absent/sick/null
    }
  }
  if (/(退堂|退課|退款|cancel\s*class|refund)/i.test(t)) return { name: INTENT.EXIT_CLASS, confidence: 0.9 }

  return { name: INTENT.UNSUPPORTED, confidence: 0.2 }
}

// ---- 出席keyword檢測 ----
export function parseAttendanceAction(text = '') {
  const t = text.trim()
  if (/(簽到|出席|present|check-?in)/i.test(t)) return ATTENDANCE_ACTION.PRESENT
  if (/(缺席|absent)/i.test(t)) return ATTENDANCE_ACTION.ABSENT
  if (/(病假|請病假|sick|sick\s*leave)/i.test(t)) return ATTENDANCE_ACTION.SICK
  return null
}

// ---- 久缺data檢測 ----
export function needsMoreDetail(text, intent) {
  const t = text.trim()
  const classId = t.match(/(?:class|堂|課)\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1]
  const student = t.match(/(?:學生|student)\s*[:：]?\s*([^\s,，]+)/i)?.[1]
  // 缺關鍵參數就追問
  if (intent.name === 'attendance') {
    if (!intent.subAction) {
      return { need: true, ask: '點名要註明：簽到 / 缺席 / 病假。例如：點名 class A101 學生 Chan 簽到' }
    }
    if (!classId || !student) {
      return { need: true, ask: '請提供班堂ID同學生，例如：點名 class A101 學生 Chan 簽到' }
    }
  }
  return { need: false }
}
