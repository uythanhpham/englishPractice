from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import random
import re

app = FastAPI(title="Bracket Converter BE", version="1.2.0")

# Cho phép FE gọi API (bạn nên sửa allow_origins khi deploy thật)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Khi deploy thì nên giới hạn domain cụ thể
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======== Input từ FE ========
class ConvertRequest(BaseModel):
    text: str
    percent: float = Field(..., ge=0, le=100, description="Tỉ lệ hoặc phần trăm (0–1 hoặc 0–100)")
    seed: Optional[int] = Field(None, description="Tùy chọn seed để kết quả lặp lại")
    mode: int = Field(0, description="0 = thay theo từ (regex \\w+), 1 = thay theo cụm <...>")

# ======== Output trả về FE ========
class ConvertResponse(BaseModel):
    converted: str
    percent: float
    words_total: int
    words_replaced: int
    mode: int

# Regex: tìm từng từ (word = \w+)
WORD_RE = re.compile(r"\w+", re.UNICODE)

def _normalize_p(percent: float) -> float:
    """
    Cho phép percent ở 2 dạng:
      - 0..1  -> dùng trực tiếp (ví dụ 0.57 = 57%)
      - 1..100 -> hiểu là phần trăm (ví dụ 57 = 57%)
    """
    if percent <= 1.0:
        p = percent
    else:
        p = percent / 100.0
    # ép vào [0,1]
    return 0.0 if p < 0 else 1.0 if p > 1 else p

def convert_text_mode0(text: str, percent: float, rng: random.Random):
    """
    Chế độ cũ: thay ngẫu nhiên từng từ (\\w+) thành ']'
    - Sử dụng r = uniform(0,1) và điều kiện r <= p
    - p được chuẩn hoá từ percent (0..1 hoặc 0..100)
    """
    if not text:
        return "", 0, 0

    parts = []
    replaced = 0
    total_words = 0
    last_end = 0
    p = _normalize_p(percent)

    for match in WORD_RE.finditer(text):
        total_words += 1
        start, end = match.start(), match.end()
        parts.append(text[last_end:start])

        word = match.group()
        # r <= p theo yêu cầu
        if rng.uniform(0.0, 1.0) <= p:
            parts.append("]")
            replaced += 1
        else:
            parts.append(word)

        last_end = end

    parts.append(text[last_end:])
    return "".join(parts), total_words, replaced

def convert_text_mode1(text: str, percent: float, rng: random.Random):
    """
    Chế độ mới (đúng yêu cầu):
    - Quét chuỗi; gặp '<' thì tìm '>' gần nhất.
    - r = uniform(0,1)
      * Nếu r <= p: xóa toàn bộ từ '<' đến '>' và ghi 1 dấu ']'
      * Nếu r > p: giữ nguyên cụm (để cuối cùng gỡ '<' và '>')
    - Sau lượt quét: xóa toàn bộ kí tự '<' và '>' còn lại.
    - Trả về (converted, total_chunks, replaced_chunks)
    """
    if not text:
        return "", 0, 0

    i = 0
    n = len(text)
    parts = []
    total_chunks = 0
    replaced_chunks = 0
    p = _normalize_p(percent)

    while i < n:
        ch = text[i]
        if ch == "<":
            j = text.find(">", i + 1)
            if j != -1:
                # Có một cụm <...>
                total_chunks += 1
                if rng.uniform(0.0, 1.0) <= p:
                    # Xóa '<...>' và ghi ']'
                    parts.append("]")
                else:
                    # Giữ nguyên để cuối cùng gỡ '<' '>'
                    parts.append(text[i:j+1])
                i = j + 1
                continue
            # Không tìm thấy '>' => coi '<' như kí tự thường
        parts.append(ch)
        i += 1

    # Bước cuối: gỡ toàn bộ '<' và '>' còn sót lại
    out = "".join(parts).replace("<", "").replace(">", "")
    return out, total_chunks, replaced_chunks

def convert_text(text: str, percent: float, rng: random.Random, mode: int):
    if mode == 1:
        return convert_text_mode1(text, percent, rng)
    # mặc định mode 0
    return convert_text_mode0(text, percent, rng)

@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Use POST /api/convert with JSON {text, percent, seed?, mode?}",
        "percent_note": "percent chấp nhận 0..1 (tỉ lệ) hoặc 0..100 (phần trăm)",
        "modes": {
            "0": "Random thay từ (regex \\w+) thành ']'",
            "1": "Quét cụm <...>; nếu r<=p thì thay cụm bằng ']', sau đó gỡ tất cả '<' và '>' còn lại",
        },
    }

@app.post("/api/convert", response_model=ConvertResponse)
def convert_endpoint(payload: ConvertRequest):
    rng = random.Random(payload.seed) if payload.seed is not None else random.Random()
    converted_text, total, replaced = convert_text(payload.text, payload.percent, rng, payload.mode)
    return ConvertResponse(
        converted=converted_text,
        percent=payload.percent,
        words_total=total,        # mode=0: số từ; mode=1: số cụm <...>
        words_replaced=replaced,  # mode=0: số từ bị thay; mode=1: số cụm bị thay
        mode=payload.mode,
    )

# === Chạy trực tiếp bằng: python main.py ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
