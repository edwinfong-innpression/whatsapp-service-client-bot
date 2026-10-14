import 'dotenv/config'
import express from 'express'
import { log } from './src/config.js'
import { start } from './src/whatsapp.js'

const app = express()
app.get('/health', (_, res) => res.json({ ok: true }))
app.listen(process.env.PORT || 3000, () => log.info('health server up'))

start()
