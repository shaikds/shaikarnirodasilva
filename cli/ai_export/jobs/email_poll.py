from __future__ import annotations

import email
import imaplib
from dataclasses import dataclass
from email.header import decode_header, make_header
from typing import Any


@dataclass
class EmailMessage:
    uid: str
    from_addr: str
    subject: str
    body: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "uid": self.uid,
            "from": self.from_addr,
            "subject": self.subject,
            "body": self.body,
        }


def fetch_recent(
    host: str,
    port: int,
    username: str,
    password: str,
    mailbox: str = "INBOX",
    limit: int = 50,
) -> list[EmailMessage]:
    """Fetch the most recent `limit` messages from the mailbox."""
    with imaplib.IMAP4_SSL(host, port) as M:
        M.login(username, password)
        M.select(mailbox, readonly=True)
        typ, data = M.search(None, "ALL")
        if typ != "OK" or not data or not data[0]:
            return []
        uids = data[0].split()[-limit:]
        out: list[EmailMessage] = []
        for uid in uids:
            typ, msg_data = M.fetch(uid, "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            out.append(
                EmailMessage(
                    uid=uid.decode(),
                    from_addr=_decode_header(msg.get("From", "")),
                    subject=_decode_header(msg.get("Subject", "")),
                    body=_extract_body(msg),
                )
            )
        return out


def _decode_header(value: str) -> str:
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _extract_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        parts: list[str] = []
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html"):
                try:
                    parts.append(part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    ))
                except Exception:
                    continue
        return "\n".join(parts)
    payload = msg.get_payload(decode=True)
    if isinstance(payload, bytes):
        return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
    return msg.get_payload() or ""
