"""Generate a VAPID key pair for Web Push.

``python -m rv_cloud.tools.gen_vapid`` prints ``RV_VAPID_*`` lines for an ``.env`` file.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def generate_vapid_keys() -> tuple[str, str]:
    """``(private, public)``: URL-safe base64 raw P-256 private scalar (32 bytes) and the
    uncompressed public point (65 bytes, the browser's ``applicationServerKey``)."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64url(private), _b64url(public)


def main() -> None:
    private, public = generate_vapid_keys()
    print(f"RV_VAPID_PRIVATE_KEY={private}")
    print(f"RV_VAPID_PUBLIC_KEY={public}")
    print("RV_VAPID_SUBJECT=mailto:ops@example.com")


if __name__ == "__main__":
    main()
