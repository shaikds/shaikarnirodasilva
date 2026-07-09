"use client";

import { useEffect, useState } from "react";

/** Live countdown to a deadline; turns amber under 24h, red under 3h. */
export default function Countdown({ deadline, doneLabel }: { deadline: string; doneLabel: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  if (now === null) return <span className="font-mono text-xs text-muted">…</span>;

  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return <span className="font-mono text-xs font-semibold text-danger">{doneLabel}</span>;

  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const text = d > 0 ? `${d}d ${h}h ${m}m` : `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const tone = ms < 3 * 3_600_000 ? "text-danger" : ms < 24 * 3_600_000 ? "text-pop-strong" : "text-muted";

  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${tone}`} dir="ltr">
      ⏳ {text}
    </span>
  );
}
