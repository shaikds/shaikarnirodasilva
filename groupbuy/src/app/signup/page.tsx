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
    "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
  const label = "block text-xs font-medium text-zinc-600";

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{t("signupTitle")}</h1>
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
        <label className="flex items-center gap-2 text-sm text-zinc-700">
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("submitSignup")}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-zinc-500">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-emerald-700 underline">
          {t("submitLogin")}
        </Link>
      </p>
    </div>
  );
}
