# AI-Guider (Code Alchemist)

## 1. 專案總覽 (Project Overview)
**AI-Guider** 是一個整合即時語音識別 (STT)、大型語言模型 (LLM) 與語音合成 (TTS) 的全端 AI 互動應用程式。
本專案旨在提供一個低延遲、具備豐富視覺效果（駭客任務風格）的語音對話系統，讓使用者能以自然的口語與 AI 導覽員進行互動。

- **解決問題**：傳統文字聊天介面缺乏互動感，且即時語音對話常受限於延遲與機械音。本專案透過串流技術與高品質 TTS 解決此問題。
- **目標用戶**：需要展示 AI 語音互動能力的開發者、展場導覽系統、或對語音助理有興趣的技術人員。
- **類型**：Web Application (Client-Server 架構)。

## 2. 專案架構總覽 (Architecture Overview)
本系統採用前後端分離架構，但由後端統一提供靜態檔案服務。

*   **前端 (Frontend)**：
    *   負責介面呈現、動畫 (Canvas) 與使用者輸入。
    *   使用瀏覽器原生的 **Web Speech API** 進行語音識別 (STT)，將使用者語音轉為文字。
    *   透過 API 發送文字給後端，並接收回傳的音訊串流進行播放。
*   **後端 (Backend)**：
    *   基於 **Flask** 框架。
    *   **對話引擎**：整合 **Google Gemini** 模型，負責生成自然語言回應。
    *   **語音合成**：整合 **XTTS v2** 模型，支援串流 (Streaming) 輸出，大幅降低首字延遲 (Time-to-First-Byte)。
    *   包含 API Key 管理機制，確保高併發時的穩定性。

**資料流**：
1.  [前端] 麥克風收音 -> Web Speech API -> 文字
2.  [前端] POST `/api/chat/stream` (帶文字) -> [後端]
3.  [後端] Gemini 生成回應文字 -> XTTS 轉換音訊 (Streaming) -> [前端]
4.  [前端] 接收音訊 Chunk -> 即時播放

## 3. 資料夾結構說明 (Folder Structure)

```text
.
├── backend/                  # 後端核心程式碼
│   ├── __pycache__/         # Python 編譯快取
│   ├── outputs/             # (自動產生) 存放生成的 .wav 音訊檔
│   ├── api_keys.json        # Google Gemini API Keys 設定檔
│   ├── config.json          # AI 模型參數與 System Prompt 設定
│   ├── gemini_chat.py       # Gemini 模型串接與 API Key 輪詢邏輯
│   ├── Morgan Freeman.wav   # XTTS 用於聲音克隆的參考樣本
│   ├── requirements.txt     # Python 相依套件清單
│   ├── server.py            # Flask 伺服器入口點 (Entry Point)
│   ├── xtts_v2.py           # XTTS v2 模型封裝與串流邏輯
│   └── 指令.txt              # 備忘指令 (如 ngrok)
└── frontend/                 # 前端靜態資源
    ├── app.js               # 前端主要邏輯 (錄音、動畫、API 呼叫)
    ├── index.html           # 主頁面結構
    ├── sora_loop.mp4        # 待機或處理中播放的背景影片
    └── styles.css           # 樣式表 (Matrix 風格設計)
```

## 4. 核心模組與重要檔案說明 (Key Modules & Files)

### Backend
*   **`server.py`**:
    *   專案入口。啟動 Flask Server，設定 CORS。
    *   提供 `/api/chat/stream` 等核心端點。
    *   會在啟動時預先載入 XTTS 模型與計算 Speaker Embedding。
    *   同時負責 serve `frontend/` 下的靜態檔案 (為了簡化部署)。
*   **`xtts_v2.py`**:
    *   封裝 `coqui-tts` 的 `Xtts` 模型。
    *   `XTTSStreamingTTS` 類別：實作了 `tts_stream` generator，能產生 byte chunks 供 Flask 串流回傳。
    *   **重要**：針對 Windows 環境已強制關閉 DeepSpeed (`use_deepspeed=False`) 以避免相容性問題。
*   **`gemini_chat.py`**:
    *   封裝 `google.generativeai`。
    *   `APIKeyManager` 類別：讀取 `api_keys.json`，實作 Round-Robin (輪詢) 機制，當某 Key 超額時自動切換。
    *   `chat_with_retry` 函式：包含錯誤重試邏輯。

### Frontend
*   **`app.js`**:
    *   `initSpeechRecognition()`: 初始化瀏覽器 STT。
    *   `AppState`: 管理狀態機 (IDLE, RECORDING, PROCESSING, PLAYING)。
    *   `MatrixBackground`: Canvas 繪製駭客任務背景動畫。
    *   `VisualizationAnimator`: 繪製錄音與播放時的聲波/視覺效果，以及隱藏的 **Snake Game** (貪吃蛇)。
*   **`index.html`**:
    *   包含所有 UI 元素的 DOM 結構。引用了 Google Fonts (Roboto Mono, Bebas Neue)。

## 5. 安裝與環境需求 (Installation & Requirements)

### 系統需求
*   **OS**: Windows / Linux / macOS (本專案已針對 Windows 優化)
*   **Python**: 3.10 或更高版本 (建議使用虛擬環境)
*   **GPU**: 強烈建議具備 NVIDIA GPU (CUDA 支援)，否則 XTTS 生成速度會極慢。

### 安裝步驟
1.  **安裝 Python 相依套件**
    ```bash
    cd backend
    pip install -r requirements.txt
    ```
    *注意：若安裝 `coqui-tts` 遇到問題，請參考其官方文檔解決 PyTorch 版本相容性。*

2.  **設定 API Keys**
    *   編輯 `backend/api_keys.json`，填入有效的 Google Gemini API Keys。

### 環境變數
*   本專案主要依賴 `config.json` 與 `api_keys.json`，不強制依賴系統環境變數。

## 6. 使用方式 (How to Use)

### 啟動服務
1.  開啟終端機，進入 `backend` 資料夾：
    ```bash
    cd backend
    ```
2.  執行 Server：
    ```bash
    python server.py
    ```
    *首次執行會自動下載 XTTS 模型 (約數 GB)，請耐心等待。*

3.  看見以下訊息即啟動成功：
    ```text
    啟動伺服器於 http://localhost:5000
    ```

### 操作流程
1.  瀏覽器打開 `http://localhost:5000` (建議使用 Chrome 以獲得最佳 Web Speech API 支援)。
2.  允許麥克風權限。
3.  點擊畫面中央紅色的 **"PRESS TO RECORD"** 按鈕（或按住不放，視 app.js 邏輯而定，目前設為點擊切換）。
4.  說話 (例如：「你好，請介紹你自己」)。
5.  等待 AI 處理，語音將會自動播放。

## 7. 設定說明 (Configuration)

*   **`backend/config.json`**:
    *   `model`: 指定 Gemini 模型版本 (如 `gemini-2.0-flash`)。
    *   `system_prompt`: 定義 AI 的人格設定 (目前設定為自然口語、台灣用語)。
    *   `temperature`: 控制回應創造性 (0 為最穩定)。

*   **`backend/api_keys.json`**:
    *   `api_keys`: 陣列結構，可填入多組 Key 做負載平衡。

*   **`backend/server.py`**:
    *   `SPEAKER_WAV`: 指定 TTS 模仿的聲音樣本，預設為 `Morgan Freeman.wav`。

## 8. 開發者指南 (Developer Guide)

### 新人上手建議
1.  先確認 Backend 能夠獨立運作。可使用 Postman 測試 `POST http://localhost:5000/api/chat`。
2.  XTTS 模型載入極吃記憶體，開發時請關閉不必要的應用程式。
3.  前端動畫邏輯位於 `app.js` 的 `VisualizationAnimator` 類別，修改視覺效果請由此下手。

### 常見雷區
*   **CORS 問題**：雖然 `server.py` 已設定 CORS，但在某些複雜網路環境 (ngrok) 下可能需手動調整 header。
*   **瀏覽器 STT 限制**：Web Speech API 在非 Chrome 瀏覽器 (如 Firefox/Safari) 支援度不佳，甚至無法使用。
*   **Windows 路徑**：Python 處理路徑時建議使用 `os.path.join`，避免斜線問題。

## 9. 已知限制與待辦事項 (Limitations & TODO)

*   **限制 (Limitations)**:
    *   **STT 依賴性**：完全依賴客戶端瀏覽器的 STT 能力，若環境吵雜或瀏覽器不支援則無法輸入。
    *   **初次延遲**：XTTS 模型即使在 GPU 上，首句生成仍有輕微延遲。
    *   **單一語者**：目前 TTS 鎖定使用 `Morgan Freeman.wav` 的特徵，未開放前端動態切換語者。

*   **待辦事項 (TODO)**:
    *   [ ] 實作後端 Whisper STT 以取代不穩定的瀏覽器原生 STT。
    *   [ ] 新增前端上傳音訊樣本以「複製聲音 (Clone Voice)」的功能 UI (後端 API 已預留 `/api/speaker/clone`)。
    *   [ ] 優化 `gemini_chat.py` 的錯誤處理，增加網路斷線重連機制。
    *   [ ] 前端增加對話歷史紀錄清單。

## 10. 補充說明 (Notes)

*   **關於 XTTS v2**: 這是一個多語言模型，支援中文 (zh-cn)，但因訓練資料特性，有時口音會偏向大陸腔調，可透過 Prompt 調整或更換微調模型改善。
*   **ngrok 使用**: 若需開放外網存取 (HTTPS)，可參考 `backend/指令.txt` 中的指令：
    `ngrok http 5000 --url=polite-in-redfish.ngrok-free.app`
    這是因為 Web Speech API 在非 localhost 的 HTTP 環境下會被瀏覽器阻擋，必須走 HTTPS。
