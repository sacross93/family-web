import { prisma } from "@/lib/prisma";
import { TodosClient } from "./todos-client";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const [todos, members] = await Promise.all([
    prisma.todo.findMany({
      include: { member: true },
      orderBy: [{ date: "asc" }, { done: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.familyMember.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return <TodosClient initialTodos={todos} members={members} />;
}
