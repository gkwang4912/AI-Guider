import os
import uuid
import tempfile
import urllib.parse
import base64
import requests
from flask import Flask, request, jsonify, send_file, Response, make_response
from flask_cors import CORS

# 從 gemini_chat 匯入功能
from gemini_chat import APIKeyManager, load_config, chat_with_retry

# 串流 TTS 模組
from xtts_v2 import XTTSStreamingTTS

app = Flask(__name__)
# 允許所有來源的 CORS（包括 file:// 和 null origin）
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "ngrok-skip-browser-warning"],
        "expose_headers": ["X-AI-Response", "Transfer-Encoding"],
        "supports_credentials": False
    }
})


# 手動處理 CORS（確保 ngrok 環境下也能正常工作）
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.add('Access-Control-Expose-Headers', 'X-AI-Response, X-Estimated-Chunks, Transfer-Encoding')
    return response


# 處理 OPTIONS preflight 請求
@app.route('/api/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    response = make_response()
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.add('Access-Control-Expose-Headers', 'X-AI-Response, X-Estimated-Chunks, Transfer-Encoding')
    return response

# 初始化 Gemini
key_manager = APIKeyManager()
config = load_config()

# 初始化串流 TTS
device = None  # 自動偵測
print("[TTS] 正在載入 XTTS v2 串流模型...")
tts_model = XTTSStreamingTTS(device=device)
device = tts_model.device
print("[TTS] 模型載入完成！")

# 設定參考語音檔案路徑
SPEAKER_WAV = os.path.join(os.path.dirname(__file__), "Morgan Freeman.wav")

# 預先計算說話者特徵（加速後續推理）
print("[TTS] 預先計算說話者特徵...")
_speaker_embedding = tts_model.get_speaker_embedding_dict(SPEAKER_WAV)
print("[TTS] 說話者特徵已緩存！")

# 輸出資料夾
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def generate_speech(text: str, output_path: str) -> str:
    """將文字轉換成語音（一次性生成）"""
    tts_model.tts_to_file(
        text=text,
        speaker_wav=SPEAKER_WAV,
        output_path=output_path,
        language="zh-cn"
    )
    return output_path


def generate_speech_streaming(text: str, stream_chunk_size: int = 20):
    """
    串流生成語音
    
    Args:
        text: 要轉換的文字
        stream_chunk_size: 串流區塊大小（越小延遲越低）
        
    Yields:
        音訊區塊位元組
    """
    yield from tts_model.tts_stream(
        text=text,
        speaker_wav=SPEAKER_WAV,
        language="zh-cn",
        stream_chunk_size=stream_chunk_size,
        add_wav_header=True
    )


@app.route("/api/chat", methods=["POST"])
def chat_and_speak():
    """
    接收用戶文字，透過 Gemini 生成回應，再轉成語音回傳
    
    Request JSON:
    {
        "text": "用戶的問題或提示詞"
    }
    
    Response: 語音檔案 (audio/wav)
    """
    try:
        # 取得請求資料
        data = request.get_json()
        
        if not data or "text" not in data:
            return jsonify({"error": "請提供 'text' 欄位"}), 400
        
        user_text = data["text"].strip()
        
        if not user_text:
            return jsonify({"error": "文字內容不可為空"}), 400
        
        print(f"[請求] 收到文字: {user_text[:50]}...")
        
        # 步驟 1: 呼叫 Gemini 取得回應
        print("[Gemini] 正在生成回應...")
        ai_response = chat_with_retry(key_manager, config, user_text)
        print(f"[Gemini] 回應: {ai_response[:100]}...")
        
        # 步驟 2: 將回應轉成語音
        print("[TTS] 正在生成語音...")
        output_filename = f"output_{uuid.uuid4().hex[:8]}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        generate_speech(ai_response, output_path)
        print(f"[TTS] 語音已生成: {output_path}")
        
        # 步驟 3: 回傳語音檔案
        return send_file(
            output_path,
            mimetype="audio/wav",
            as_attachment=True,
            download_name=output_filename
        )
        
    except Exception as e:
        print(f"[錯誤] {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat/json", methods=["POST"])
def chat_and_speak_json():
    """
    同上，但回傳 JSON 格式（包含文字回應和語音檔案路徑）
    
    Request JSON:
    {
        "text": "用戶的問題或提示詞"
    }
    
    Response JSON:
    {
        "user_text": "用戶輸入",
        "ai_response": "AI 回應",
        "audio_file": "語音檔案路徑"
    }
    """
    try:
        data = request.get_json()
        
        if not data or "text" not in data:
            return jsonify({"error": "請提供 'text' 欄位"}), 400
        
        user_text = data["text"].strip()
        
        if not user_text:
            return jsonify({"error": "文字內容不可為空"}), 400
        
        print(f"[請求] 收到文字: {user_text[:50]}...")
        
        # 呼叫 Gemini
        print("[Gemini] 正在生成回應...")
        ai_response = chat_with_retry(key_manager, config, user_text)
        print(f"[Gemini] 回應: {ai_response[:100]}...")
        
        # 轉成語音
        print("[TTS] 正在生成語音...")
        output_filename = f"output_{uuid.uuid4().hex[:8]}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        generate_speech(ai_response, output_path)
        print(f"[TTS] 語音已生成: {output_path}")
        
        return jsonify({
            "user_text": user_text,
            "ai_response": ai_response,
            "audio_file": output_path,
            "audio_url": f"/api/audio/{output_filename}"
        })
        
    except Exception as e:
        print(f"[錯誤] {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/audio/<filename>", methods=["GET"])
def get_audio(filename):
    """取得語音檔案"""
    audio_path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype="audio/wav")
    return jsonify({"error": "檔案不存在"}), 404


@app.route("/api/chat/stream", methods=["POST"])
def chat_and_speak_stream():
    """
    串流版本：接收用戶文字，透過 Gemini 生成回應，再串流回傳語音
    
    這個端點會立即開始回傳音訊資料，減少首次響應時間。
    
    Request JSON:
    {
        "text": "用戶的問題或提示詞",
        "stream_chunk_size": 20  // 可選，越小延遲越低（預設 20）
    }
    
    Response: 串流音訊資料 (audio/wav)
    """
    try:
        data = request.get_json()
        
        if not data or "text" not in data:
            return jsonify({"error": "請提供 'text' 欄位"}), 400
        
        user_text = data["text"].strip()
        stream_chunk_size = data.get("stream_chunk_size", 20)
        
        if not user_text:
            return jsonify({"error": "文字內容不可為空"}), 400
        
        print(f"[請求-串流] 收到文字: {user_text[:50]}...")
        
        # 呼叫 Gemini 取得回應
        print("[Gemini] 正在生成回應...")
        ai_response = chat_with_retry(key_manager, config, user_text)
        print(f"[Gemini] 回應: {ai_response[:100]}...")
        
        # 預估 chunk 數量（根據文字長度）
        # XTTS 大約每 stream_chunk_size 個 tokens 產生一個 chunk
        # 中文字符約等於 1 token，加上一些額外的處理
        text_length = len(ai_response)
        # 經驗公式：每 10-15 個字符約產生一個 chunk (stream_chunk_size=20 時)
        estimated_chunks = max(5, int(text_length / 10))
        print(f"[TTS] 預估 chunk 數量: {estimated_chunks}")
        
        # 串流回傳語音
        print("[TTS] 開始串流生成語音...")
        
        chunk_count = [0]  # 用 list 來在內部函數中修改
        
        def generate():
            for chunk in generate_speech_streaming(ai_response, stream_chunk_size):
                chunk_count[0] += 1
                yield chunk
            print(f"[TTS] 實際 chunk 數量: {chunk_count[0]}")
        
        return Response(
            generate(),
            mimetype="audio/wav",
            headers={
                "X-AI-Response": urllib.parse.quote(ai_response[:200]),
                "X-Estimated-Chunks": str(estimated_chunks),
                "Transfer-Encoding": "chunked",
                "Access-Control-Expose-Headers": "X-AI-Response, X-Estimated-Chunks"
            }
        )
        
    except Exception as e:
        print(f"[錯誤] {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/tts/stream", methods=["POST"])
def tts_stream_only():
    """
    純 TTS 串流端點：直接將文字轉換為串流語音
    
    Request JSON:
    {
        "text": "要轉換的文字",
        "language": "zh-cn",  // 可選，預設 zh-cn
        "stream_chunk_size": 20  // 可選
    }
    
    Response: 串流音訊資料 (audio/wav)
    """
    try:
        data = request.get_json()
        
        if not data or "text" not in data:
            return jsonify({"error": "請提供 'text' 欄位"}), 400
        
        text = data["text"].strip()
        language = data.get("language", "zh-cn")
        stream_chunk_size = data.get("stream_chunk_size", 20)
        
        if not text:
            return jsonify({"error": "文字內容不可為空"}), 400
        
        print(f"[TTS 串流] 開始處理: {text[:50]}...")
        
        def generate():
            for chunk in tts_model.tts_stream(
                text=text,
                speaker_wav=SPEAKER_WAV,
                language=language,
                stream_chunk_size=stream_chunk_size,
                add_wav_header=True
            ):
                yield chunk
        
        return Response(generate(), mimetype="audio/wav")
        
    except Exception as e:
        print(f"[錯誤] {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/speaker", methods=["GET"])
def get_speaker_embedding():
    """
    取得當前說話者的特徵向量
    
    可用於客戶端快取，後續請求可直接使用這些特徵
    """
    return jsonify(_speaker_embedding)


@app.route("/api/speaker/clone", methods=["POST"])
def clone_speaker():
    """
    從上傳的音訊檔案克隆說話者特徵
    
    Request: multipart/form-data 包含 wav_file
    
    Response JSON:
    {
        "gpt_cond_latent": [...],
        "speaker_embedding": [...]
    }
    """
    try:
        if "wav_file" not in request.files:
            return jsonify({"error": "請上傳 wav_file"}), 400
        
        wav_file = request.files["wav_file"]
        
        # 儲存暫存檔案
        temp_path = os.path.join(tempfile.gettempdir(), f"clone_{uuid.uuid4().hex}.wav")
        wav_file.save(temp_path)
        
        try:
            embedding = tts_model.get_speaker_embedding_dict(temp_path)
            return jsonify(embedding)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except Exception as e:
        print(f"[錯誤] {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """健康檢查"""
    return jsonify({
        "status": "ok",
        "model": config.get("model"),
        "available_keys": key_manager.total_keys,
        "current_key": key_manager.get_current_key_name(),
        "tts_device": device
    })


# ===== 語音識別 (Speech-to-Text) =====
# Google Cloud Speech-to-Text API Key
GOOGLE_STT_API_KEY = "AIzaSyBdg3Ie7FZyo_NDz1i1f97I9O_ylK6oGXE"


@app.route("/api/speech-to-text", methods=["POST"])
def speech_to_text():
    """
    使用 Google Cloud Speech-to-Text API 將音訊轉成文字
    
    Request: 
    - audio file (multipart/form-data) 或
    - JSON with base64 encoded audio
    
    Response:
    {
        "success": true,
        "transcript": "識別的文字",
        "confidence": 0.95
    }
    """
    try:
        audio_content = None
        
        # 方式 1: 從 form-data 取得音訊檔案
        if 'audio' in request.files:
            audio_file = request.files['audio']
            audio_content = base64.b64encode(audio_file.read()).decode('utf-8')
        
        # 方式 2: 從 JSON 取得 base64 編碼的音訊
        elif request.is_json:
            data = request.get_json()
            audio_content = data.get('audio')
        
        if not audio_content:
            return jsonify({"success": False, "error": "請提供音訊資料"}), 400
        
        # 呼叫 Google Cloud Speech-to-Text API
        url = f"https://speech.googleapis.com/v1/speech:recognize?key={GOOGLE_STT_API_KEY}"
        
        payload = {
            "config": {
                "encoding": "WEBM_OPUS",  # WebM Opus 格式（瀏覽器 MediaRecorder 預設）
                "sampleRateHertz": 48000,
                "languageCode": "zh-TW",  # 繁體中文
                "alternativeLanguageCodes": ["zh-CN", "en-US"],  # 備用語言
                "enableAutomaticPunctuation": True,
                "model": "default"
            },
            "audio": {
                "content": audio_content
            }
        }
        
        print("[STT] 正在識別語音...")
        response = requests.post(url, json=payload, timeout=30)
        result = response.json()
        
        if response.status_code != 200:
            error_msg = result.get('error', {}).get('message', '未知錯誤')
            print(f"[STT] API 錯誤: {error_msg}")
            return jsonify({"success": False, "error": error_msg}), 400
        
        # 解析結果
        if 'results' in result and len(result['results']) > 0:
            transcript = result['results'][0]['alternatives'][0]['transcript']
            confidence = result['results'][0]['alternatives'][0].get('confidence', 0)
            print(f"[STT] 識別結果: {transcript} (信心度: {confidence:.2%})")
            
            return jsonify({
                "success": True,
                "transcript": transcript,
                "confidence": confidence
            })
        else:
            print("[STT] 未識別到語音")
            return jsonify({
                "success": True,
                "transcript": "",
                "confidence": 0,
                "message": "未識別到語音"
            })
            
    except requests.exceptions.Timeout:
        return jsonify({"success": False, "error": "語音識別超時"}), 504
    except Exception as e:
        print(f"[STT 錯誤] {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


# ===== 前端頁面 =====
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")


@app.route("/", methods=["GET"])
def serve_frontend():
    """提供前端頁面"""
    html_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(html_path):
        return send_file(html_path)
    else:
        return """
        <html>
        <body style="background:#1a1a2e;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
        <h1>找不到 frontend/index.html</h1>
        </body>
        </html>
        """, 404


@app.route("/<path:filename>", methods=["GET"])
def serve_static(filename):
    """提供靜態檔案 (CSS, JS 等)"""
    file_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        # 設定正確的 MIME 類型
        if filename.endswith('.css'):
            return send_file(file_path, mimetype='text/css')
        elif filename.endswith('.js'):
            return send_file(file_path, mimetype='application/javascript')
        else:
            return send_file(file_path)
    else:
        return jsonify({"error": f"找不到檔案: {filename}"}), 404


if __name__ == "__main__":
    print("=" * 50)
    print("AI 導覽員 API 伺服器 (串流版)")
    print("=" * 50)
    print(f"Gemini 模型: {config.get('model')}")
    print(f"可用 API Keys: {key_manager.total_keys} 個")
    print(f"TTS 裝置: {device}")
    print(f"參考語音: {SPEAKER_WAV}")
    print("=" * 50)
    print("\n啟動伺服器於 http://localhost:5000")
    print("\n可用 API:")
    print("  GET  /               - 前端頁面 ★")
    print("  POST /api/chat         - 傳入文字，回傳語音檔案（一次性）")
    print("  POST /api/chat/json    - 傳入文字，回傳 JSON（含文字和語音路徑）")
    print("  POST /api/chat/stream  - 傳入文字，串流回傳語音（低延遲）★")
    print("  POST /api/tts/stream   - 純 TTS 串流（無 Gemini）★")
    print("  GET  /api/speaker      - 取得說話者特徵向量")
    print("  POST /api/speaker/clone - 上傳音訊克隆說話者")
    print("  GET  /api/health       - 健康檢查")
    print("=" * 50)
    
    app.run(host="0.0.0.0", port=5000, debug=False)
