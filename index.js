import 'dotenv/config'
import express from 'express'
import QRCode from 'qrcode'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { log } from './src/config.js'
import { start } from './src/whatsapp.js'
import { getStore, saveStore, listStores, validId } from './src/stores.js'

const WORKER = fileURLToPath(new URL('./worker.js', import.meta.url))
const links = new Map() // storeId -> { qr, status, sock }

const app = express()
app.use(express.json())
app.get('/health', (_, res) => res.json({ ok: true }))

function startPm2(storeId) {
  const name = `wa-store-${storeId}`
  return new Promise((resolve, reject) => {
    execFile('pm2', ['start', WORKER, '--name', name, '--update-env'],
      { env: { ...process.env, STORE_ID: storeId } },
      (err, stdout, stderr) => err ? reject(new Error(stderr || err.message)) : resolve(name))
  })
}

// Begin linking; returns base64 PNG data URL of the QR for the website
app.post('/stores/:id/link', async (req, res) => {
  const id = req.params.id
  if (!validId(id)) return res.status(400).json({ error: 'invalid store id' })
  if (getStore(id)?.status === 'running') return res.status(409).json({ error: 'already linked' })

  let link = links.get(id)
  if (!link) {
    link = { qr: null, status: 'pending' }
    links.set(id, link)
    link.sock = await start({
      storeId: id,
      reconnect: true,
      onQr: qr => { link.qr = qr },
      onOpen: async sock => {
        try {
          link.status = 'linked'
          const phone = (sock.user?.id || '').split(':')[0].split('@')[0]
          saveStore(id, { id, phone, authDir: `baileys_auth/${id}`, ...(req.body?.config || {}), status: 'linked' })
          // free the linking socket; worker takes over the same auth state
          sock.ev.removeAllListeners()
          sock.end(undefined)
          const pm2Name = await startPm2(id)
          saveStore(id, { status: 'running', pm2Name })
          link.status = 'running'
        } catch (e) {
          link.status = 'error'
          link.error = e.message
          log.error({ id, err: e.message }, 'failed to start store process')
        }
      }
    })
  }

  for (let i = 0; i < 50 && !link.qr && link.status === 'pending'; i++) await new Promise(r => setTimeout(r, 200))
  res.json({ status: link.status, qr: link.qr ? await QRCode.toDataURL(link.qr) : null })
})

app.get('/stores/:id/link', async (req, res) => {
  const link = links.get(req.params.id)
  if (!link) return res.status(404).json({ error: 'no link session' })
  res.json({ status: link.status, error: link.error, qr: link.qr && link.status === 'pending' ? await QRCode.toDataURL(link.qr) : null })
})

app.get('/stores', (_, res) => res.json(listStores()))

app.listen(process.env.PORT || 3000, () => log.info('manager server up'))
