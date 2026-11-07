#!/usr/bin/env python3
"""Download the YOLOX person-detector ONNX models into ``edge/models/`` and verify SHA-256.

Models come from the official Megvii YOLOX release 0.1.1rc0 (Apache-2.0). The hashes below were
pinned from that release; a download that does not match is deleted.

Usage::

    python edge/scripts/fetch_models.py               # yolox_tiny (default, 416x416)
    python edge/scripts/fetch_models.py --model s     # yolox_s (640x640, more accurate, ~3x slower)
    python edge/scripts/fetch_models.py --model all
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path

RELEASE_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/"
DEFAULT_DEST = Path(__file__).resolve().parent.parent / "models"
CHUNK = 1 << 20


@dataclass(frozen=True)
class ModelFile:
    filename: str
    sha256: str
    size: int


MODELS: dict[str, ModelFile] = {
    "tiny": ModelFile(
        "yolox_tiny.onnx",
        "427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7",
        20219662,
    ),
    "s": ModelFile(
        "yolox_s.onnx",
        "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
        35858002,
    ),
}


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(model: ModelFile, dest: Path, *, force: bool = False, timeout: float = 60.0) -> Path:
    """Download ``model`` into ``dest`` (skipped if a verified copy exists)."""
    target = dest / model.filename
    if target.is_file() and not force:
        if sha256_of(target) == model.sha256:
            print(f"{model.filename}: already present and verified")
            return target
        print(f"{model.filename}: checksum mismatch, downloading again")
    dest.mkdir(parents=True, exist_ok=True)
    url = RELEASE_URL + model.filename
    print(f"{model.filename}: downloading {url}")
    digest = hashlib.sha256()
    fd, tmp_name = tempfile.mkstemp(prefix=model.filename + ".", suffix=".part", dir=dest)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as out, urllib.request.urlopen(url, timeout=timeout) as resp:
            while chunk := resp.read(CHUNK):
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest() != model.sha256:
            raise RuntimeError(
                f"{model.filename}: SHA-256 mismatch (got {digest.hexdigest()}, "
                f"expected {model.sha256}); file discarded"
            )
        os.replace(tmp, target)
        target.chmod(0o644)
    finally:
        tmp.unlink(missing_ok=True)
    print(f"{model.filename}: verified ({model.size / 1e6:.1f} MB)")
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("--model", choices=["tiny", "s", "all"], default="tiny")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="target directory")
    parser.add_argument("--force", action="store_true", help="download even if present")
    args = parser.parse_args(argv)
    names = list(MODELS) if args.model == "all" else [args.model]
    try:
        for name in names:
            fetch(MODELS[name], args.dest, force=args.force)
    except (OSError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
