import hashlib
import hmac
import os
import secrets
from typing import Optional


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """
    Hash a password using PBKDF2-HMAC-SHA256 matching the project's seed pattern.
    Format: pbkdf2_sha256$<iterations>$<salt>$<hex_key>
    """
    if salt is None:
        salt = secrets.token_hex(16)
    iterations = 100_000
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=iterations,
    )
    return f"pbkdf2_sha256${iterations}${salt}${key.hex()}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    """
    Verifies a plain password against stored hash format.
    Supports PBKDF2-HMAC-SHA256 (canonical seed format).
    Uses constant-time comparison to prevent timing attacks.
    """
    if not plain_password or not password_hash:
        return False

    parts = password_hash.split("$")
    if len(parts) != 4:
        return False

    algorithm, iterations_str, salt, expected_hex = parts

    if algorithm != "pbkdf2_sha256":
        return False

    try:
        iterations = int(iterations_str)
    except ValueError:
        return False

    computed_key = hashlib.pbkdf2_hmac(
        "sha256",
        plain_password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=iterations,
    )
    computed_hex = computed_key.hex()

    return hmac.compare_digest(computed_hex, expected_hex)
