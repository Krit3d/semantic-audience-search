import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class InstagramPasswordCipher:
    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("BRIDGIT_ENCRYPTION_KEY must decode to exactly 32 bytes")
        self._aesgcm = AESGCM(key)

    @classmethod
    def from_base64(cls, encoded_key: str) -> "InstagramPasswordCipher":
        try:
            key = base64.b64decode(encoded_key, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("BRIDGIT_ENCRYPTION_KEY must be valid base64") from None
        return cls(key)

    def encrypt(self, password: str) -> tuple[bytes, bytes]:
        if not password:
            raise ValueError("Instagram password must not be empty")
        nonce = os.urandom(12)
        ciphertext = self._aesgcm.encrypt(nonce, password.encode("utf-8"), None)
        return ciphertext, nonce

    def decrypt(self, ciphertext: bytes, nonce: bytes) -> str:
        if len(nonce) != 12:
            raise ValueError("Invalid Instagram password nonce")
        try:
            plaintext = self._aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode("utf-8")
        except (InvalidTag, UnicodeDecodeError):
            raise ValueError("Instagram password decryption failed") from None
