import 'dotenv/config'
import { log } from './src/config.js'
import { start } from './src/whatsapp.js'
import { getStore } from './src/stores.js'

const storeId = process.env.STORE_ID
const store = getStore(storeId)
const phone = process.env.STORE_PHONE
if (!store || (phone && store.phone !== phone)) {
  log.error({ storeId }, 'unknown store')
  process.exit(1)
}
start({ storeId, authDir: store.authDir })
