import json
import google.generativeai as genai


class APIKeyManager:
    """API Key 輪詢管理器"""
    
    def __init__(self, api_file: str = "api_keys.json"):
        self.api_file = api_file
        self.api_keys = self._load_api_keys()
        self.current_index = 0
        self.total_keys = len(self.api_keys)
    
    def _load_api_keys(self) -> list:
        """從 api_keys.json 載入所有 API keys"""
        with open(self.api_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["api_keys"]
    
    def get_current_key(self) -> str:
        """取得目前的 API key"""
        return self.api_keys[self.current_index]["key"]
    
    def get_current_key_name(self) -> str:
        """取得目前的 API key 名稱"""
        return self.api_keys[self.current_index]["name"]
    
    def rotate_key(self):
        """切換到下一個 API key"""
        self.current_index = (self.current_index + 1) % self.total_keys
        print(f"[輪詢] 切換至 {self.get_current_key_name()}")
    
    def get_key_with_retry(self) -> str:
        """取得 API key，如果需要則輪詢"""
        return self.get_current_key()


def load_config(config_file: str = "config.json") -> dict:
    """從 config.json 載入設定"""
    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)
    return config


def create_gemini_model(api_key: str, config: dict):
    """建立並設定 Gemini 模型"""
    # 設定 API key
    genai.configure(api_key=api_key)
    
    # 設定生成參數
    generation_config = genai.GenerationConfig(
        temperature=config.get("temperature", 0.7),
        max_output_tokens=config.get("max_output_tokens", 2048),
        top_p=config.get("top_p", 0.95),
        top_k=config.get("top_k", 40),
    )
    
    # 建立模型
    model = genai.GenerativeModel(
        model_name=config.get("model", "gemini-2.0-flash"),
        generation_config=generation_config,
        system_instruction=config.get("system_prompt", ""),
    )
    
    return model


def chat_with_gemini(model, user_message: str) -> str:
    """與 Gemini 進行對話"""
    response = model.generate_content(user_message)
    return response.text


def chat_with_retry(key_manager: APIKeyManager, config: dict, user_message: str, max_retries: int = None) -> str:
    """帶有自動輪詢重試的對話功能"""
    last_error = None
    
    # 預設輪詢所有可用的 API keys
    if max_retries is None:
        max_retries = key_manager.total_keys
    
    for attempt in range(max_retries):
        try:
            api_key = key_manager.get_current_key()
            model = create_gemini_model(api_key, config)
            response = chat_with_gemini(model, user_message)
            return response
        except Exception as e:
            last_error = e
            error_msg = str(e).lower()
            
            # 檢查是否為配額或速率限制錯誤
            if "quota" in error_msg or "rate" in error_msg or "limit" in error_msg or "429" in error_msg or "resource" in error_msg:
                print(f"[警告] {key_manager.get_current_key_name()} 已達限制，嘗試切換...")
                key_manager.rotate_key()
            else:
                # 其他錯誤直接拋出
                raise e
    
    raise Exception(f"所有 API keys 都已嘗試失敗。最後錯誤: {last_error}")


def main():
    # 載入設定
    key_manager = APIKeyManager()
    config = load_config()
    
    print("=" * 50)
    print("AI 導覽員系統")
    print("=" * 50)
    print(f"使用模型: {config.get('model')}")
    print(f"溫度設定: {config.get('temperature')}")
    print(f"可用 API Keys: {key_manager.total_keys} 個")
    print(f"目前使用: {key_manager.get_current_key_name()}")
    print("=" * 50)
    
    # 開始對話
    print("\n歡迎使用 AI 導覽員！輸入 'quit' 或 'exit' 結束對話。\n")
    
    while True:
        user_input = input("你: ").strip()
        
        if user_input.lower() in ["quit", "exit", "q"]:
            print("感謝使用，再見！")
            break
        
        if not user_input:
            continue
        
        try:
            response = chat_with_retry(key_manager, config, user_input)
            print(f"\nAI 導覽員: {response}\n")
        except Exception as e:
            print(f"\n錯誤: {e}\n")


if __name__ == "__main__":
    main()
