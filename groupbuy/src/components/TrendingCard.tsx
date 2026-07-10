import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { unvoteTrending, voteTrending } from "@/app/actions/trending";

export interface TrendingCardData {
  id: string;
  title: string;
  category: string;
  source: string;
  zapLowestPriceIls: number | null;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  votes: number;
  votesNeeded: number | null;
  voted: boolean;
}

const CATEGORY_EMOJI: Record<string, string> = {
  headphones: "🎧",
  kitchen: "🍳",
  fitness: "⌚",
  "smart-home": "🏠",
};

const SOURCE_LABEL: Record<string, string> = {
  KSP: "KSP",
  SUPER_PHARM: "Super-Pharm",
  ZAP: "Zap",
};

export default async function TrendingCard({ item, signedIn }: { item: TrendingCardData; signedIn: boolean }) {
  const t = await getTranslations("trending");
  const needed = item.votesNeeded;
  const pct = needed ? Math.min(100, Math.round((item.votes / needed) * 100)) : 0;
  const almostThere = pct >= 70;
  const claiming = item.status === "CLAIM_WINDOW";

  return (
    <div className="card-lift relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm hover:shadow-xl">
      {claiming && (
        <div className="absolute -end-10 top-5 z-10 rotate-45 bg-gradient-to-r from-pop to-pop-strong px-10 py-1 text-xs font-black text-white shadow-md rtl:-rotate-45">
          {t("claiming")}
        </div>
      )}

      <div className="flex h-28 items-center justify-center bg-gradient-to-br from-pop-soft via-surface to-brand-soft text-5xl">
        {CATEGORY_EMOJI[item.category] ?? "🛍️"}
      </div>

      <div className="flex grow flex-col p-5">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-pop-soft px-2 py-0.5 font-bold text-pop-strong">📈 {SOURCE_LABEL[item.source] ?? item.source}</span>
          {item.rating != null && (
            <span className="text-muted" dir="ltr">
              ⭐ {item.rating.toFixed(1)}
              {item.reviewCount != null && ` (${item.reviewCount.toLocaleString()})`}
            </span>
          )}
        </div>

        <h3 className="mt-2 line-clamp-2 font-bold">{item.title}</h3>

        {item.zapLowestPriceIls != null && (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight">₪{item.zapLowestPriceIls.toFixed(0)}</span>
            <span className="text-xs text-muted">{t("marketPrice")}</span>
          </div>
        )}

        <div className="mt-auto pt-4">
          {needed ? (
            <>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div
                  className={`bar-animate h-full rounded-full ${almostThere ? "bg-gradient-to-r from-pop to-pop-strong" : "bg-gradient-to-r from-brand to-brand-strong"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className={`text-xs font-semibold ${almostThere ? "text-pop-strong" : "text-muted"}`}>
                  {almostThere && "🔥 "}
                  {t("votesProgress", { count: item.votes, needed })}
                </span>
                {signedIn ? (
                  <form
                    action={async () => {
                      "use server";
                      if (item.voted) await unvoteTrending(item.id);
                      else await voteTrending(item.id);
                    }}
                  >
                    <button
                      className={
                        item.voted
                          ? "rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-muted transition hover:border-danger hover:text-danger"
                          : "rounded-full bg-gradient-to-r from-brand to-brand-strong px-3 py-1 text-xs font-bold text-white shadow-md transition hover:scale-105 hover:brightness-110"
                      }
                    >
                      {item.voted ? t("unvote") : `👍 ${t("vote")}`}
                    </button>
                  </form>
                ) : (
                  <Link href="/login" className="text-xs font-bold text-brand hover:underline">
                    {t("vote")}
                  </Link>
                )}
              </div>
            </>
          ) : (
            <span className="text-xs text-muted">{t("checkingViability")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
