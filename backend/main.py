# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import os
import time
import secrets
import hashlib
import random
import re
from datetime import datetime

app = FastAPI(title="Bracket Converter BE", version="1.3.0")

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

# ========= NEW: Công thức tạo seed “mạnh” từ thời gian tức thời + entropy =========
def make_strong_seed(user_seed: Optional[int]) -> int:
    """
    Tạo seed bằng cách kết hợp:
      - Thời gian thực: năm, tháng, ngày, giờ, phút, giây, microsecond
      - time_ns(), monotonic_ns()
      - PID hiện tại
      - Một ít bytes ngẫu nhiên secrets
      - (Tuỳ chọn) user_seed nếu có: XOR/mix để người dùng vẫn ép được tính lặp lại

    Có dùng các phép + - * / // % ^ để làm vừa ý yêu cầu “+-*/ với thời gian”.
    """
    now = datetime.now()  # theo timezone hệ thống
    y, m, d = now.year, now.month, now.day
    H, M, S, us = now.hour, now.minute, now.second, now.microsecond

    # Gộp thời gian thành vài “công thức” số:
    # base1: chuỗi nhân + cộng kiểu timestamp rời rạc
    base1 = (((((y * 13 + m) * 37 + d) * 29 + H) * 59 + M) * 61 + S) * 1_000_000 + (us or 1)

    # base2: trộn với các số nguyên tố và phép ^ (xor), %, //, *, +
    denom = max(1, (m * d) % 97)  # tránh chia 0
    base2 = (
        ((y ^ (m * 97)) + (d * 131)) * ((H + 1) * (M + 1) * (S + 1))
        + (base1 // denom)
        - ((y + m + d) % 7919)
    )

    # Thêm high-resolution time, monotonic, PID
    tn = time.time_ns()
    mn = time.monotonic_ns()
    pid = os.getpid()

    # Một ít entropy khó đoán
    sec_bytes = secrets.token_bytes(32)

    # Kết hợp tất cả thành bytes rồi băm BLAKE2b (nhanh và mạnh)
    h = hashlib.blake2b(digest_size=32)
    h.update(base1.to_bytes(16, "little", signed=False))
    h.update(base2.to_bytes(16, "little", signed=False))
    h.update(tn.to_bytes(16, "little", signed=False))
    h.update(mn.to_bytes(16, "little", signed=False))
    h.update(pid.to_bytes(8, "little", signed=False))
    h.update(sec_bytes)

    # Nếu có user_seed, mix vào theo yêu cầu
    if user_seed is not None:
        # Kết hợp qua XOR + nhân + modulo một số nguyên tố lớn
        mixed = (user_seed * 6364136223846793005 + 1442695040888963407) ^ base2
        h.update(mixed.to_bytes(16, "little", signed=False))

    seed_bytes = h.digest()
    seed_int = int.from_bytes(seed_bytes, "little", signed=False)

    # Đưa về phạm vi int seed phù hợp random.Random (dù Random chấp nhận int lớn)
    # Giữ rộng 63 bit để tránh vấn đề dấu trên một số platform
    return seed_int % (2**63 - 1)

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
    Chế độ mới:
    - Quét chuỗi; gặp '<' thì tìm '>' gần nhất.
    - r = uniform(0,1)
      * Nếu r <= p: xóa toàn bộ từ '<' đến '>' và ghi 1 dấu ']' (tăng replaced_chunks)
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
                    replaced_chunks += 1  # <-- FIX: ghi nhận thay thế
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
    # Dùng công thức seed mạnh, có trộn thời gian tức thời + secrets
    seed = make_strong_seed(payload.seed)
    rng = random.Random(seed)

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
