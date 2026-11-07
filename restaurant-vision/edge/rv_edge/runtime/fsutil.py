"""Small file helpers for the edge's local state files (secrets, site config).

Files are written atomically (temp file + ``os.replace``) and created user-only:

* POSIX: the data directory is ``0700`` and files are ``0600``.
* Windows: ``chmod`` only toggles the read-only flag, so these modes are best effort. The
  Windows installer must place ``data_dir`` under a directory whose ACL grants access only to
  the service account and Administrators (e.g. ``icacls <dir> /inheritance:r /grant:r
  SYSTEM:F Administrators:F``).
"""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any

PRIVATE_FILE_MODE = 0o600
PRIVATE_DIR_MODE = 0o700


def ensure_private_dir(path: Path) -> Path:
    """Create ``path`` (and parents) if needed and restrict it to the current user."""
    path.mkdir(parents=True, exist_ok=True)
    with contextlib.suppress(OSError):  # best effort (Windows, foreign owner)
        os.chmod(path, PRIVATE_DIR_MODE)
    return path


def write_private_json(path: Path, data: Any) -> None:
    """Atomically write ``data`` as JSON to ``path`` with user-only permissions."""
    ensure_private_dir(path.parent)
    payload = json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False).encode("utf-8")
    # mkstemp creates the file with mode 0600 on POSIX, so the secret is never world-readable.
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_name)
        raise
    with contextlib.suppress(OSError):
        os.chmod(path, PRIVATE_FILE_MODE)


def read_json(path: Path) -> Any | None:
    """Parsed JSON from ``path``, or None if the file does not exist."""
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return None
    return json.loads(raw.decode("utf-8"))
