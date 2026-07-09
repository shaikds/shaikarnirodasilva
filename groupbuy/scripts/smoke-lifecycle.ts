/**
 * Dev smoke test for the full deal lifecycle:
 * open -> members join -> close (coupons assigned) -> kill switch halts agent.
 */
import { runAgentCycle } from "@/lib/agent/cycle";
import { prisma } from "@/lib/db";

async function main() {
  const s1 = await runAgentCycle("cli:smoke");
  console.log("cycle1 opened:", s1.opened, "blocked:", s1.blocked);

  const deal = await prisma.deal.findFirst({ where: { status: "OPEN" }, include: { product: true } });
  if (!deal) throw new Error("no open deal");
  console.log(`joining ${deal.targetSize} members to "${deal.product.name}" (target ${deal.targetSize})`);

  const members = await prisma.user.findMany({ where: { role: "MEMBER" }, take: deal.targetSize });
  if (members.length < deal.targetSize) throw new Error("not enough demo members");
  for (const m of members) {
    await prisma.groupMembership.upsert({
      where: { dealId_userId: { dealId: deal.id, userId: m.id } },
      update: {},
      create: { dealId: deal.id, userId: m.id },
    });
  }

  const s2 = await runAgentCycle("cli:smoke");
  console.log("cycle2 closed:", s2.closed);

  const closedDeal = await prisma.deal.findUnique({ where: { id: deal.id } });
  const coupons = await prisma.couponCode.findMany({ where: { dealId: deal.id } });
  console.log("deal status:", closedDeal?.status, "| coupons assigned:", coupons.length);
  if (closedDeal?.status !== "CLOSED" || coupons.length !== deal.targetSize) throw new Error("close failed");
  const distinctUsers = new Set(coupons.map((c) => c.assignedTo));
  if (distinctUsers.size !== coupons.length) throw new Error("duplicate coupon assignment");

  // Kill switch: agent must take zero actions.
  await prisma.systemSetting.update({ where: { key: "agent_kill_switch" }, data: { value: "on" } });
  const s3 = await runAgentCycle("cli:smoke");
  console.log("kill switch cycle => opened:", s3.opened, "closed:", s3.closed, "expired:", s3.expired);
  if (s3.opened + s3.closed + s3.expired > 0) throw new Error("kill switch violated!");
  await prisma.systemSetting.update({ where: { key: "agent_kill_switch" }, data: { value: "off" } });

  console.log("LIFECYCLE OK");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
