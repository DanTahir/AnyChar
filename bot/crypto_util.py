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
    try:
        raw = base64.b64decode(stored[4:])
    except Exception:
        return ""
    if len(raw) < 28:
        return ""

    nonce = raw[:12]
    aes = AESGCM(_key())

    # Web (Node) format: iv + authTag + ciphertext
    tag = raw[12:28]
    ciphertext = raw[28:]
    if ciphertext:
        try:
            return aes.decrypt(nonce, ciphertext + tag, None).decode()
        except Exception:
            pass

    # Legacy Python format: nonce + (ciphertext + tag)
    try:
        return aes.decrypt(nonce, raw[12:], None).decode()
    except Exception:
        return ""


def encrypt_api_key(plain: str) -> str:
    if not plain:
        return ""
    nonce = os.urandom(12)
    encrypted = AESGCM(_key()).encrypt(nonce, plain.encode(), None)
    tag = encrypted[-16:]
    ciphertext = encrypted[:-16]
    return "enc:" + base64.b64encode(nonce + tag + ciphertext).decode()
