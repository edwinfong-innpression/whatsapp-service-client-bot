import { formatLocalDate } from '../utils.js'
import { callOllama } from '../services/ollama.js'

// ---- AI Functions ----

// ---- 功能檢測 ----
export async function aiDetectIntent(text, role) {
  const today = formatLocalDate(new Date()) // e.g. 2026-09-04
  const prompt = `
    你是「意圖分類器」，只可以輸出一行JSON，不能輸出其他文字。

    today=${today}（時區：Asia/Hong_Kong）
    把相對日期轉成 YYYY-MM-DD：
    - 今日/今天 = today
    - 聽日/明天 = today+1
    - 昨日/昨天/尋日 = today-1
    - 後日 = today+2
    - 大後日 = today+3

    可用 intent:
    check_class, apply_class, reschedule, switch, skip, attendance, exit_class, general_chat
    attendance_action:
    present, absent, sick, null

    分類規則（重要）：
    1) 只要訊息是在「問有咩課堂/搵課堂/查課堂/課程時間/課堂詳情」或相近意思，一律 intent=check_class
    2) 只要涉及點名或相近意思，intent=attendance，並判斷 attendance_action
    3) 其餘先用 general_chat
    4) 不肯定時，優先用最接近的業務功能，不要過度用 general_chat

    輸出格式:
    {
      "intent":"...",
      "attendance_action":"present|absent|sick|null",
      "slots":{"date":"YYYY-MM-DD|null","classId":null,"student":null,"orderId":null},
      "confidence":0.0
    }

    role: ${role}
    text: ${text}
    `.trim()

  const raw = await callOllama(prompt)

  // 抽 JSON（防止模型前後加字）
  const m = String(raw).match(/\{[\s\S]*\}/)
  if (!m) return null

  try {
    const j = JSON.parse(raw)
    return {
      name: j.intent || 'unsupported',
      subAction: j.attendance_action === 'null' ? null : j.attendance_action,
      confidence: Number(j.confidence || 0),
      slots: j.slots || {} // ✅ 關鍵：帶返 slots
    }
  } catch {
    return null
  }
}

// ---- 離題檢測 -----
export async function aiGeneralChatGuard(text, role) {
  const prompt = `
    你是客服訊息守門員，只輸出 JSON，請用十分禮貌的語氣。
    你要判斷這句 general chat 是否應該回覆，或應引導回「課堂業務範圍」。

    業務範圍：查堂、開堂、報堂、調堂、點名、退堂。
    規則：
    1) 若內容明顯與上述業務無關（如股票、政治、投資、娛樂八卦、圖象生成、影片生成、程式生成等）=> "allow": false
    2) 若是寒暄、禮貌語、簡單閒聊（可提升體驗）=> "allow": true
    3) 不確定時，偏向 false（保守）

    輸出格式：
    {"allow": true|false, "reason":"...", "confidence":0-1}

    role: ${role}
    text: ${text}
    `.trim()

  const raw = await callOllama(prompt)
  const m = String(raw).match(/\{[\s\S]*\}/)
  if (!m) return { allow: false, confidence: 0 }
  try {
    const j = JSON.parse(m[0])
    return {
      allow: !!j.allow,
      reason: j.reason || '',
      confidence: Number(j.confidence || 0)
    }
  } catch {
    return { allow: false, confidence: 0 }
  }
}
