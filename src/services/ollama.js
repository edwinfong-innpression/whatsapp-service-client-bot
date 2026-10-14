import axios from 'axios'
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from '../config.js'

// ---- AI 生成回覆 ----
export async function callOllama(prompt) {
  const { data } = await axios.post(
    `${OLLAMA_BASE_URL}/api/generate`,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60000 }
  )

  return data?.response?.trim()
}
