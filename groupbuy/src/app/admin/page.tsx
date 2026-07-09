import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { setKillSwitch, setSupplierVerified, triggerAgentCycle } from "@/app/actions/admin";

export default async function AdminPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const t = await getTranslations("admin");
  const format = await getFormatter();

  const [killSetting, runs, decisions, suppliers] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: "agent_kill_switch" } }),
    prisma.agentRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.agentDecision.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { run: { select: { startedAt: true } } },
    }),
    prisma.supplier.findMany({ include: { user: { select: { email: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const killOn = killSetting?.value === "on";

  const card = "rounded-2xl border border-line bg-surface p-6 shadow-sm";

  return (
    <div className="space-y-8">
      <h1 className="rise-in text-4xl font-black tracking-tight">🤖 {t("title")}</h1>

      <section className={`${card} flex flex-wrap items-center gap-4`}>
        <form
          action={async () => {
            "use server";
            await triggerAgentCycle();
          }}
        >
          <button
            className="rounded-full bg-gradient-to-r from-brand to-brand-strong px-6 py-2.5 font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
            disabled={killOn}
          >
            ▶ {t("runCycle")}
          </button>
        </form>
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${killOn ? "pulse-soft bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong"}`}
        >
          {killOn ? `🛑 ${t("killOn")}` : `● ${t("killOff")}`}
        </span>
        <form
          action={async () => {
            "use server";
            await setKillSwitch(!killOn);
          }}
        >
          <button
            className={`rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-110 ${killOn ? "bg-gradient-to-r from-brand to-brand-strong" : "bg-gradient-to-r from-red-500 to-red-700"}`}
          >
            {killOn ? t("disable") : t("enable")}
          </button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-bold">{t("runs")}</h2>
        <div className="mt-3 space-y-1 text-sm">
          {runs.map((r) => (
            <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 last:border-0">
              <span className="text-muted">
                {format.dateTime(r.startedAt, { dateStyle: "short", timeStyle: "medium" })} · {r.triggeredBy} ·{" "}
                {r.llmProvider}
              </span>
              <span className="font-mono text-xs text-muted">{r.summary}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-bold">{t("decisions")}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 text-start">{t("action")}</th>
                <th className="py-2 text-start">{t("outcome")}</th>
                <th className="py-2 text-start">{t("reasons")}</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-mono text-xs font-semibold">{d.action}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        d.outcome === "ALLOWED"
                          ? "bg-brand-soft text-brand-strong"
                          : d.outcome === "BLOCKED_BY_GUARDRAIL"
                            ? "bg-danger-soft text-danger"
                            : "bg-line text-muted"
                      }`}
                    >
                      {d.outcome}
                    </span>
                  </td>
                  <td className="py-2 font-mono text-xs text-muted">{d.reasons.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-bold">{t("suppliers")}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {suppliers.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 last:border-0"
            >
              <div>
                <span className="font-bold">{s.companyName}</span>
                <span className="ms-2 text-xs text-muted">{s.user.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.trustScore < 50 ? "bg-danger-soft text-danger" : "bg-line text-muted"}`}
                >
                  {t("trust", { score: s.trustScore })}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await setSupplierVerified(s.id, !s.verified);
                  }}
                >
                  <button
                    className={`rounded-full border-2 px-4 py-1 text-xs font-bold transition ${
                      s.verified
                        ? "border-line text-muted hover:border-danger hover:text-danger"
                        : "border-brand text-brand hover:bg-brand-soft"
                    }`}
                  >
                    {s.verified ? t("unverify") : t("verify")}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
