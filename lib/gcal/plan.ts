// 동기화 한 번에 무엇을 할지 정한다(순수 함수 — DB·네트워크 없음, 스펙 §5). 실행은 sync.ts 가 한다.
//
// 지키는 것
// - **지우기는 끝까지 읽은 목록에서만.** `complete` 가 아니면 deleteSite·recheck 를 하나도 만들지 않는다.
//   반쯤 읽은 목록에서 "없음 = 지워짐" 으로 보면 창 안의 사이트 일정이 한꺼번에 지워진다.
// - 끝까지 읽었어도 "목록에 없음" 만으로는 지우지 않는다 — recheck(하나씩 다시 묻기)로 넘긴다.
//   반복 시리즈를 통째로 지우면 회차가 "취소됨" 없이 사라지고, 날짜를 창 밖으로 옮겨도 사라진다. 둘은 다시 물어야 갈린다.
// - 창 밖으로 밀려난 연결은 건드리지 않는다(목록에 안 오는 게 당연하다).
// - readOnly(반복 회차·여러 날)는 사이트에서 구글로 **절대** 보내지 않는다. 연결에 표시가 아직 없어도
//   지금 구글 일정이 그 모양이면 보내지 않는다 — 회차 id 로 PATCH 하면 시리즈가 갈라진다.
// - 둘 다 바뀌었으면 나중 시각이 이긴다. 같으면 구글.
// - 한 연결에서 액션은 많아야 하나. 처음 합치기에서 구글 일정·사이트 일정은 각각 한 번만 짝이 된다.
//
// 액션 순서(시험이 기대는 순서): 연결별(links 순서) → 처음 합치기 link(site 순서) → createSite(google 순서) → pushNew(site 순서).

import type { GEvent } from "./client";
import { readOnlyOf, sameDaySameTitle, seoulDate } from "./map";

export interface PlanSite {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  source: string;
  start: Date;
  title: string;
}

export interface PlanLink {
  id: string;
  eventId: string | null;
  googleEventId: string;
  googleUpdated: Date;
  siteSyncedAt: Date;
  readOnly: string | null;
  pendingPush: boolean;
  pendingDelete: boolean;
}

export interface PlanInput {
  now: Date;
  window: { min: Date; max: Date };
  /** 구글 목록을 끝까지 읽었는가. 아니면 지우기 갈래(deleteSite·recheck)는 하나도 나오지 않는다. */
  complete: boolean;
  google: GEvent[];
  /** 사이트 일정 — 적어도 연결된 것 전부와 연결 없는 것 전부(연결의 짝을 못 찾으면 그 연결은 건너뛴다) */
  site: PlanSite[];
  links: PlanLink[];
  initialDoneAt: Date | null;
  /** 처음 합치기(§5-4)를 이번에 하는가 */
  initial: boolean;
}

export type Action =
  | { kind: "createSite"; google: GEvent }
  | { kind: "updateSite"; linkId: string; eventId: string; google: GEvent }
  | { kind: "deleteSite"; linkId: string; eventId: string }
  | { kind: "recheck"; linkId: string; eventId: string; googleEventId: string }
  | { kind: "link"; eventId: string; google: GEvent }
  | { kind: "pushNew"; eventId: string }
  | { kind: "pushUpdate"; linkId: string; eventId: string; googleEventId: string }
  | { kind: "deleteGoogle"; linkId: string; googleEventId: string };

const time = (iso: string) => new Date(iso).getTime(); // 읽지 못하면 NaN — 비교가 모두 false 라 "안 바뀜" 이 된다

export function planSync(input: PlanInput): Action[] {
  const { complete, window } = input;
  const actions: Action[] = [];

  // 같은 id 가 두 번 와도 하나로(앞의 것)
  const googleById = new Map<string, GEvent>();
  for (const g of input.google) if (!googleById.has(g.id)) googleById.set(g.id, g);
  const siteById = new Map(input.site.map((s) => [s.id, s]));
  const linkedGoogle = new Set(input.links.map((l) => l.googleEventId));
  const linkedSite = new Set(input.links.flatMap((l) => (l.eventId ? [l.eventId] : [])));

  // ── 연결별 ──────────────────────────────────
  for (const link of input.links) {
    // 묘비: 사이트에서 사람이 지운 것. 목록과 상관없이 구글에서 지운다(404·410 이면 이미 없는 것).
    if (link.pendingDelete) {
      actions.push({ kind: "deleteGoogle", linkId: link.id, googleEventId: link.googleEventId });
      continue;
    }
    // 묘비 표시 없이 eventId 만 빈 연결 — 사이트에서 지운 직후(구글 삭제 전)이거나 견본 일정을 통째로 지웠을 때.
    // 여기서 구글을 지우면 사이트 DB 를 비우는 것만으로 진짜 캘린더가 비워진다. 아무것도 하지 않는다.
    if (!link.eventId) continue;
    const site = siteById.get(link.eventId);
    if (!site) continue; // 판단할 재료가 없다

    const g = googleById.get(link.googleEventId);
    const readOnly = link.readOnly != null || (g !== undefined && readOnlyOf(g) !== null);
    const push = () =>
      actions.push({ kind: "pushUpdate", linkId: link.id, eventId: site.id, googleEventId: link.googleEventId });

    if (!g) {
      const inWindow = site.start >= window.min && site.start < window.max;
      if (complete && inWindow) {
        actions.push({ kind: "recheck", linkId: link.id, eventId: site.id, googleEventId: link.googleEventId });
      } else if (link.pendingPush && !readOnly) {
        push(); // 창 밖이라도 못 보낸 변경은 보낸다
      }
      continue;
    }

    if (g.status === "cancelled") {
      if (complete) actions.push({ kind: "deleteSite", linkId: link.id, eventId: site.id });
      continue;
    }

    const googleChanged = time(g.updated) > link.googleUpdated.getTime();
    const siteChanged = site.updatedAt.getTime() > link.siteSyncedAt.getTime() || link.pendingPush;
    const toSite = () => actions.push({ kind: "updateSite", linkId: link.id, eventId: site.id, google: g });

    if (readOnly) {
      if (googleChanged) toSite();
    } else if (googleChanged && siteChanged) {
      // 나중 시각이 이긴다. 같으면 구글.
      if (site.updatedAt.getTime() > time(g.updated)) push();
      else toSite();
    } else if (googleChanged) {
      toSite();
    } else if (siteChanged) {
      push();
    }
  }

  // ── 연결 없는 구글 일정 ──────────────────────
  const unlinkedGoogle = [...googleById.values()].filter((g) => g.status !== "cancelled" && !linkedGoogle.has(g.id));
  const unlinkedSite = input.site.filter((s) => !linkedSite.has(s.id));
  const used = new Set<string>(); // 처음 합치기에서 이미 짝이 된 구글 일정
  const pushNew: Action[] = [];

  if (input.initial) {
    // 처음 합치기: 오늘(Asia/Seoul) 이후의 연결 없는 사이트 일정만. 지난 일정은 사이트에만 둔다.
    const today = seoulDate(input.now);
    for (const s of unlinkedSite) {
      if (seoulDate(s.start) < today) continue;
      const match = unlinkedGoogle.find((g) => !used.has(g.id) && sameDaySameTitle(s, g));
      if (match) {
        used.add(match.id);
        actions.push({ kind: "link", eventId: s.id, google: match });
      } else if (complete) {
        // 끝까지 못 읽었으면 못 읽은 쪽에 짝이 있을 수 있다 — 보내면 둘이 된다.
        pushNew.push({ kind: "pushNew", eventId: s.id });
      }
    }
  } else if (input.initialDoneAt) {
    // 평소: 처음 합치기 뒤에 사이트에서 만들었는데 구글에 못 만든 것(스펙 §6). 날짜와 상관없이.
    const since = input.initialDoneAt.getTime();
    for (const s of unlinkedSite) {
      if (s.source === "local" && s.createdAt.getTime() >= since) pushNew.push({ kind: "pushNew", eventId: s.id });
    }
  }

  for (const g of unlinkedGoogle) if (!used.has(g.id)) actions.push({ kind: "createSite", google: g });
  actions.push(...pushNew);
  return actions;
}
