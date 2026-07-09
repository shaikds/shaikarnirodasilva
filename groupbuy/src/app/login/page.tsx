"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setBusy(false);
    if (res?.error) setError(t("invalid"));
    else {
      router.push("/deals");
      router.refresh();
    }
  }

  const input =
    "mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <div className="rise-in mx-auto mt-8 max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-lg">
      <h1 className="text-2xl font-black tracking-tight">{t("loginTitle")}</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-muted">{t("email")}</label>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted">{t("password")}</label>
          <input name="password" type="password" required autoComplete="current-password" className={input} />
        </div>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-full bg-gradient-to-r from-brand to-brand-strong py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
        >
          {t("submitLogin")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-bold text-brand hover:underline">
          {t("submitSignup")}
        </Link>
      </p>
    </div>
  );
}
