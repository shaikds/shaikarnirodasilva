"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/request";

export async function setLocale(locale: string) {
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) return;
  const store = await cookies();
  store.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
