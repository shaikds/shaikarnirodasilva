import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { setLocale } from "@/app/actions/locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "GroupBuy AI",
  description: "AI-managed group buying with verified win-win prices",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  const session = await auth();
  const role = session?.user?.role;
  const otherLocale = locale === "he" ? "en" : "he";

  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <NextIntlClientProvider>
          <header className="border-b border-zinc-200 bg-white">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-emerald-700">
                {t("brand")}
              </Link>
              <Link href="/" className="text-sm hover:text-emerald-700">
                {t("deals")}
              </Link>
              <Link href="/products" className="text-sm hover:text-emerald-700">
                {t("products")}
              </Link>
              {session && (
                <Link href="/my" className="text-sm hover:text-emerald-700">
                  {t("my")}
                </Link>
              )}
              {(role === "SUPPLIER" || role === "ADMIN") && (
                <Link href="/supplier" className="text-sm hover:text-emerald-700">
                  {t("supplier")}
                </Link>
              )}
              {role === "ADMIN" && (
                <Link href="/admin" className="text-sm hover:text-emerald-700">
                  {t("admin")}
                </Link>
              )}
              <span className="grow" />
              <form
                action={async () => {
                  "use server";
                  await setLocale(otherLocale);
                }}
              >
                <button className="text-sm text-zinc-500 hover:text-zinc-900" type="submit">
                  {tc("language")}
                </button>
              </form>
              {session ? (
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <button className="text-sm text-zinc-500 hover:text-zinc-900" type="submit">
                    {t("logout")}
                  </button>
                </form>
              ) : (
                <>
                  <Link href="/login" className="text-sm hover:text-emerald-700">
                    {t("login")}
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    {t("signup")}
                  </Link>
                </>
              )}
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
