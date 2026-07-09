import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { setLocale } from "@/app/actions/locale";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const rubik = Rubik({
  subsets: ["latin", "hebrew"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "GroupBuy AI — קונים ביחד, חוסכים באמת",
  description: "AI-managed group buying with verified win-win prices",
};

/** Applies saved/system theme before first paint to avoid a flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  const session = await auth();
  const role = session?.user?.role;
  const otherLocale = locale === "he" ? "en" : "he";

  const navLink = "rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-line hover:text-ink";

  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${rubik.variable} min-h-screen bg-background font-sans text-ink antialiased`}>
        <NextIntlClientProvider>
          <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-md">
            <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
              <Link href="/" className="me-3 flex items-center gap-2 text-lg font-black tracking-tight">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-strong text-base text-white shadow-md">
                  🤝
                </span>
                <span>
                  GroupBuy<span className="text-brand"> AI</span>
                </span>
              </Link>
              <Link href="/deals" className={navLink}>
                {t("deals")}
              </Link>
              <Link href="/products" className={navLink}>
                {t("products")}
              </Link>
              {session && (
                <Link href="/my" className={navLink}>
                  {t("my")}
                </Link>
              )}
              {(role === "SUPPLIER" || role === "ADMIN") && (
                <Link href="/supplier" className={navLink}>
                  {t("supplier")}
                </Link>
              )}
              {role === "ADMIN" && (
                <Link href="/admin" className={navLink}>
                  {t("admin")}
                </Link>
              )}
              <span className="grow" />
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <form
                  action={async () => {
                    "use server";
                    await setLocale(otherLocale);
                  }}
                >
                  <button
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
                    type="submit"
                  >
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
                    <button className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink" type="submit">
                      {t("logout")}
                    </button>
                  </form>
                ) : (
                  <>
                    <Link href="/login" className={navLink}>
                      {t("login")}
                    </Link>
                    <Link
                      href="/signup"
                      className="rounded-full bg-gradient-to-r from-brand to-brand-strong px-4 py-1.5 text-sm font-bold text-white shadow-md transition hover:shadow-lg hover:brightness-110"
                    >
                      {t("signup")}
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mt-16 border-t border-line py-8 text-center text-xs text-muted">
            <p>
              GroupBuy AI · {tc("footer")}
            </p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
