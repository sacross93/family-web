import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createChat, appendMessages, loadHistory, listChats, deleteChat, titleFrom } from "@/lib/agent/chat-store";

const made: string[] = [];
async function newChat(first = "안녕") {
  const id = await createChat(first);
  made.push(id);
  return id;
}
afterAll(async () => {
  await prisma.agentChat.deleteMany({ where: { id: { in: made } } });
});

describe("titleFrom", () => {
  it("짧으면 그대로", () => expect(titleFrom("발리 사진 어디 있지?")).toBe("발리 사진 어디 있지?"));
  it("길면 자르고 말줄임", () => {
    const t = titleFrom("가".repeat(60));
    expect(t.length).toBeLessThanOrEqual(41);
    expect(t.endsWith("…")).toBe(true);
  });
  it("개행·제어문자는 공백으로", () => expect(titleFrom("앞\n뒤")).toBe("앞 뒤"));
  it("빈 값이면 기본 제목", () => expect(titleFrom("   ")).toBe("새 대화"));
});

describe("대화 저장", () => {
  it("만들면 제목이 첫 질문에서 나온다", async () => {
    const id = await newChat("발리 사진 어디 있지?");
    const rows = await listChats(50);
    expect(rows.find((r) => r.id === id)?.title).toBe("발리 사진 어디 있지?");
  });

  it("메시지를 붙이고 오래된 순으로 읽는다", async () => {
    const id = await newChat();
    await appendMessages(id, [
      { role: "user", content: "첫 질문" },
      { role: "assistant", content: "첫 답변" },
    ]);
    await appendMessages(id, [{ role: "user", content: "둘째 질문" }]);
    const h = await loadHistory(id, 10);
    expect(h.map((m) => m.content)).toEqual(["첫 질문", "첫 답변", "둘째 질문"]);
  });

  it("도구 호출 짝이 보존된다", async () => {
    const id = await newChat();
    await appendMessages(id, [
      { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "open_page", args: { path: "/plans/x" } }] },
      { role: "tool", content: '{"ok":true}', toolCallId: "call_1" },
    ]);
    const h = await loadHistory(id, 10);
    expect(h[0].toolCalls).toEqual([{ id: "call_1", name: "open_page", args: { path: "/plans/x" } }]);
    expect(h[1].toolCallId).toBe("call_1");
  });

  it("limit 은 최근 것을 남기되 순서는 오래된 순", async () => {
    const id = await newChat();
    await appendMessages(id, [1, 2, 3, 4, 5].map((n) => ({ role: "user" as const, content: `m${n}` })));
    const h = await loadHistory(id, 3);
    expect(h.map((m) => m.content)).toEqual(["m3", "m4", "m5"]);
  });

  it("목록은 최근 대화가 먼저", async () => {
    const a = await newChat("먼저");
    await new Promise((r) => setTimeout(r, 10));
    const b = await newChat("나중");
    const rows = await listChats(50);
    expect(rows.findIndex((r) => r.id === b)).toBeLessThan(rows.findIndex((r) => r.id === a));
  });

  it("지우면 메시지도 같이 사라진다", async () => {
    const id = await createChat("지울 것");
    await appendMessages(id, [{ role: "user", content: "x" }]);
    await deleteChat(id);
    expect(await prisma.agentChatMessage.count({ where: { chatId: id } })).toBe(0);
  });
});
