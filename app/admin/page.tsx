import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { AdminClient } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const decorations = await prisma.decoration.findMany({
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
  });

  return <AdminClient decorations={decorations} />;
}
