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

app = FastAPI(title="Bracket Converter BE", version="1.7.0")

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
    # BE chỉ hỗ trợ mode=1; trường này được giữ để tương thích nhưng sẽ bị bỏ qua nếu khác 1
    mode: int = Field(1, description="(BỎ QUA) BE chỉ hỗ trợ mode=1: xử lý cụm <...> với biến A và NBSP")

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
    Chỉ mode 1, dùng biến A (0/1):
      - A khởi tạo = 1.
      - Gặp ' ' (ASCII space): nếu A=1 -> thay bằng NBSP (\u00A0), nếu A=0 -> giữ nguyên.
      - Gặp '<': đặt A=0, tìm '>' gần nhất:
          * Nếu r <= p: xóa toàn bộ từ '<' đến '>' (bao gồm cả dấu), sau đó A=1 và chèn dấu ']' ngay vị trí đó.
          * Nếu r > p: giữ nguyên đoạn '<...>', qua '>' thì A=1.
      - Gặp '>': đặt A=1.
    Loop2: Sau khi quét xong, xóa mọi dấu '<' và '>' còn sót lại trong chuỗi.
    Trả về (converted, total_chunks, replaced_chunks) với total_chunks là số cụm '<...>' gặp, replaced_chunks là số cụm bị xóa.
    """
    if not text:
        return "", 0, 0

    i = 0
    n = len(text)
    parts = []
    total_chunks = 0
    replaced_chunks = 0
    p = _normalize_p(percent)
    NBSP = "\u00A0"
    A = 1  # trạng thái ban đầu

    while i < n:
        ch = text[i]
        if ch == "<":
            A = 0
            j = text.find(">", i + 1)
            if j != -1:
                total_chunks += 1
                r = rng.uniform(0.0, 1.0)
                if r <= p:
                    # Xóa toàn bộ từ '<' đến '>' (bao gồm cả hai dấu)
                    A = 1
                    # Chèn dấu ']' ngay sau khi xoá cụm
                    parts.append("]")
                    i = j + 1
                    replaced_chunks += 1
                    continue
                else:
                    # Giữ nguyên cụm '<...>'; qua '>' thì A=1
                    parts.append(text[i:j+1])
                    A = 1
                    i = j + 1
                    continue
            # Không tìm thấy '>' => coi '<' như kí tự thường
            parts.append("<")
            i += 1
            continue
        elif ch == ">":
            A = 1
            parts.append(">")
            i += 1
            continue
        elif ch == " ":
            # Space thường: nếu A=1 => NBSP, A=0 => giữ nguyên
            parts.append(NBSP if A == 1 else " ")
            i += 1
            continue
        else:
            parts.append(ch)
            i += 1

    # Kết quả sau Loop1
    out1 = "".join(parts)
    # ===== Loop2: xóa toàn bộ dấu '<' và '>' còn lại =====
    out2 = out1.replace("<", "").replace(">", "")
    return out2, total_chunks, replaced_chunks

def convert_text(text: str, percent: float, rng: random.Random, mode: int):
    if mode == 1:
        return convert_text_mode1(text, percent, rng)
    # mặc định mode 0
    return convert_text_mode0(text, percent, rng)

@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Use POST /api/convert with JSON {text, percent, seed?, mode?}. BE chỉ hỗ trợ mode=1.",
        "percent_note": "percent chấp nhận 0..1 (tỉ lệ) hoặc 1..100 (phần trăm)",
        "mode": "1 = Dùng biến A (0/1). Space ASCII: A=1 -> NBSP, A=0 -> giữ nguyên. Gặp '<' -> A=0; gặp '>' -> A=1. Nếu r<=p: xóa toàn bộ '<...>' (kể cả dấu), đặt A=1 và chèn ']'. Cuối cùng xóa hết '<' và '>' còn sót.",
    }

@app.post("/api/convert", response_model=ConvertResponse)
def convert_endpoint(payload: ConvertRequest):
    # Dùng công thức seed mạnh, có trộn thời gian tức thời + secrets
    seed = make_strong_seed(payload.seed)
    rng = random.Random(seed)

    # BE ép dùng mode=1
    converted_text, total, replaced = convert_text_mode1(payload.text, payload.percent, rng)
    return ConvertResponse(
        converted=converted_text,
        percent=payload.percent,
        words_total=total,        # số cụm <...> gặp
        words_replaced=replaced,  # số cụm bị xóa
        mode=1,
    )

# === Chạy trực tiếp bằng: python main.py ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
