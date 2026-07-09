"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDark(document.documentElement.classList.contains("dark")), 0);
    return () => clearTimeout(t);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-base transition hover:scale-110"
    >
      {dark === null ? "◐" : dark ? "🌙" : "☀️"}
    </button>
  );
}
