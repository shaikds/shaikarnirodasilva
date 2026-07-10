import { NextResponse, type NextRequest } from "next/server";
import { ingestTrending } from "@/lib/scraper/ingest";

/**
 * Weekly trending scrape endpoint for external schedulers (GitHub Actions
 * cron, Vercel cron, etc.). Protected by a bearer secret — without CRON_SECRET
 * configured the endpoint is disabled entirely.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron disabled" }, { status: 503 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await ingestTrending();
  return NextResponse.json({ ok: true, summary });
}
