import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Countdown from "./Countdown";

export interface DealCardData {
  id: string;
  productName: string;
  supplierName: string;
  category: string;
  groupPrice: number;
  referencePrice: number;
  discountPct: number;
  fairnessScore: number;
  joined: number;
  targetSize: number;
  deadline: Date;
}

const CATEGORY_EMOJI: Record<string, string> = {
  headphones: "🎧",
  kitchen: "🍳",
  fitness: "⌚",
  "smart-home": "🏠",
};

export default async function DealCard({ deal }: { deal: DealCardData }) {
  const t = await getTranslations("deals");
  const pct = Math.min(100, Math.round((deal.joined / deal.targetSize) * 100));
  const almostFull = pct >= 70;

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="card-lift group relative block overflow-hidden rounded-2xl border border-line bg-surface shadow-sm hover:shadow-xl"
    >
      {/* discount ribbon */}
      <div className="absolute -end-10 top-5 z-10 rotate-45 bg-gradient-to-r from-pop to-pop-strong px-10 py-1 text-xs font-black text-white shadow-md rtl:-rotate-45">
        -{deal.discountPct}%
      </div>

      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-brand-soft via-surface to-pop-soft text-6xl transition-transform duration-300 group-hover:scale-110">
        {CATEGORY_EMOJI[deal.category] ?? "🛍️"}
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">
            ✓ {t("fairness", { score: deal.fairnessScore })}
          </span>
        </div>
        <h3 className="mt-2 truncate text-lg font-bold">{deal.productName}</h3>
        <p className="text-xs text-muted">{deal.supplierName}</p>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight text-brand">₪{deal.groupPrice.toFixed(0)}</span>
          <span className="text-sm font-medium text-muted line-through">₪{deal.referencePrice.toFixed(0)}</span>
        </div>

        <div className="mt-4">
          <div className="h-2.5 overflow-hidden rounded-full bg-line">
            <div
              className={`bar-animate h-full rounded-full ${almostFull ? "bg-gradient-to-r from-pop to-pop-strong" : "bg-gradient-to-r from-brand to-brand-strong"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-xs font-semibold ${almostFull ? "text-pop-strong" : "text-muted"}`}>
              {almostFull && "🔥 "}
              {t("joined", { count: deal.joined, target: deal.targetSize })}
            </span>
            <Countdown deadline={deal.deadline.toISOString()} doneLabel={t("closed")} />
          </div>
        </div>
      </div>
    </Link>
  );
}
