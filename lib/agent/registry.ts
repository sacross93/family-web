// 리소스 단일 진실 원천. 목차·도구·경로 해석·추가·고치기·지우기·되돌리기가 모두 여기서 파생된다.
// 실제 리소스 정의는 resources.ts 에 있다.

/** LLM 에게 넘길 인자 스키마(JSON Schema 축약형) */
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}

/** LLM 에게 노출하는 도구 하나의 정의. 도구(tools.ts)와 어댑터(llm/*)가 공유한다. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface CatalogEntry {
  id?: string;
  title: string;
  /** "2026-07 · 사진 12" 같은 보조 정보 */
  hint?: string;
  /**
   * 항목의 **본문**. 글이 본체인 것들(아기 기록·게시판 글·일정 메모)이 여기에 담는다.
   *
   * ⚠️ **시스템 목차(`catalog.ts`)는 이 값을 쓰지 않는다.** 목차는 17종이 4,000자 안에 다
   * 들어가야 하는 자리라, 본문을 넣으면 한 종류가 다른 종류를 밀어낸다.
   * 이 값은 `list_resource` 로 한 종류를 펼쳐 볼 때만 나간다 — "훑어보기"와 "읽기"를 가른다.
   */
  body?: string;
}

export interface CreateSpec {
  /** 기존 API 라우트. 검증을 중복 구현하지 않기 위해 이 라우트를 그대로 호출한다. */
  api: string;
  describe: string;
  schema: JsonSchema;
  /** 도구 인자 → API 본문. 문맥(babyId 등)은 여기서 채운다. */
  toBody(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** 되돌리기용 DELETE 경로. 없으면 되돌릴 수 없는 추가로 표시된다. */
  undoApi?: (id: string) => string;
}

/**
 * 고치기·되돌리기에서 오가는 값의 모양. 라우트가 받는 JSON 그대로다 — 숫자·객체는 없다.
 * (되돌리기 라우트가 클라이언트가 보낸 값을 이 셋으로만 거른다.)
 */
export type FieldValue = string | boolean | null;

/**
 * 고치기(2026-10-19). **선언한 리소스만** 고칠 수 있다 — 지금은 기념일 하나.
 *
 * 되돌리기는 "고치기 직전 값으로 다시 고치기" 다. 그래서 `snapshot` 은 **`toBody` 가 만들 수
 * 있는 키를 PATCH 본문 모양 그대로** 돌려줘야 한다. 모양이 다르면(날짜를 ISO 로, 사람을 이름으로)
 * 되돌릴 때 라우트가 못 알아듣거나 하루가 밀린다.
 */
export interface UpdateSpec {
  /** 기존 PATCH 라우트. 경로는 서버만 만든다(되돌리기 라우트도 이 함수로만). */
  api(id: string): string;
  describe: string;
  /** 전부 선택 — 바꿀 것만 받는다. */
  schema: JsonSchema;
  /**
   * 도구 인자 → PATCH 본문. **모델이 준 키만** 넣는다. 빠진 칸을 null 로 바꾸면 그 칸이 지워진다 —
   * "메모 고쳐 줘" 에 날짜가 사라진다. 비우기는 명시적인 신호(null·"없음")로만.
   */
  toBody(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** 지금 값(PATCH 본문 모양). 없는 id 면 null. 고치기 **전에** 읽어 되돌리기 값으로 쓴다. */
  snapshot(id: string): Promise<Record<string, FieldValue> | null>;
  /** 되돌릴 때 받아 주는 PATCH 본문 키. `snapshot` 이 내는 키를 전부 담아야 한다(빠지면 조용히 안 되돌아간다). */
  fields: string[];
}

/**
 * 지우기(2026-10-19). 모델은 **지우지 않는다** — `delete_item` 은 확인 카드만 띄우고,
 * 가족이 카드의 [지우기]를 눌러야 서버(`/api/agent/remove`)가 이 경로로 DELETE 한다.
 */
export interface RemoveSpec {
  api(id: string): string;
}

/**
 * 항목 id 로 받아 줄 글자. id 는 경로 조각이 된다 — cuid 밖의 글자(`/` `..` `?`)가 섞이면
 * 모델이나 클라이언트가 PATCH·DELETE 목적지를 고르게 된다. 도구와 라우트가 이 하나를 같이 쓴다.
 */
export const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface AgentResource {
  key: string;
  label: string;
  listPath: string;
  /**
   * 사이트 목차(`buildCatalog`)에 낼지. 기본은 낸다.
   *
   * `false` 인 것은 지금 **기억(`memory`)** 하나다. 목차는 "사이트에 뭐가 있나" 에 답하는
   * 자리고 기억은 "내가 아는 것" 이라 질문이 다르다. 같은 4,000자를 두고 게시판 글과
   * 다투게 두면, 글이 늘어난 날 기억이 조용히 접힌다 — 기억은 접히면 안 되는 쪽이다.
   * 대신 안내문에 **제 몫의 예산**을 가진 칸으로 들어간다(`loop.ts` 의 `memoryLines`).
   */
  inCatalog?: boolean;
  /** "/plans/:id" — 경로 해석이 역방향으로 동작해야 하므로 함수가 아니라 패턴이다. */
  detailPattern?: string;
  catalog(): Promise<CatalogEntry[]>;
  /** 항목이 하나뿐인 리소스(아기)는 detailPattern 이 없어 경로에 id 가 없다 — 그때는 인자 없이 불린다. */
  detail?(id?: string): Promise<unknown>;
  create?: CreateSpec;
  update?: UpdateSpec;
  remove?: RemoveSpec;
}

export function findResource(key: string, resources: AgentResource[]): AgentResource | undefined {
  return resources.find((r) => r.key === key);
}

export function detailPath(resource: AgentResource, id: string): string {
  return resource.detailPattern ? resource.detailPattern.replace(":id", id) : resource.listPath;
}

/** 경로 → {key, id}. 등록되지 않은 경로는 null (임의 경로 탐색 차단). */
export function resolvePath(
  path: string,
  resources: AgentResource[]
): { key: string; id?: string } | null {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  for (const r of resources) {
    if (clean === r.listPath) return { key: r.key, id: undefined };
    if (!r.detailPattern) continue;
    const prefix = r.detailPattern.replace("/:id", "");
    if (clean.startsWith(prefix + "/")) {
      const rest = clean.slice(prefix.length + 1);
      if (rest && !rest.includes("/")) return { key: r.key, id: rest };
    }
  }
  return null;
}
