import fs from 'node:fs'

const FILE = process.env.STORES_FILE || 'stores.json'

export const validId = id => /^[A-Za-z0-9_-]{1,64}$/.test(id || '')

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}
export const listStores = read
export const getStore = id => read()[id]
export function saveStore(id, patch) {
  const all = read()
  all[id] = { ...(all[id] || {}), ...patch }
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2))
  return all[id]
}
