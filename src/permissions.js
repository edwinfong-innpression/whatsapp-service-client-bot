import { ROLE } from './config.js'

// ---- 權限detection ----
export async function authorizeTool(identity, intent) {
  // 權限控制：例如 store_user 只可查自己店舖資料
  if (intent.name === 'refund' && identity === ROLE.STORE_USER) {
    return { ok: false, reason: '你目前權限未能直接查退款，請聯絡店舖管理員。' }
  }
  return { ok: true }
}
