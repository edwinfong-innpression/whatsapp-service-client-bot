import { log } from '../config.js'

// ---- 身份權限檢測 ----
export async function resolveIdentity(phoneNum) {
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
    log.error({ status: res.status }, 'resolveIdentity HTTP error')
    return null
  }

  // // backend 可能回 JSON string / JSON
  const payload_content = await res.text()
  let payload
  try {
    payload = JSON.parse(payload_content)['result']
    return payload
  } catch {
    log.error({ payload_content }, 'resolveIdentity invalid JSON')
    return null
  }
}
