import { pageTitle } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { PlansClient } from "./plans-client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await pageTitle("/plans", "계획") };
}

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });

  return <PlansClient initialPlans={plans} />;
}
