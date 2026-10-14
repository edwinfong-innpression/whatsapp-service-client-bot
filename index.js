import 'dotenv/config'
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import axios from 'axios'
import express from 'express'
import { z } from 'zod'
import qrcode from 'qrcode-terminal'

// ---- Config and variables ----

const log = P({ level: 'info' })
const app = express()
app.get('/health', (_, res) => res.json({ ok: true }))
app.listen(process.env.PORT || 3000, () => log.info('health server up'))
const ROLE = {
  DEV: 'innpression',           // 平台開發商（你哋）
  STORE: 'staff',       // 客戶（店舖）
  STORE_USER: 'user'
}
const INTENT = {
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

const ATTENDANCE_ACTION = {
  PRESENT: 'present', // 簽到
  ABSENT: 'absent',   // 缺席
  SICK: 'sick'        // 病假
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
const OLLAMA_MODEL = process.env.OLLAMA_MODEL
const API_BASE = process.env.SYSTEM_API_BASE_URL
const API_KEY = process.env.SYSTEM_API_KEY
const ALLOWED_SENDERS = new Set(
  (process.env.ALLOWED_SENDERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)
const ALLOWED_PHONES = new Set(
  (process.env.ALLOWED_PHONES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

const API_URL = {
  "dev": "https://tutordev-api.innpressionhost.com/request.php",
  "uat": "https://tutoring.innpressionhost.com/request.php",
  "t61": "https://joyful-api.innpressionhost.com/request.php"
}

const sessions = new Map() // key: senderId

// ---- User Session Functions ----

// ---- 用戶對話 Storage ----
function getSession(senderId) {
  if (!sessions.has(senderId)) {
    sessions.set(senderId, {
      pendingIntent: null,
      slots: {},
      updatedAt: Date.now()
    })
  }
  return sessions.get(senderId)
}

// ---- 移除用戶已完成對話 ----
function clearSession(senderId) {
  sessions.delete(senderId)
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // if (qr) log.info('請掃 QR code 登入 WhatsApp')
    if (qr) {
      console.log('Scan this QR with WhatsApp:')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      log.warn({ shouldReconnect }, 'connection closed')
      if (shouldReconnect) start()
    } else if (connection === 'open') {
      log.info('WhatsApp connected')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {

    console.log('[upsert]', type, 'count=', messages?.length || 0)

    for (const m of messages || []) {
      console.log('[keys]', m.key);
      const jid = m.key?.remoteJid
      const jidAlt = m.key?.remoteJidAlt
      const fromMe = m.key?.fromMe
      const msg = m.message
      const text =
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        ''

      console.log('[msg]', { jid, jidAlt, fromMe, text, hasMessage: !!msg })

      if (fromMe) continue
      if (!jid || (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid'))) continue
      if (!jidAlt || (!jidAlt.endsWith('@s.whatsapp.net') && !jidAlt.endsWith('@lid'))) continue
      if (!text) continue

      const senderId = (jid.endsWith('@lid')?(jid || '').split('@')[0]:(jidAlt.endsWith('@lid')?(jidAlt || '').split('@')[0]:""))
      const phoneNum = (jid.endsWith('@s.whatsapp.net')?(jid || '').split('@')[0]:(jidAlt.endsWith('@s.whatsapp.net')?(jidAlt || '').split('@')[0]:""))

      // if (text.trim() === '/whoami') {
      //   const pn =
      //     m.key?.participantPn ||
      //     m.message?.extendedTextMessage?.contextInfo?.participantPn ||
      //     'N/A'

      //   await sock.sendMessage(jid, {
      //     text: `jid=${jid}\nsenderId=${senderId}\nphoneNum=${phoneNum}\nparticipantPn=${pn}`
      //   })
      //   continue
      // }

      console.log('[ALLOWED_SENDERS]', ALLOWED_SENDERS)
      console.log('[senderId]', senderId)
      console.log('[phoneNum]', phoneNum)

      // check allow
      let user = await resolveIdentity(phoneNum)
      if(user === null){
        await sock.sendMessage(jid, { text: '你沒有權限，請稍後再試。' })
        continue
      }
      
      let feed = await Message(user.user_type, text, user, senderId);
      const safeReply = toSafeText(feed).trim()
      console.log('[feed]', feed)
      console.log('[safeReply]', safeReply)
      await sock.sendMessage(jid, { text: safeReply.slice(0, 3000) })

      if (!text) {
        continue
      }
    }
  })
}

// ---- 身份權限檢測 ----
async function resolveIdentity(phoneNum) {
  const body = new URLSearchParams()
  body.append('check_agent_user', JSON.stringify({"phone":phoneNum}))

  const res = await fetch('https://tutordev-api.innpressionhost.com/request.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  if (!res.ok) {
    // throw new Error(`HTTP ${res.status}`)
    await sock.sendMessage(jid, { text: `發生錯誤 HTTP ${res.status}` })
    return null
  }

  // // backend 可能回 JSON string / JSON
  const payload_content = await res.text()
  let payload
  try {
    payload = JSON.parse(payload_content)['result']
    return payload
  } catch {
    await sock.sendMessage(jid, { text: `發生錯誤 Invalid JSON: ${payload_content}` })
    return null
  }
}

// ---- 訊息build ----
async function Message(role ,text, user, senderId) {
  const s = getSession(senderId)
  console.log("getSession",s)

  // 1) 若有 pending intent，優先補資料
  if (s.pendingIntent) {
    const ai2 = await aiDetectIntent(text, role)
    if (ai2?.slots) s.slots = { ...s.slots, ...ai2.slots }
    fillSlotsFromText(s, text) // 你自定：抽 classId/student/action/date...

    const miss = missingSlots(s.pendingIntent, s.slots)
    if (miss.length) return askForMissing(s.pendingIntent, miss)

    const reply = await executeIntent({"name":s.pendingIntent}, s.slots, user)
    clearSession(senderId)
    return reply
  }

  // const intent = detectIntent(text)
  // 檢測功能
  const intent = await detectIntentHybrid(text, role)
  if (intent.name === 'unsupported') {
    return '暫時只支援：查堂、開堂、報堂、調堂、點名（簽到/缺席/病假）、退堂。'
  }

  // if (intent.name === INTENT.GENERAL_CHAT) {
  //   const prompt = `你係客服助理，用自然廣東話又十分禮貌的語氣簡潔回覆，而且請勿離題回覆平台功能以外資訊。\n用戶訊息：${text}`
  //   const reply = await callOllama(prompt)
  //   return String(reply ?? '收到。').slice(0, 3000)
  // }
  // 如果是沒有對應功能
  if (intent.name === INTENT.GENERAL_CHAT) {
    const guard = await aiGeneralChatGuard(text, role)

    if (!guard.allow && guard.confidence >= 0.6) {
      return '我主要協助課堂相關：查堂、開堂、報堂、調堂、點名、退堂。你想處理邊一項？'
    }

    const reply = await callOllama(`你係客服助理，用自然廣東話簡潔回覆，請用十分禮貌的語氣。\n用戶訊息：${text}`)
    return String(reply ?? '收到。').slice(0, 3000)
  }

  // init slot
  // 檢查是否有在進行中對話
  const ai = await aiDetectIntent(text, role)
  console.log('[ai]', ai)
  const slotsFromRule = extractSlots(text, intent)
  const slots = mergePreferNonNull(ai?.slots || {}, slotsFromRule)
  console.log('[slots]', slots)

  if (!slots.action && ai?.attendance_action && ai.attendance_action !== 'null') {
    slots.action = ai.attendance_action
  }

  // 是否要補充data
  const miss = missingSlots(intent.name, slots)

  if (miss.length) {
    s.pendingIntent = intent.name
    s.slots = slots
    return askForMissing(intent.name, miss)
  }

  // 要求用戶提供什麼data
  const detail = needsMoreDetail(text, intent)
  if (detail.need) {
    console.log('[detail.need]', detail.need)
    return detail.ask
  }

  // 身份detect
  const permit = await authorizeTool(role, intent)
  if (!permit.ok) {
    console.log('[permit.ok]', permit.ok)
    return permit.reason
  }

  // 系統功能執行
  const toolReply = await executeIntent(intent, slots, user)
  if (toolReply) {
    console.log('[toolReply]]', toolReply)
    return toolReply
  }

  // 否則走 LLM（帶角色與邊界）
    // identity.storeId ? `店舖：${identity.storeId}` : '',
  const prompt = [
    `你係客服助理，請用十分禮貌的語氣。使用者角色：${role}。`,
    '規則：如涉及訂單/退款/調堂/退堂等操作，先確認必要資料，不可臆測。而且請勿離題回覆平台功能以外資訊。',
    `用戶訊息：${text}`
  ].filter(Boolean).join('\n')

  const reply = await callOllama(prompt)
  return reply.slice(0, 3000)
}

// ---- 提取訊息內data ----
function fillSlotsFromText(session, text = '') {
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
function extractSlots(text = '', intent) {
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
function missingSlots(intentName, slots) {
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
function mergePreferNonNull(base = {}, patch = {}) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out
}

// ---- detail data 整合 ----
function askForMissing(intentName, miss = []) {
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

// ---- AI+keyword 混合功能檢測 ----
async function detectIntentHybrid(text, role) {
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
function forceIntentByKeyword(text='') {
  const t = text
  if (/(點名|簽到|缺席|病假)/i.test(t)) return INTENT.ATTENDANCE
  if (/(查堂|查課)/i.test(t)) return INTENT.CHECK_CLASS
  if (/(開堂|開課)/i.test(t)) return INTENT.OPEN_CLASS
  if (/(報堂|報名)/i.test(t)) return INTENT.APPLY_CLASS
  if (/(調堂|改期)/i.test(t)) return INTENT.RESCHEDULE
  if (/(調課程|轉班)/i.test(t)) return INTENT.SWITCH
  if (/(跳堂)/i.test(t)) return INTENT.SKIP
  if (/(退堂|退課)/i.test(t)) return INTENT.EXIT_CLASS
  return null
}

// ---- Keyword檢測 ----
function detectIntent(text = '') {
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
function parseAttendanceAction(text = '') {
  const t = text.trim()
  if (/(簽到|出席|present|check-?in)/i.test(t)) return ATTENDANCE_ACTION.PRESENT
  if (/(缺席|absent)/i.test(t)) return ATTENDANCE_ACTION.ABSENT
  if (/(病假|請病假|sick|sick\s*leave)/i.test(t)) return ATTENDANCE_ACTION.SICK
  return null
}

// ---- 久缺data檢測 ----
function needsMoreDetail(text, intent) {
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

// ---- 權限detection ----
async function authorizeTool(identity, intent) {
  // 權限控制：例如 store_user 只可查自己店舖資料
  if (intent.name === 'refund' && identity === ROLE.STORE_USER) {
    return { ok: false, reason: '你目前權限未能直接查退款，請聯絡店舖管理員。' }
  }
  return { ok: true }
}

// ---- 執行後台互動動作 ----
async function executeIntent(intent, slots, user) {
  console.log("intent.name", intent.name)
  if (intent.name === INTENT.CHECK_CLASS) {
    console.log("slots", slots)
    console.log("user", user)

    const body = new URLSearchParams()
    body.append('get_all_data_by_datatype', JSON.stringify({"data_type":"lesson_data","filter_item":[{"key":"date","value":slots.date}]}))

    const res = await fetch(API_URL[user.collections[0]], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    if (!res.ok) {
      return `發生錯誤 HTTP ${res.status}`
    }

    // // backend 可能回 JSON string / JSON
    const payload_content = await res.text()
      console.log("get_data_by_data_type", payload_content)
    let payload
    try {
      payload = JSON.parse(payload_content)['result']
      console.log("get_data_by_data_type", payload)
      let lesson = []
      for(let i=0; i<payload.length; i++){
        lesson.push(payload[i].name + " - " + payload[i].date + " "+ payload[i].start_time+"-"+payload[i].end_time)
      }
      if(lesson.length==0){
        return `當日沒有任何課堂`
      }
      return lesson.join(',\n')
    } catch {
      return `發生錯誤 Invalid JSON: ${payload_content}`
    }
  }
  if (intent.name === INTENT.ATTENDANCE) {
    const { classId, student, action } = slots
    // call 你 backend API
    // await markAttendance({ storeId: identity.storeId, classId, student, action: intent.subAction })
    const actionText =
      intent.subAction === 'present' ? '簽到' :
      intent.subAction === 'absent' ? '缺席' : '病假'

    return `已記錄：${student} / ${classId} / ${actionText}`
  }
  return null
}


// ---- AI Functions ----

// ---- 功能檢測 ----
async function aiDetectIntent(text, role) {
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
    1) 只要訊息是在「問有咩課堂/搵課堂/查課堂/課程時間/課堂詳情」，一律 intent=check_class
    2) 只要涉及點名，intent=attendance，並判斷 attendance_action
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
async function aiGeneralChatGuard(text, role) {
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

// ---- AI 生成回覆 ----
async function callOllama(prompt) {
  const { data } = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60000 }
  )

  return data?.response?.trim()
}




// ---- 通用功能 ----

// ---- 本地時間 ----
function formatLocalDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---- 文字修正 ----
function toSafeText(v) {
  if (typeof v === 'string') return v
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

start()