import time
from collections import Counter

from . import storage


def _fmt_minutes(seconds: float) -> str:
    m = round(seconds / 60)
    if m < 60:
        return f"{m}m"
    return f"{m // 60}h{m % 60:02d}m"


def build_today_report(conn) -> str:
    since = storage.start_of_today()
    events = storage.events_since(conn, since)
    flags = storage.flags_since(conn, since)
    revisit = storage.get_revisit_items(conn, only_unresolved=True)

    lines = ["=" * 44, " EFFICIENCY REPORT — TODAY", "=" * 44]

    if not events:
        lines.append("No activity recorded yet today.")
        return "\n".join(lines)

    # time by category, approximated by seconds between consecutive samples
    cat_seconds = Counter()
    for i in range(len(events) - 1):
        ts, _app, _title, category, idle = events[i]
        next_ts = events[i + 1][0]
        gap = min(next_ts - ts, 600)  # cap gaps (e.g. sleep) at 10 min
        if idle < 120:
            cat_seconds[category] += gap

    total = sum(cat_seconds.values())
    lines.append(f"\nActive time tracked: {_fmt_minutes(total)}")
    lines.append("\nBy category:")
    for cat, secs in cat_seconds.most_common():
        pct = (secs / total * 100) if total else 0
        lines.append(f"  {cat:<20} {_fmt_minutes(secs):>7}  ({pct:4.1f}%)")

    kind_counts = Counter(f[1] for f in flags)
    lines.append("\nEfficiency flags today:")
    if not kind_counts:
        lines.append("  None — solid focus today.")
    else:
        for kind, n in kind_counts.most_common():
            lines.append(f"  {kind:<16} x{n}")

    lines.append(f"\nThings to revisit ({len(revisit)} open):")
    if not revisit:
        lines.append("  Nothing pending — you closed the loop on everything flagged.")
    else:
        for item in revisit[:10]:
            when = time.strftime("%H:%M", time.localtime(item.ts))
            lines.append(f"  [{item.id}] {when}  {item.app} — {item.title or '(untitled)'}")
            lines.append(f"        why: {item.reason}")
            lines.append(f"        try: {item.suggestion}")

    lines.append("=" * 44)
    return "\n".join(lines)


def build_revisit_list(conn) -> str:
    items = storage.get_revisit_items(conn, only_unresolved=True)
    if not items:
        return "Nothing to revisit right now."
    lines = ["Open items to go back to:"]
    for item in items:
        when = time.strftime("%Y-%m-%d %H:%M", time.localtime(item.ts))
        lines.append(f"\n[{item.id}] {when} — {item.app}: {item.title or '(untitled)'}")
        lines.append(f"    why:  {item.reason}")
        lines.append(f"    try:  {item.suggestion}")
    return "\n".join(lines)
