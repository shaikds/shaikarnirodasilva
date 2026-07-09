"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [asSupplier, setAsSupplier] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") ?? ""),
        name: String(form.get("name") ?? ""),
        password: String(form.get("password") ?? ""),
        asSupplier,
        companyName: asSupplier ? String(form.get("companyName") ?? "") : undefined,
        websiteUrl: asSupplier ? String(form.get("websiteUrl") ?? "") : undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Error");
      return;
    }
    router.push("/login?created=1");
  }

  const input =
    "mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";
  const label = "block text-xs font-bold text-muted";

  return (
    <div className="rise-in mx-auto mt-8 max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-lg">
      <h1 className="text-2xl font-black tracking-tight">{t("signupTitle")}</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className={label}>{t("name")}</label>
          <input name="name" required maxLength={100} className={input} />
        </div>
        <div>
          <label className={label}>{t("email")}</label>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </div>
        <div>
          <label className={label}>{t("password")}</label>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={asSupplier} onChange={(e) => setAsSupplier(e.target.checked)} />
          {t("asSupplier")}
        </label>
        {asSupplier && (
          <>
            <div>
              <label className={label}>{t("companyName")}</label>
              <input name="companyName" required maxLength={120} className={input} />
            </div>
            <div>
              <label className={label}>{t("websiteUrl")}</label>
              <input name="websiteUrl" type="url" required placeholder="https://" className={input} />
            </div>
          </>
        )}
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-full bg-gradient-to-r from-brand to-brand-strong py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
        >
          {t("submitSignup")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-bold text-brand hover:underline">
          {t("submitLogin")}
        </Link>
      </p>
    </div>
  );
}
