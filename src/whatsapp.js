import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import { log, ALLOWED_SENDERS } from './config.js'
import { resolveIdentity } from './services/identity.js'
import { Message } from './message.js'
import { toSafeText } from './utils.js'

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
