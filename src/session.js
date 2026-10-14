export const sessions = new Map() // key: senderId

// ---- User Session Functions ----

// ---- 用戶對話 Storage ----
export function getSession(senderId) {
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
export function clearSession(senderId) {
  sessions.delete(senderId)
}
