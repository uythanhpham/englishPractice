from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import random
import re

app = FastAPI(title="Bracket Converter BE", version="1.0.0")

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
    percent: float = Field(..., ge=0, le=100, description="Tỉ lệ % từ bị đổi thành ']'")
    seed: Optional[int] = Field(None, description="Tùy chọn seed để kết quả lặp lại")

# ======== Output trả về FE ========
class ConvertResponse(BaseModel):
    converted: str
    percent: float
    words_total: int
    words_replaced: int

# Regex: tìm từng từ (word = \w+)
WORD_RE = re.compile(r"\w+", re.UNICODE)

def convert_text(text: str, percent: float, rng: random.Random):
    if not text:
        return "", 0, 0

    parts = []
    replaced = 0
    total_words = 0
    last_end = 0

    # Tìm tất cả từ trong chuỗi
    for match in WORD_RE.finditer(text):
        total_words += 1
        start, end = match.start(), match.end()

        # Giữ nguyên đoạn giữa các từ (dấu câu, khoảng trắng, ...)
        parts.append(text[last_end:start])

        word = match.group()
        # Tung đồng xu với xác suất bị thay
        if rng.random() < (percent / 100.0):
            parts.append("]")
            replaced += 1
        else:
            parts.append(word)

        last_end = end

    # Thêm phần còn lại sau từ cuối cùng
    parts.append(text[last_end:])

    return "".join(parts), total_words, replaced

@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Use POST /api/convert with JSON {text, percent, seed?}"
    }

@app.post("/api/convert", response_model=ConvertResponse)
def convert_endpoint(payload: ConvertRequest):
    rng = random.Random(payload.seed) if payload.seed is not None else random.Random()

    converted_text, total, replaced = convert_text(payload.text, payload.percent, rng)

    return ConvertResponse(
        converted=converted_text,
        percent=payload.percent,
        words_total=total,
        words_replaced=replaced
    )

# === Chạy trực tiếp bằng: python main.py ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
