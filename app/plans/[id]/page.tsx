import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PlanDetailClient } from "./plan-detail-client";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      items: { orderBy: [{ dayDate: "asc" }, { sortOrder: "asc" }] },
      checklist: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      notes: { orderBy: [{ createdAt: "desc" }] },
    },
  });

  if (!plan) notFound();

  return <PlanDetailClient initialPlan={plan} />;
}
