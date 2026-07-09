import { runAgentCycle } from "@/lib/agent/cycle";
import { prisma } from "@/lib/db";

async function main() {
  const summary = await runAgentCycle("cli:manual");
  console.log("cycle:", summary);
  const decisions = await prisma.agentDecision.findMany({
    where: { runId: summary.runId },
    orderBy: { createdAt: "asc" },
  });
  for (const d of decisions) {
    console.log(`- ${d.action} ${d.outcome} product=${d.productId ?? "-"} reasons=[${d.reasons.join(",")}]`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
