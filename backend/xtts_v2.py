"""
XTTS v2 串流音訊生成模組

此模組提供 XTTS v2 模型的串流音訊生成功能，
支援即時產生音訊區塊，減少首次響應時間。

參考: https://github.com/coqui-ai/xtts-streaming-server

注意: 需要 transformers==4.40.0 以確保與 TTS 庫的 stream_generator 兼容
"""

import os
import io
import wave
import torch
import numpy as np
from typing import Iterator, Optional, List, Tuple

from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
from TTS.utils.generic_utils import get_user_data_dir
from TTS.utils.manage import ModelManager


class XTTSStreamingTTS:
    """
    XTTS v2 串流 TTS 類別
    
    提供串流和非串流兩種音訊生成方式。
    """
    
    def __init__(
        self,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        use_deepspeed: bool = False  # Windows 上建議設為 False
    ):
        """
        初始化 XTTS 模型
        
        Args:
            model_path: 自訂模型路徑，若為 None 則使用預設模型
            device: 運算裝置 ("cuda" 或 "cpu")，若為 None 則自動偵測
            use_deepspeed: 是否使用 DeepSpeed 加速 (Windows 不支援，建議設 False)
        """
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[XTTS] 使用裝置: {self.device}")
        
        # 載入模型
        if model_path and os.path.exists(os.path.join(model_path, "config.json")):
            print(f"[XTTS] 載入自訂模型: {model_path}")
            self.model_path = model_path
        else:
            print("[XTTS] 下載並載入預設模型...")
            model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
            ModelManager().download_model(model_name)
            self.model_path = os.path.join(
                get_user_data_dir("tts"),
                model_name.replace("/", "--")
            )
            print(f"[XTTS] 模型路徑: {self.model_path}")
        
        # 初始化設定和模型
        print("[XTTS] 正在載入模型...")
        self.config = XttsConfig()
        self.config.load_json(os.path.join(self.model_path, "config.json"))
        
        self.model = Xtts.init_from_config(self.config)
        
        # Windows 上不支援 DeepSpeed，直接禁用
        self.model.load_checkpoint(
            self.config,
            checkpoint_dir=self.model_path,
            eval=True,
            use_deepspeed=False  # 禁用 DeepSpeed 以避免 Windows 相容性問題
        )
        self.model.to(self.device)
        print("[XTTS] 模型載入完成！")
        
        # 緩存說話者特徵
        self._speaker_cache: dict = {}
    
    def get_conditioning_latents(
        self,
        speaker_wav: str,
        use_cache: bool = True
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        從參考音訊計算說話者條件向量
        
        Args:
            speaker_wav: 參考語音檔案路徑
            use_cache: 是否使用緩存
            
        Returns:
            (gpt_cond_latent, speaker_embedding) 元組
        """
        cache_key = os.path.abspath(speaker_wav)
        
        if use_cache and cache_key in self._speaker_cache:
            print(f"[XTTS] 使用緩存的說話者特徵: {speaker_wav}")
            return self._speaker_cache[cache_key]
        
        print(f"[XTTS] 計算說話者特徵: {speaker_wav}")
        with torch.inference_mode():
            gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
                speaker_wav
            )
        
        if use_cache:
            self._speaker_cache[cache_key] = (gpt_cond_latent, speaker_embedding)
        
        return gpt_cond_latent, speaker_embedding
    
    def get_speaker_embedding_dict(self, speaker_wav: str) -> dict:
        """
        取得說話者特徵字典（可用於 API 傳輸）
        
        Args:
            speaker_wav: 參考語音檔案路徑
            
        Returns:
            包含 gpt_cond_latent 和 speaker_embedding 的字典
        """
        gpt_cond_latent, speaker_embedding = self.get_conditioning_latents(speaker_wav)
        return {
            "gpt_cond_latent": gpt_cond_latent.cpu().squeeze().half().tolist(),
            "speaker_embedding": speaker_embedding.cpu().squeeze().half().tolist(),
        }
    
    @staticmethod
    def postprocess(wav: torch.Tensor) -> np.ndarray:
        """
        後處理波形資料
        
        Args:
            wav: 原始波形張量
            
        Returns:
            處理後的 int16 numpy 陣列
        """
        if isinstance(wav, list):
            wav = torch.cat(wav, dim=0)
        wav = wav.clone().detach().cpu().numpy()
        wav = wav[None, : int(wav.shape[0])]
        wav = np.clip(wav, -1, 1)
        wav = (wav * 32767).astype(np.int16)
        return wav
    
    @staticmethod
    def encode_audio_to_wav(
        audio_data: bytes,
        sample_rate: int = 24000,
        sample_width: int = 2,
        channels: int = 1
    ) -> bytes:
        """
        將原始音訊資料編碼為 WAV 格式
        
        Args:
            audio_data: 原始音訊位元組
            sample_rate: 採樣率
            sample_width: 採樣寬度（位元組）
            channels: 通道數
            
        Returns:
            WAV 格式的位元組資料
        """
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as vfout:
            vfout.setnchannels(channels)
            vfout.setsampwidth(sample_width)
            vfout.setframerate(sample_rate)
            vfout.writeframes(audio_data)
        wav_buf.seek(0)
        return wav_buf.read()
    
    def tts_stream(
        self,
        text: str,
        speaker_wav: str,
        language: str = "zh-cn",
        stream_chunk_size: int = 20,
        add_wav_header: bool = True,
        enable_text_splitting: bool = True
    ) -> Iterator[bytes]:
        """
        串流生成語音
        
        Args:
            text: 要轉換的文字
            speaker_wav: 參考語音檔案路徑
            language: 語言代碼 (如 "zh-cn", "en")
            stream_chunk_size: 串流區塊大小（越小延遲越低，但品質可能下降）
            add_wav_header: 是否在第一個區塊添加 WAV 標頭
            enable_text_splitting: 是否啟用文字分割
            
        Yields:
            音訊區塊位元組
        """
        print(f"[XTTS] 串流生成開始: {text[:50]}...")
        
        # 取得說話者特徵
        gpt_cond_latent, speaker_embedding = self.get_conditioning_latents(speaker_wav)
        
        # 使用串流推理
        chunks = self.model.inference_stream(
            text,
            language,
            gpt_cond_latent,
            speaker_embedding,
            stream_chunk_size=stream_chunk_size,
            enable_text_splitting=enable_text_splitting
        )
        
        for i, chunk in enumerate(chunks):
            chunk = self.postprocess(chunk)
            
            if i == 0 and add_wav_header:
                # 第一個區塊添加 WAV 標頭
                yield self.encode_audio_to_wav(b"", sample_rate=24000)
                yield chunk.tobytes()
            else:
                yield chunk.tobytes()
        
        print("[XTTS] 串流生成完成")
    
    def tts_stream_from_embedding(
        self,
        text: str,
        gpt_cond_latent: List[List[float]],
        speaker_embedding: List[float],
        language: str = "zh-cn",
        stream_chunk_size: int = 20,
        add_wav_header: bool = True,
        enable_text_splitting: bool = True
    ) -> Iterator[bytes]:
        """
        使用預先計算的特徵串流生成語音
        
        Args:
            text: 要轉換的文字
            gpt_cond_latent: GPT 條件潛向量
            speaker_embedding: 說話者嵌入向量
            language: 語言代碼
            stream_chunk_size: 串流區塊大小
            add_wav_header: 是否在第一個區塊添加 WAV 標頭
            enable_text_splitting: 是否啟用文字分割
            
        Yields:
            音訊區塊位元組
        """
        # 轉換為張量
        speaker_emb = torch.tensor(speaker_embedding).unsqueeze(0).unsqueeze(-1)
        gpt_latent = torch.tensor(gpt_cond_latent).reshape((-1, 1024)).unsqueeze(0)
        
        chunks = self.model.inference_stream(
            text,
            language,
            gpt_latent,
            speaker_emb,
            stream_chunk_size=stream_chunk_size,
            enable_text_splitting=enable_text_splitting
        )
        
        for i, chunk in enumerate(chunks):
            chunk = self.postprocess(chunk)
            
            if i == 0 and add_wav_header:
                yield self.encode_audio_to_wav(b"", sample_rate=24000)
                yield chunk.tobytes()
            else:
                yield chunk.tobytes()
    
    def tts(
        self,
        text: str,
        speaker_wav: str,
        language: str = "zh-cn"
    ) -> bytes:
        """
        一次性生成完整語音（非串流）
        
        Args:
            text: 要轉換的文字
            speaker_wav: 參考語音檔案路徑
            language: 語言代碼
            
        Returns:
            完整的 WAV 音訊位元組
        """
        print(f"[XTTS] 生成語音: {text[:50]}...")
        
        gpt_cond_latent, speaker_embedding = self.get_conditioning_latents(speaker_wav)
        
        with torch.inference_mode():
            out = self.model.inference(
                text,
                language,
                gpt_cond_latent,
                speaker_embedding,
            )
        
        wav = self.postprocess(torch.tensor(out["wav"]))
        return self.encode_audio_to_wav(wav.tobytes())
    
    def tts_to_file(
        self,
        text: str,
        speaker_wav: str,
        output_path: str,
        language: str = "zh-cn"
    ) -> str:
        """
        生成語音並儲存至檔案
        
        Args:
            text: 要轉換的文字
            speaker_wav: 參考語音檔案路徑
            output_path: 輸出檔案路徑
            language: 語言代碼
            
        Returns:
            輸出檔案路徑
        """
        audio_data = self.tts(text, speaker_wav, language)
        with open(output_path, "wb") as f:
            f.write(audio_data)
        print(f"[XTTS] 語音已儲存: {output_path}")
        return output_path
    
    def tts_stream_to_file(
        self,
        text: str,
        speaker_wav: str,
        output_path: str,
        language: str = "zh-cn",
        stream_chunk_size: int = 20
    ) -> str:
        """
        串流生成語音並儲存至檔案
        
        Args:
            text: 要轉換的文字
            speaker_wav: 參考語音檔案路徑
            output_path: 輸出檔案路徑
            language: 語言代碼
            stream_chunk_size: 串流區塊大小
            
        Returns:
            輸出檔案路徑
        """
        with open(output_path, "wb") as f:
            for chunk in self.tts_stream(
                text,
                speaker_wav,
                language,
                stream_chunk_size=stream_chunk_size,
                add_wav_header=True
            ):
                f.write(chunk)
        print(f"[XTTS] 串流語音已儲存: {output_path}")
        return output_path


# 全域實例（可選用）
_global_tts: Optional[XTTSStreamingTTS] = None


def get_tts_instance() -> XTTSStreamingTTS:
    """取得或建立全域 TTS 實例"""
    global _global_tts
    if _global_tts is None:
        _global_tts = XTTSStreamingTTS()
    return _global_tts


# 測試用主程式
if __name__ == "__main__":
    msg = "人生就像一場旅行，有時候我們會遇到風雨，但只要我們堅定前行，就會發現風雨後的彩虹更加美麗。"
    speaker_wav = "Morgan Freeman.wav"
    
    # 建立 TTS 實例
    tts = XTTSStreamingTTS()
    
    # 方法 1: 一次性生成
    print("\n=== 測試一次性生成 ===")
    tts.tts_to_file(msg, speaker_wav, "my_out.wav", language="zh-cn")
    
    # 方法 2: 串流生成
    print("\n=== 測試串流生成 ===")
    tts.tts_stream_to_file(msg, speaker_wav, "my_out_stream.wav", language="zh-cn")
    
    print("\n完成！")
