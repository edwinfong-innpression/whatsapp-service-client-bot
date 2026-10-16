import { INTENT } from './config.js'
import { getSession, clearSession } from './session.js'
import { callOllama } from './services/ollama.js'
import { aiDetectIntent, aiGeneralChatGuard } from './nlp/ai.js'
import { detectIntentHybrid, needsMoreDetail } from './nlp/intent.js'
import { fillSlotsFromText, extractSlots, missingSlots, mergePreferNonNull, askForMissing } from './nlp/slots.js'
import { authorizeTool } from './permissions.js'
import { executeIntent } from './handlers/index.js'

// ---- 訊息build ----
export async function Message(role ,text, user, senderId) {
  const s = getSession(senderId)
  console.log("getSession",s)

  // 1) 若有 pending intent，優先補資料
  if (s.pendingIntent) {
    const ai2 = await aiDetectIntent(text, role)
    if (ai2?.slots) s.slots = { ...s.slots, ...ai2.slots }
    fillSlotsFromText(s, text) // 你自定：抽 classId/student/action/date...

    const miss = missingSlots(s.pendingIntent, s.slots)
    if (miss.length) return askForMissing(s.pendingIntent, miss), null

    const reply = await executeIntent({"name":s.pendingIntent}, s.slots, user)
    clearSession(senderId)
    return { feed: reply, options: null }
  }

  // const intent = detectIntent(text)
  // 檢測功能
  const intent = await detectIntentHybrid(text, role)
  if (intent.name === 'unsupported') {
    // const buttons = [
    //   {
    //     name: 'quick_reply',
    //     buttonParamsJson: JSON.stringify({
    //       display_text: '查堂',
    //       id: 'check_class'
    //     })
    //   },
    //   {
    //     name: 'quick_reply',
    //     buttonParamsJson: JSON.stringify({
    //       display_text: '報堂',
    //       id: 'apply_class'
    //     })
    //   },
    //   {
    //     name: 'quick_reply',
    //     buttonParamsJson: JSON.stringify({
    //       display_text: '調堂',
    //       id: 'reschedule'
    //     })
    //   },
    //   {
    //     name: 'quick_reply',
    //     buttonParamsJson: JSON.stringify({
    //       display_text: '點名',
    //       id: 'attendance'
    //     })
    //   },
    //   {
    //     name: 'quick_reply',
    //     buttonParamsJson: JSON.stringify({
    //       display_text: '退堂',
    //       id: 'exit_class'
    //     })
    //   }
    // ];
    const buttons = [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: '請選擇',
          sections: [
            {
              title: '選項',
              "rows": [
                {
                  "id":"check_class",
                  "title": "查堂",
                  "description": "",           
                },
                {
                  "id":"apply_class",
                  "title": "報堂",
                  "description": "",           
                },
                {
                  "id":"reschedule",
                  "title": "調堂",
                  "description": "",           
                },
                {
                  "id":"attendance",
                  "title": "點名",
                  "description": "",           
                },
                {
                  "id":"exit_class",
                  "title": "退堂",
                  "description": "",           
                }
              ]
            }
          ]
        })
      }
    ]
    return { feed: '暫時只支援：查堂、報堂、調堂、點名（簽到/缺席/病假）、退堂。', options: buttons }
  }

  // if (intent.name === INTENT.GENERAL_CHAT) {
  //   const prompt = `你係客服助理，用自然廣東話又十分禮貌的語氣簡潔回覆，而且請勿離題回覆平台功能以外資訊。\n用戶訊息：${text}`
  //   const reply = await callOllama(prompt)
  //   return String(reply ?? '收到。').slice(0, 3000)
  // }
  // 如果是沒有對應功能
  if (intent.name === INTENT.GENERAL_CHAT) {
    const guard = await aiGeneralChatGuard(text, role)

    if (!guard.allow && guard.confidence >= 0.6) {
      // const buttons = [
      //   {
      //     name: 'quick_reply',
      //     buttonParamsJson: JSON.stringify({
      //       display_text: '查堂',
      //       id: 'check_class'
      //     })
      //   },
      //   {
      //     name: 'quick_reply',
      //     buttonParamsJson: JSON.stringify({
      //       display_text: '報堂',
      //       id: 'apply_class'
      //     })
      //   },
      //   {
      //     name: 'quick_reply',
      //     buttonParamsJson: JSON.stringify({
      //       display_text: '調堂',
      //       id: 'reschedule'
      //     })
      //   },
      //   {
      //     name: 'quick_reply',
      //     buttonParamsJson: JSON.stringify({
      //       display_text: '點名',
      //       id: 'attendance'
      //     })
      //   },
      //   {
      //     name: 'quick_reply',
      //     buttonParamsJson: JSON.stringify({
      //       display_text: '退堂',
      //       id: 'exit_class'
      //     })
      //   }
      // ];
      const buttons = [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: '請選擇',
            sections: [
              {
                title: '選項',
                "rows": [
                  {
                    "id":"check_class",
                    "title": "查堂",
                    "description": "",           
                  },
                  {
                    "id":"apply_class",
                    "title": "報堂",
                    "description": "",           
                  },
                  {
                    "id":"reschedule",
                    "title": "調堂",
                    "description": "",           
                  },
                  {
                    "id":"attendance",
                    "title": "點名",
                    "description": "",           
                  },
                  {
                    "id":"exit_class",
                    "title": "退堂",
                    "description": "",           
                  }
                ]
              }
            ]
          })
        }
      ]
      return { feed: '我主要協助課堂相關：查堂、報堂、調堂、點名、退堂。你想處理邊一項？', options: buttons }
    }

    const reply = await callOllama(`你係客服助理，用自然廣東話簡潔回覆，請用十分禮貌的語氣。\n用戶訊息：${text}`)
    const buttons = [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: '請選擇',
          sections: [
            {
              title: '選項',
              "rows": [
                {
                  "id":"check_class",
                  "title": "查堂",
                  "description": "",           
                },
                {
                  "id":"apply_class",
                  "title": "報堂",
                  "description": "",           
                },
                {
                  "id":"reschedule",
                  "title": "調堂",
                  "description": "",           
                },
                {
                  "id":"attendance",
                  "title": "點名",
                  "description": "",           
                },
                {
                  "id":"exit_class",
                  "title": "退堂",
                  "description": "",           
                }
              ]
            }
          ]
        })
      }
    ]
    return { feed: String(reply ?? '收到。').slice(0, 3000), options: buttons }
  }

  // init slot
  // 檢查是否有在進行中對話
  const ai = await aiDetectIntent(text, role)
  console.log('[ai]', ai)
  const slotsFromRule = extractSlots(text, intent)
  const slots = mergePreferNonNull(ai?.slots || {}, slotsFromRule)
  console.log('[slots]', slots)

  if (!slots.action && ai?.attendance_action && ai.attendance_action !== 'null') {
    slots.action = ai.attendance_action
  }

  // 是否要補充data
  const miss = missingSlots(intent.name, slots)

  if (miss.length) {
    s.pendingIntent = intent.name
    s.slots = slots
    return { feed: askForMissing(intent.name, miss), options: null }
  }

  // 要求用戶提供什麼data
  const detail = needsMoreDetail(text, intent)
  if (detail.need) {
    console.log('[detail.need]', detail.need)
    return { feed: detail.ask, options: null }
  }

  // 身份detect
  const permit = await authorizeTool(role, intent)
  if (!permit.ok) {
    console.log('[permit.ok]', permit.ok)
    return { feed: permit.reason, options: null }
  }

  // 系統功能執行
  const toolReply = await executeIntent(intent, slots, user)
  if (toolReply) {
    console.log('[toolReply]]', toolReply)
    return { feed: toolReply, options: null }
  }

  // 否則走 LLM（帶角色與邊界）
    // identity.storeId ? `店舖：${identity.storeId}` : '',
  const prompt = [
    `你係客服助理，請用十分禮貌的語氣。使用者角色：${role}。`,
    '規則：如涉及訂單/退款/調堂/退堂等操作，先確認必要資料，不可臆測。而且請勿離題回覆平台功能以外資訊。',
    `用戶訊息：${text}`
  ].filter(Boolean).join('\n')

  const reply = await callOllama(prompt)
  return { feed: reply.slice(0, 3000), options: null }
}
