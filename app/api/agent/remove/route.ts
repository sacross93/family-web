// 지우기. 결과 카드의 [지우기]가 부른다 — **가족이 눌러야만** 여기까지 온다(2026-10-19).
//
// 포동이의 `delete_item` 은 확인 카드만 만든다. 실제로 지우는 곳은 이 라우트 하나다.
// 되돌리기와 같은 약속을 지킨다: 클라이언트는 {resource, id} 만 보내고, 주소는 서버가
// `remove.api(id)` 로만 만든다(선언하지 않은 리소스는 400). 권한은 요청자의 쿠키로 대상 라우트가
// 판단한다(기념일: 만든 사람이나 관리자 → 아니면 403 문구가 카드에 그대로 뜬다).
//
// `agentConfig().enabled` 는 **보지 않는다** — undo·chats 와 같은 이유. 포동이를 꺼 둔 동안에도
// 이미 떠 있는 카드는 눌러져야 하고, 로그인은 proxy 가 강제한다(PODONGI.md).
//
// 두 번 눌러도 같다: 대상 DELETE 가 없는 행에 `{ok:true}` 를 준다(AGENTS.md 의 deleteMany 규칙).
// 새로고침한 뒤 옛 카드의 [지우기]를 다시 눌러도 "지웠어요" 가 된다.
import { NextRequest, NextResponse } from "next/server";
import { forwardToSite } from "@/lib/agent/forward";
import { ITEM_ID_RE, findResource } from "@/lib/agent/registry";
import { RESOURCES } from "@/lib/agent/resources";

export const runtime = "nodejs";

const CANNOT_REMOVE = "그건 지울 수 없어요.";
const REMOVE_FAILED = "지우지 못했어요.";

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  const body = (raw && typeof raw === "object" ? raw : {}) as { resource?: unknown; id?: unknown };
  const key = typeof body.resource === "string" ? body.resource.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (!key || !ITEM_ID_RE.test(id)) {
    return NextResponse.json({ error: CANNOT_REMOVE }, { status: 400 });
  }
  const remove = findResource(key, RESOURCES)?.remove;
  if (!remove) {
    return NextResponse.json({ error: CANNOT_REMOVE }, { status: 400 });
  }
  return forwardToSite({
    method: "DELETE",
    path: remove.api(id),
    cookie: req.headers.get("cookie") ?? "",
    failed: REMOVE_FAILED,
  });
}
