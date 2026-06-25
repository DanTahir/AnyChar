from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import ENCRYPTION_SECRET


def _key() -> bytes:
    if not ENCRYPTION_SECRET:
        raise ValueError("ENCRYPTION_SECRET is not set")
    return hashlib.sha256(ENCRYPTION_SECRET.encode()).digest()


def decrypt_api_key(stored: str) -> str:
    if not stored:
        return ""
    if not stored.startswith("enc:"):
        return stored
    raw = base64.b64decode(stored[4:])
    nonce, ciphertext = raw[:12], raw[12:]
    return AESGCM(_key()).decrypt(nonce, ciphertext, None).decode()


def encrypt_api_key(plain: str) -> str:
    if not plain:
        return ""
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key()).encrypt(nonce, plain.encode(), None)
    return "enc:" + base64.b64encode(nonce + ciphertext).decode()
