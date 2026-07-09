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
      router.push("/");
      router.refresh();
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{t("loginTitle")}</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600">{t("email")}</label>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">{t("password")}</label>
          <input name="password" type="password" required autoComplete="current-password" className={input} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("submitLogin")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-zinc-500">
        {t("noAccount")}{" "}
        <Link href="/signup" className="text-emerald-700 underline">
          {t("submitSignup")}
        </Link>
      </p>
    </div>
  );
}
