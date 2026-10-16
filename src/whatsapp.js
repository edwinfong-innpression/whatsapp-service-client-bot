import makeWASocket, { useMultiFileAuthState, DisconnectReason, generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import { log, ALLOWED_SENDERS } from './config.js'
import { resolveIdentity } from './services/identity.js'
import { Message } from './message.js'
import { toSafeText } from './utils.js'

function buildListButtons(items) {
  return [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: '請選擇',
        sections: [
          {
            title: '選項',
            rows: items.map((x, i) => ({
              id: x.id || `opt_${i + 1}`,
              title: x.title || x.text || `選項 ${i + 1}`,
              description: x.description || ''
            }))
          }
        ]
      })
    }
  ]
}

function buildQuickReplyButtons(items) {
  return items.slice(0, 3).map((x, i) => ({
    buttonId: x.id || `opt_${i + 1}`,
    buttonText: { displayText: x.title || x.text || `選項 ${i + 1}` },
    type: 1
  }))
}

function buildPlainText(text, items) {
  const lines = items.map((x, i) => `${i + 1}) ${x.title || x.text || x.id || `選項 ${i + 1}`}`)
  return `${text}\n\n請直接回覆：\n${lines.join('\n')}`
}

async function sendInteractiveList(sock, jid, text, items) {
  const options = buildListButtons(items)

  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: { text: text || '請選擇' },
            footer: { text: 'Innpression Bot' },
            header: { title: '主選單', hasMediaAttachment: false },
            nativeFlowMessage: { buttons: options }
          })
        }
      }
    },
    {}
  )

  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
}

async function sendQuickReply(sock, jid, text, items) {
  const buttons = buildQuickReplyButtons(items)
  await sock.sendMessage(jid, {
    text: text || '請選擇',
    buttons,
    headerType: 1
  })
}

export async function sendMenu(sock, jid, jidAlt, text, items) {
  const sendJid = (jidAlt && jidAlt.endsWith('@s.whatsapp.net')) ? jidAlt : jid
  const normalized = Array.isArray(items) ? items : []

  if (!normalized.length) {
    await sock.sendMessage(sendJid, { text: text || '收到' })
    return
  }

  // Level 1: list
  try {
    await sendInteractiveList(sock, sendJid, text, normalized)
    return
  } catch (e1) {
    console.warn('[menu fallback] list failed:', e1?.message || e1)
  }

  // Level 2: quick reply (最多 3 粒)
  try {
    await sendQuickReply(sock, sendJid, text, normalized)
    return
  } catch (e2) {
    console.warn('[menu fallback] quick_reply failed:', e2?.message || e2)
  }

  // Level 3: plain text
  await sock.sendMessage(sendJid, {
    text: buildPlainText(text || '請選擇', normalized)
  })
}

export async function start() {
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
      
      let { feed, options } = await Message(user.user_type, text, user, senderId);
      const safeReply = toSafeText(feed).trim()
      console.log('[feed]', feed)
      console.log('[options]', options)
      console.log('[safeReply]', safeReply)
      if(options != null){
        await sendMenu(sock, jid, jidAlt, safeReply, options)
      } else {
        await sock.sendMessage(jid, { text: safeReply.slice(0, 3000) })
      }

      if (!text) {
        continue
      }
    }
  })
}
