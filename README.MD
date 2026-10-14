# WhatsApp Service Bot

An English and Traditional Chinese guide to the WhatsApp service bot. The bot connects to WhatsApp, identifies incoming users through a backend service, interprets messages about classes, and uses Ollama for language understanding and replies.

## Contents

- [English](#english)
- [繁體中文](#繁體中文)

## English

### What it does

- Connects to WhatsApp using Baileys. On first launch, scan the displayed QR code with WhatsApp.
- Checks a sender's identity through the configured service backend before processing messages.
- Uses keyword rules and Ollama to interpret messages and collect missing details.
- Currently registers handlers for **class lookup** and **attendance**. Other intents can be recognized, but are not connected to action handlers yet.
- Provides a health endpoint at `/health`.

### Requirements

- Node.js and npm.
- An Ollama server with a model available for the bot to use.
- Access to the service backend used for sender identity and class data.

### Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Set the following variables in your local `.env` file:

   ```dotenv
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=your-model-name
   PORT=3000
   ```

   `OLLAMA_BASE_URL` should be the Ollama server's base URL; the bot sends generation requests to `/api/generate`. Use a model name already available on that server.

3. Start Ollama and ensure the configured model is available.

4. Start the bot:

   ```sh
   npm start
   ```

5. On the first launch, scan the QR code printed in the terminal with WhatsApp. The bot logs when the WhatsApp connection is open. Check `http://localhost:3000/health` (or the port you configured) for `{"ok":true}`.

### Configuration and backend notes

| Setting | Purpose |
| --- | --- |
| `OLLAMA_BASE_URL` | Base URL for the Ollama server. |
| `OLLAMA_MODEL` | Model name used for message interpretation and replies. |
| `PORT` | Health server port; defaults to `3000`. |
| `SYSTEM_API_BASE_URL`, `SYSTEM_API_KEY` | Read by the configuration module, but not currently used by the implemented request handlers. |
| `ALLOWED_SENDERS`, `ALLOWED_PHONES` | Parsed by the configuration module, but not currently enforced as access controls. |

The identity check currently posts to the development backend URL defined in `src/services/identity.js`. The class lookup handler selects a backend URL using the first entry in the identity response's `collections` field. Supported keys in `src/config.js` are `dev`, `uat`, and `t61`; confirm that the identity service returns the appropriate key.

### Project map

| Path | Responsibility |
| --- | --- |
| `index.js` | Starts the health endpoint and WhatsApp connection. |
| `src/whatsapp.js` | Connects to WhatsApp, receives messages, and sends replies. |
| `src/services/identity.js` | Resolves a sender through the identity backend. |
| `src/message.js` | Coordinates intent detection, missing details, authorization, and replies. |
| `src/nlp/` | Keyword/AI intent detection and slot extraction. |
| `src/services/ollama.js` | Sends prompts to Ollama. |
| `src/handlers/` | Business actions; currently class lookup and attendance are registered. |
| `src/config.js` | Environment variables, intent constants, and backend URL mapping. |

### Adding a supported action

Implement the action in a handler under `src/handlers/`, then register its intent in `src/handlers/index.js`. Review the intent detection, required slots, permissions, and any backend calls needed for the action.

### Security and troubleshooting

- Keep `.env` values and the generated `baileys_auth_info/` WhatsApp credentials private. Do not commit credentials or real user contact data.
- If the bot cannot generate a response, verify that Ollama is running, the URL is reachable from the bot, and the configured model is installed.
- If WhatsApp does not connect, scan the displayed QR code or check that the saved authentication state is valid.
- If class lookup fails, check the identity response's `collections` value and backend availability.
- The package's `test` script is currently a placeholder; no automated test suite is configured.

## 繁體中文

### 專案功能

- 使用 Baileys 連接 WhatsApp。首次啟動時，請用 WhatsApp 掃描終端機顯示的 QR code。
- 透過後端服務確認發訊者身份，之後才處理訊息。
- 結合關鍵字規則及 Ollama 理解訊息，並在資料不足時向用戶追問。
- 目前已登記的功能處理器只有**查堂**及**點名**。其他意圖雖然可能被識別，但尚未連接實際功能處理器。
- 提供 `/health` 健康檢查端點。

### 需要準備

- Node.js 及 npm。
- 一個已啟動並有可用模型的 Ollama 服務。
- 可連接身份及課堂資料後端的網絡環境。

### 安裝及啟動

1. 安裝依賴套件：

   ```sh
   npm install
   ```

2. 在本機 `.env` 檔案設定以下變數：

   ```dotenv
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=your-model-name
   PORT=3000
   ```

   `OLLAMA_BASE_URL` 是 Ollama 服務的根網址；程式會向其 `/api/generate` 發送生成請求。`OLLAMA_MODEL` 必須是該 Ollama 服務已安裝的模型名稱。

3. 啟動 Ollama，並確認指定模型可用。

4. 啟動機械人：

   ```sh
   npm start
   ```

5. 首次啟動時，用 WhatsApp 掃描終端機印出的 QR code。WhatsApp 連線成功後，程式會記錄連線狀態。可開啟 `http://localhost:3000/health`（或你設定的連接埠），確認回應為 `{"ok":true}`。

### 設定及後端備註

| 設定 | 用途 |
| --- | --- |
| `OLLAMA_BASE_URL` | Ollama 服務的根網址。 |
| `OLLAMA_MODEL` | 用於理解訊息及生成回覆的模型名稱。 |
| `PORT` | 健康檢查服務的連接埠；預設為 `3000`。 |
| `SYSTEM_API_BASE_URL`、`SYSTEM_API_KEY` | 設定模組會讀取這兩個值，但目前已實作的請求處理器尚未使用。 |
| `ALLOWED_SENDERS`、`ALLOWED_PHONES` | 設定模組會解析這兩個值，但目前並未用作存取控制。 |

目前身份檢查會呼叫 `src/services/identity.js` 中設定的開發環境後端網址。查堂處理器會使用身份回應中 `collections` 欄位的第一個值選擇後端；`src/config.js` 支援 `dev`、`uat` 及 `t61`，請確認身份服務回傳正確的值。

### 專案檔案導覽

| 路徑 | 職責 |
| --- | --- |
| `index.js` | 啟動健康檢查端點及 WhatsApp 連線。 |
| `src/whatsapp.js` | 連接 WhatsApp、接收訊息及發送回覆。 |
| `src/services/identity.js` | 透過身份後端查詢發訊者身份。 |
| `src/message.js` | 協調意圖識別、補充資料、權限檢查及回覆。 |
| `src/nlp/` | 關鍵字／AI 意圖識別及資料欄位擷取。 |
| `src/services/ollama.js` | 向 Ollama 發送提示內容。 |
| `src/handlers/` | 業務功能；目前已登記查堂及點名處理器。 |
| `src/config.js` | 環境變數、意圖常數及後端網址對應。 |

### 新增功能

在 `src/handlers/` 建立功能處理器，並在 `src/handlers/index.js` 登記對應意圖。亦需檢查意圖識別、必需資料欄位、權限規則，以及功能所需的後端請求。

### 安全及常見問題

- `.env` 設定值及程式產生的 `baileys_auth_info/` WhatsApp 登入憑證必須保密；不要提交憑證或真實用戶聯絡資料。
- 如果無法生成回覆，請確認 Ollama 正在運作、機械人可連接設定的網址，而且指定模型已安裝。
- 如果 WhatsApp 無法連線，請掃描顯示的 QR code，或確認已儲存的登入狀態有效。
- 如果查堂失敗，請檢查身份服務回傳的 `collections` 值及後端服務狀態。
- 套件中的 `test` 指令目前只是佔位內容，專案尚未設定自動化測試。
