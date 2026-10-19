// 되돌리기. 결과 카드의 [되돌리기]가 부른다(스펙 §8, 고치기 되돌리기는 2026-10-19).
//
// 두 갈래다.
// - 만든 것(`kind` 없음 또는 "create"): `create.undoApi(id)` 로 DELETE.
//   **`kind` 가 없는 것이 이 갈래다** — 고치기가 생기기 전에 저장된 대화의 카드가 이 모양이다.
// - 고친 것(`kind:"update"`): `update.api(id)` 로 고치기 직전 값(`restore`)을 다시 PATCH.
//
// 어느 쪽이든 **클라이언트는 경로를 보내지 않는다.** {resource, id} 만 받고 주소는 서버가
// 레지스트리에서 만든다. 경로를 받아 주면 화이트리스트가 무의미해지고 임의 DELETE·PATCH 가 열린다.
import { NextRequest, NextResponse } from "next/server";
import { forwardToSite } from "@/lib/agent/forward";
import { ITEM_ID_RE, findResource } from "@/lib/agent/registry";
import { RESOURCES } from "@/lib/agent/resources";

export const runtime = "nodejs";

/** 되돌릴 수 없는 요청은 이유를 나누지 않는다(없는 키인지 create 가 없는지 알려 줄 이유가 없다). */
const CANNOT_UNDO = "그건 되돌릴 수 없어요.";
const UNDO_FAILED = "되돌리지 못했어요.";

function cannot() {
  return NextResponse.json({ error: CANNOT_UNDO }, { status: 400 });
}

/**
 * 되돌릴 값을 거른다. **선언된 키(`update.fields`)만, 값은 문자열·참거짓·null 만.**
 *
 * 이 값은 클라이언트가 보낸 것이라 아무것이나 올 수 있다. 그래도 권한이 넓어지지는 않는다 —
 * PATCH 는 요청자 자신의 쿠키로 가고, 대상 라우트가 권한(만든 사람이나 관리자)과 값을
 * 다시 확인한다. 화면에서 그 항목을 직접 고칠 수 있는 사람이 할 수 있는 일 이상은 못 한다.
 * 그래도 키를 거르는 것은, 고치기가 만들 수 없는 칸(`color` 같은)을 되돌리기라는 이름으로
 * 바꾸는 길을 열어 둘 이유가 없어서다.
 */
function cleanRestore(raw: unknown, fields: string[]): Record<string, string | boolean | null> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string | boolean | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!fields.includes(k)) continue;
    if (typeof v === "string" || typeof v === "boolean" || v === null) out[k] = v;
    else return null; // 모르는 모양이 섞였으면 통째로 거절한다 — 반만 되돌리면 더 헷갈린다.
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  const body = (raw && typeof raw === "object" ? raw : {}) as {
    resource?: unknown;
    id?: unknown;
    kind?: unknown;
    restore?: unknown;
  };
  const key = typeof body.resource === "string" ? body.resource.trim() : "";
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!key || !ITEM_ID_RE.test(id)) return cannot();

  // 모르는 갈래는 받지 않는다. 없으면(옛 카드) 만든 것이다.
  if (body.kind !== undefined && body.kind !== "create" && body.kind !== "update") return cannot();

  const resource = findResource(key, RESOURCES);
  const cookie = req.headers.get("cookie") ?? "";

  if (body.kind === "update") {
    // 화이트리스트. update 를 선언하지 않은 리소스는 고친 적도 없다.
    const update = resource?.update;
    if (!update) return cannot();
    const restore = cleanRestore(body.restore, update.fields);
    if (!restore) return cannot();
    return forwardToSite({ method: "PATCH", path: update.api(id), cookie, body: restore, failed: UNDO_FAILED });
  }

  // 만든 것(옛 카드 포함). undoApi 가 없는 리소스(아기·가족)는 되돌릴 것도 없다.
  // 이미 지운 것을 또 되돌리면 대상이 `{ok:true}`(deleteMany) 또는 5xx 를 내는데, 5xx 는 502 로 바뀐다.
  const undoApi = resource?.create?.undoApi;
  if (!undoApi) return cannot();
  return forwardToSite({ method: "DELETE", path: undoApi(id), cookie, failed: UNDO_FAILED });
}
