import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getSiteConfig, getNav } from "@/lib/site";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const [decorations, site, nav] = await Promise.all([
    prisma.decoration.findMany({ orderBy: [{ page: "asc" }, { createdAt: "asc" }] }),
    getSiteConfig(),
    getNav(),
  ]);

  return <AdminClient decorations={decorations} site={site} nav={nav} />;
}
