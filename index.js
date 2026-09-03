import 'dotenv/config'
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import axios from 'axios'
import express from 'express'
import { z } from 'zod'
import qrcode from 'qrcode-terminal'

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
  REPORT_CLASS: 'report_class', // 報堂
  RESCHEDULE: 'reschedule',     // 調堂
  ATTENDANCE: 'attendance',     // 點名
  REFUND_CLASS: 'refund_class', // 退堂
  UNSUPPORTED: 'unsupported'
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

// ---- Tool: 你系統查訂單 ----
const OrderInput = z.object({ orderId: z.string().min(1) })

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

      // ✅ 加喺呢度：whoami 指令
      if (text.trim() === '/whoami') {
        const pn =
          m.key?.participantPn ||
          m.message?.extendedTextMessage?.contextInfo?.participantPn ||
          'N/A'

        await sock.sendMessage(jid, {
          text: `jid=${jid}\nsenderId=${senderId}\nphoneNum=${phoneNum}\nparticipantPn=${pn}`
        })
        continue
      }

      console.log('[ALLOWED_SENDERS]', ALLOWED_SENDERS)
      console.log('[senderId]', senderId)
      console.log('[phoneNum]', phoneNum)

      // check allow
      let user = resolveIdentity(phoneNum)
      if(user === null){
        await sock.sendMessage(jid, { text: '你沒有權限，請稍後再試。' })
        continue
      }
      
      let feed = Message(user.user_type, text, user);
      await sock.sendMessage(jid, { text: feed })

      if (!text) {
        // await sock.sendMessage(jid, { text: '收到（但訊息格式未支援）' })
        continue
      }
    }
  })
}

async function resolveIdentity(phoneNumb) {
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

async function Message(role ,text, user) {

  const intent = detectIntent(text)
  const detail = needsMoreDetail(text, intent)
  if (detail.need) {
    return detail.ask
  }

  const permit = await authorizeTool(role, intent)
  if (!permit.ok) {
    return permit.reason
  }

  const toolReply = await executeIntent(intent, text, user)
  if (toolReply) {
    return toolReply
  }

  // 否則走 LLM（帶角色與邊界）
    // identity.storeId ? `店舖：${identity.storeId}` : '',
  const prompt = [
    `你係客服助理。使用者角色：${role}。`,
    '規則：如涉及訂單/退款/調堂/退堂等操作，先確認必要資料，不可臆測。',
    `用戶訊息：${text}`
  ].filter(Boolean).join('\n')

  const reply = await callOllama(prompt)
  return reply.slice(0, 3000) || '收到。'
}

function parseAttendanceAction(text = '') {
  const t = text.trim()
  if (/(簽到|出席|present|check-?in)/i.test(t)) return ATTENDANCE_ACTION.PRESENT
  if (/(缺席|absent)/i.test(t)) return ATTENDANCE_ACTION.ABSENT
  if (/(病假|請病假|sick|sick\s*leave)/i.test(t)) return ATTENDANCE_ACTION.SICK
  return null
}

function detectIntent(text = '') {
  const t = text.trim()

  if (/(查堂|查課|check\s*class)/i.test(t)) return { name: INTENT.CHECK_CLASS, confidence: 0.95 }
  if (/(開堂|開課|open\s*class)/i.test(t)) return { name: INTENT.OPEN_CLASS, confidence: 0.95 }
  if (/(報堂|報課|報名|enroll|book\s*class)/i.test(t)) return { name: INTENT.REPORT_CLASS, confidence: 0.92 }
  if (/(調堂|改堂|改期|reschedule|change\s*class)/i.test(t)) return { name: INTENT.RESCHEDULE, confidence: 0.9 }
  if (/(點名|attendance|check-?in|簽到|缺席|病假)/i.test(t)) {
    return {
      name: INTENT.ATTENDANCE,
      confidence: 0.93,
      subAction: parseAttendanceAction(t) // present/absent/sick/null
    }
  }
  if (/(退堂|退課|退款|cancel\s*class|refund)/i.test(t)) return { name: INTENT.REFUND_CLASS, confidence: 0.9 }

  return { name: INTENT.UNSUPPORTED, confidence: 0.2 }
}

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

async function authorizeTool(identity, intent) {
  // 權限控制：例如 store_user 只可查自己店舖資料
  if (intent.name === 'refund' && identity === ROLE.STORE_USER) {
    return { ok: false, reason: '你目前權限未能直接查退款，請聯絡店舖管理員。' }
  }
  return { ok: true }
}

async function executeIntent(intent, text, user) {
  const t = text.trim()
  const classId = t.match(/(?:class|堂|課)\s*[:#]?\s*([A-Za-z0-9_-]+)/i)?.[1]
  const student = t.match(/(?:學生|student)\s*[:：]?\s*([^\s,，]+)/i)?.[1]

  if (intent.name === 'order_status') {
    const orderId = text.match(/(?:查訂單|order)\s+([A-Za-z0-9_-]+)/i)?.[1]
    const result = await getOrderStatus(orderId, user) // API 內要帶 store scope
    return `訂單 ${orderId}\n狀態：${result.status}\n更新時間：${result.updatedAt ?? '-'}`
  }
  if (intent.name === 'attendance') {
    // call 你 backend API
    // await markAttendance({ storeId: identity.storeId, classId, student, action: intent.subAction })
    const actionText =
      intent.subAction === 'present' ? '簽到' :
      intent.subAction === 'absent' ? '缺席' : '病假'

    return `已記錄：${student} / ${classId} / ${actionText}`
  }
  return null
}

async function innCallOllama(userText) {
  const prompt = [
    '你係平台 AI 助手，請用繁體中文（香港用語）回覆。而家同你溝通緊嘅係Innpression嘅staff，有全部權限平台開發商。',
    `用戶訊息：${userText}`
  ].join('\n')

  const { data } = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60000 }
  )

  return data?.response?.trim() || '收到。'
}

async function clientCallOllama(userText) {
  const prompt = [
    '你係平台 AI 助手，請用繁體中文（香港用語）簡潔回覆。而家同你溝通緊嘅係，只可以管理相關Collection。',
    `用戶訊息：${userText}`
  ].join('\n')

  const { data } = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60000 }
  )

  return data?.response?.trim() || '收到。'
}

async function userCallOllama(userText) {
  const prompt = [
    '你係平台 AI 助手，請用繁體中文（香港用語）簡潔回覆。',
    `用戶訊息：${userText}`
  ].join('\n')

  const { data } = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60000 }
  )

  return data?.response?.trim() || '收到。'
}

async function getOrderStatus(orderId, user) {
  const parsed = OrderInput.parse({ orderId })
  const { data } = await axios.get(`${API_BASE}/orders/${encodeURIComponent(parsed.orderId)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 15000
  })
  return data
}

function extractText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  ).trim()
}

function normalizeMsisdn(remoteJid) {
  // e.g. 85212345678@s.whatsapp.net -> 85212345678
  return remoteJid.split('@')[0]
}

start()