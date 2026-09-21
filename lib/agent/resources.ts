// 에이전트가 다루는 리소스 16종. 목차(catalog)·상세(detail)·추가(create)가 모두 여기서 파생된다.
// 규칙: LLM 에게 내부 식별자(cuid)를 묻지 않는다. 앨범/계획은 제목으로, 아기는 1명으로,
// 가족 구성원은 이름(또는 역할)으로 찾아 toBody 가 채운다.
// 값 검증은 기존 API 라우트가 하므로 여기서 중복하지 않는다(빈 값은 undefined 로 넘겨 기본값을 살린다).

import { prisma } from "@/lib/prisma";
import { kindMeta } from "@/app/baby/baby-meta";
import { dday, kDateShort, kTime, startOfDay } from "@/lib/date";
import { NAV } from "@/lib/nav";
import type { AgentResource, CatalogEntry } from "./registry";

/** 빈 문자열·공백은 "값 없음"으로 본다. */
function optStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

/** LLM 이 "50" 처럼 문자열로 보내도 숫자로 받는다. */
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** true/false 와 "true"/"false" 를 모두 받는다. */
function optBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/** 여러 줄 본문에서 첫 줄만 뽑아 목차 제목으로 쓴다. */
function firstLine(text: string, max = 40): string {
  const line = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line || "(내용 없음)";
}

function hintOf(parts: (string | null | undefined | false)[]): string | undefined {
  const s = parts.filter(Boolean).join(" · ");
  return s || undefined;
}

/** 아기는 1명만 다룬다(UI 규칙과 동일). 없으면 null. */
async function currentBabyId(): Promise<string | null> {
  const baby = await prisma.baby.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  return baby?.id ?? null;
}

/** 아기 관련 추가는 아기가 등록되어 있어야 한다. */
async function requireBabyId(): Promise<string> {
  const babyId = await currentBabyId();
  if (!babyId) throw new Error("아기 정보가 아직 없어요. 아기 페이지에서 먼저 등록해 주세요.");
  return babyId;
}

/** 제목으로 앨범 찾기. 대소문자만 무시하고 정확히 일치(부분 일치는 엉뚱한 앨범을 고를 수 있다). */
async function albumIdByTitle(title: unknown): Promise<string> {
  const t = optStr(title);
  if (!t) throw new Error("어느 앨범에 넣을지 앨범 제목을 알려주세요.");
  const album = await prisma.album.findFirst({
    where: { title: { equals: t, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!album) throw new Error(`"${t}" 앨범을 찾지 못했어요. 앨범을 먼저 만들어 주세요.`);
  return album.id;
}

/** 제목으로 계획 찾기. 같은 제목이 여럿이면 최근에 만든 것. */
async function planIdByTitle(title: unknown): Promise<string> {
  const t = optStr(title);
  if (!t) throw new Error("어느 계획에 넣을지 계획 제목을 알려주세요.");
  const plan = await prisma.plan.findFirst({
    where: { title: { equals: t, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!plan) throw new Error(`"${t}" 계획을 찾지 못했어요. 계획을 먼저 만들어 주세요.`);
  return plan.id;
}

/** 이름 또는 역할("엄마")로 가족 구성원 찾기. 비워 두면 담당자를 지정하지 않는다. */
async function memberIdByName(name: unknown): Promise<string | undefined> {
  const n = optStr(name);
  if (!n) return undefined;
  const member = await prisma.familyMember.findFirst({
    where: {
      OR: [{ name: { equals: n, mode: "insensitive" } }, { role: { equals: n, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!member) throw new Error(`가족 구성원 "${n}" 을(를) 찾지 못했어요.`);
  return member.id;
}

/**
 * 목차·목록이 한 리소스에서 한 번에 읽어 오는 행 수 상한. DB 와 프롬프트를 지키려고 둔 값이지
 * "이게 전부"라는 뜻이 **아니다** — 상한에 걸리면 `capped()` 가 "더 있음" 한 줄을 남긴다.
 * 각 catalog 에 숫자를 흩어 놓지 않고 여기 한 곳에서만 정한다(흩어지면 조용한 누락이 다시 생긴다).
 * config.ts(환경변수)로 빼지 않은 이유: 운영자가 조절할 값이 아니라 목록의 모양을 정하는 상수다.
 */
export const LIST_TAKE = 30;

/**
 * 안내문에 실을 기억의 수. 목록(`/memories`)에는 전부 있고, **포동이가 들고 다니는 것**만
 * 이만큼이다. 무한정 늘리면 매 턴 이것이 안내문을 먹는다 — 기억은 싸야 자주 쓴다.
 */
export const MEMORY_TAKE = 12;

/** 앞으로의 일정이 하나도 없을 때만 대신 싣는 "지난 일정" 폴백의 상한. 보조 정보라 더 짧다. */
export const PAST_TAKE = 10;

/** 상한에 걸려 잘렸다는 표시. 목차와 `list_resource` 가 같은 문구를 쓴다. */
export const MORE_TITLE = "…더 있음";

/**
 * 상한까지 꽉 차게 읽혔으면 "더 있음" 한 줄을 덧붙인다.
 * 리소스별 분기 없이, 상한이 있는 모든 목록이 같은 규칙을 쓴다.
 * 행 수가 딱 상한과 같을 때도 붙는다(한 줄 더 읽어 확인하지는 않는다) — 더 없는데 "더 있을지 모른다"고
 * 말하는 쪽이, 있는데 "없다"고 말하는 것보다 안전하기 때문이다.
 */
function capped(entries: CatalogEntry[], take: number): CatalogEntry[] {
  return entries.length >= take ? [...entries, { title: MORE_TITLE }] : entries;
}

/** 스티커를 붙일 수 있는 페이지 목록(상단 메뉴 + 모든 페이지). */
const DECORATION_PAGES = [...NAV.map((n) => n.href), "global"];

// 배열 순서가 의미를 갖는다: listPath 가 겹칠 때 resolvePath 는 먼저 나온 리소스를 고른다.
// 따라서 부모(album·plan·baby)가 자식(photo·planItem·babyEntry …)보다 앞에 있어야 한다.
export const RESOURCES: AgentResource[] = [
  {
    key: "familyMember",
    label: "가족",
    // 가족만 모아 보는 페이지는 없다. 겹치지 않게 둔 가상 경로다.
    // 목차에 올리는 이유: todo·anniversary·board·shopping·babyEntry 가 이름/역할로 사람을 찾는데,
    // 이름을 모르면 LLM 이 지어내고 memberIdByName 이 throw 해서 추가가 통째로 실패한다.
    listPath: "/family",
    async catalog() {
      const rows = await prisma.familyMember.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, role: true },
      });
      // 역할이 이름과 같으면("아빠"/"아빠") 굳이 두 번 적지 않는다.
      return rows.map((m) => ({
        id: m.id,
        title: m.name,
        hint: m.role && m.role !== m.name ? m.role : undefined,
      }));
    },
    // 읽기 전용. 가족 구성원은 에이전트가 만들지 않는다.
  },

  {
    key: "album",
    label: "앨범",
    listPath: "/albums",
    detailPattern: "/albums/:id",
    async catalog() {
      const rows = await prisma.album.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, takenOn: true, _count: { select: { photos: true } } },
      });
      return rows.map((a) => ({
        id: a.id,
        title: a.title,
        hint: [a.takenOn ? kDateShort(a.takenOn) : null, `사진 ${a._count.photos}`]
          .filter(Boolean)
          .join(" · "),
      }));
    },
    // 앨범은 detailPattern 이 있으므로 언제나 id 와 함께 불린다.
    async detail(id: string) {
      return prisma.album.findUnique({
        where: { id },
        include: { photos: { orderBy: { sortOrder: "asc" } } },
      });
    },
    create: {
      api: "/api/albums",
      describe: "새 사진첩(앨범)을 만든다. 사진을 넣으려면 먼저 앨범이 있어야 한다.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "앨범 제목. 예: 발리 여행" },
          description: { type: "string", description: "한 줄 설명(선택)" },
          takenOn: { type: "string", description: "여행/이벤트 날짜 yyyy-MM-dd(선택)" },
        },
        required: ["title"],
      },
      async toBody(args) {
        return {
          title: String(args.title ?? "").trim(),
          description: args.description ? String(args.description) : undefined,
          takenOn: args.takenOn ? String(args.takenOn) : undefined,
        };
      },
      undoApi: (id) => `/api/albums/${id}`,
    },
  },

  {
    key: "photo",
    label: "사진",
    listPath: "/albums",
    async catalog() {
      const count = await prisma.photo.count();
      return count ? [{ title: `사진 ${count}장` }] : [];
    },
    create: {
      api: "/api/photos",
      describe:
        "이미 올라간 사진 주소를 앨범에 넣는다. 앨범은 제목으로 지정한다(없는 앨범이면 먼저 앨범을 만들어야 한다).",
      schema: {
        type: "object",
        properties: {
          albumTitle: { type: "string", description: "넣을 앨범의 제목. 목차에 있는 제목 그대로" },
          url: { type: "string", description: "사진 주소" },
          caption: { type: "string", description: "사진 설명(선택)" },
          takenAt: { type: "string", description: "찍은 날짜 yyyy-MM-dd(선택)" },
        },
        required: ["albumTitle", "url"],
      },
      async toBody(args) {
        return {
          albumId: await albumIdByTitle(args.albumTitle),
          url: String(args.url ?? "").trim(),
          caption: optStr(args.caption),
          takenAt: optStr(args.takenAt),
        };
      },
      undoApi: (id) => `/api/photos/${id}`,
    },
  },

  {
    key: "plan",
    label: "계획",
    listPath: "/plans",
    detailPattern: "/plans/:id",
    async catalog() {
      const rows = await prisma.plan.findMany({
        orderBy: { createdAt: "desc" },
        take: LIST_TAKE,
        select: {
          id: true,
          title: true,
          type: true,
          startDate: true,
          endDate: true,
          _count: { select: { items: true } },
        },
      });
      return capped(
        rows.map((p) => ({
          id: p.id,
          title: p.title,
          hint: hintOf([
            p.type,
            p.startDate ? `${kDateShort(p.startDate)}${p.endDate ? `~${kDateShort(p.endDate)}` : ""}` : null,
            `일정 ${p._count.items}`,
          ]),
        })),
        LIST_TAKE
      );
    },
    // 계획도 detailPattern 이 있으므로 언제나 id 와 함께 불린다.
    async detail(id: string) {
      return prisma.plan.findUnique({
        where: { id },
        include: {
          items: { orderBy: [{ dayDate: "asc" }, { sortOrder: "asc" }] },
          checklist: { orderBy: { sortOrder: "asc" } },
        },
      });
    },
    create: {
      api: "/api/plans",
      describe: "여행·주말 같은 계획을 새로 만든다. 날짜별 일정이나 준비물은 계획을 만든 뒤에 넣는다.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "계획 제목. 예: 여름 제주도 여행" },
          type: {
            type: "string",
            description: "계획 종류(선택). 비우면 여행",
            enum: ["여행", "주말", "이벤트", "기타"],
          },
          description: { type: "string", description: "한 줄 설명(선택)" },
          location: { type: "string", description: "장소(선택). 예: 제주도" },
          startDate: { type: "string", description: "시작 날짜 yyyy-MM-dd(선택)" },
          endDate: { type: "string", description: "끝 날짜 yyyy-MM-dd(선택)" },
        },
        required: ["title"],
      },
      async toBody(args) {
        return {
          title: String(args.title ?? "").trim(),
          type: optStr(args.type),
          description: optStr(args.description),
          location: optStr(args.location),
          startDate: optStr(args.startDate),
          endDate: optStr(args.endDate),
        };
      },
      undoApi: (id) => `/api/plans/${id}`,
    },
  },

  {
    key: "planItem",
    label: "계획 일정",
    listPath: "/plans",
    async catalog() {
      const count = await prisma.planItem.count();
      return count ? [{ title: `계획 속 일정 ${count}개` }] : [];
    },
    create: {
      api: "/api/plan-items",
      describe:
        "계획 안에 날짜별 일정 한 줄을 추가한다. 어느 계획인지는 계획 제목으로 지정한다.",
      schema: {
        type: "object",
        properties: {
          planTitle: { type: "string", description: "일정을 넣을 계획의 제목. 목차에 있는 제목 그대로" },
          title: { type: "string", description: "일정 내용. 예: 우붓 시장 구경" },
          dayDate: { type: "string", description: "이 일정이 속한 날짜 yyyy-MM-dd(선택)" },
          time: { type: "string", description: "시각 HH:mm(선택)" },
          tz: {
            type: "string",
            description: "시각 기준(선택). local=현지시간, home=한국시간. 비우면 현지시간",
            enum: ["local", "home"],
          },
          note: { type: "string", description: "메모(선택)" },
          location: { type: "string", description: "장소(선택)" },
        },
        required: ["planTitle", "title"],
      },
      async toBody(args) {
        return {
          planId: await planIdByTitle(args.planTitle),
          title: String(args.title ?? "").trim(),
          dayDate: optStr(args.dayDate),
          time: optStr(args.time),
          tz: optStr(args.tz),
          note: optStr(args.note),
          location: optStr(args.location),
        };
      },
      undoApi: (id) => `/api/plan-items/${id}`,
    },
  },

  {
    key: "planChecklist",
    label: "계획 준비 체크리스트",
    listPath: "/plans",
    async catalog() {
      const count = await prisma.planChecklistItem.count();
      return count ? [{ title: `계획 준비 항목 ${count}개` }] : [];
    },
    create: {
      api: "/api/plan-checklist",
      describe:
        "계획의 준비 체크리스트에 항목을 추가한다. prep=떠나기 전 준비, packing=챙길 준비물.",
      schema: {
        type: "object",
        properties: {
          planTitle: { type: "string", description: "항목을 넣을 계획의 제목. 목차에 있는 제목 그대로" },
          text: { type: "string", description: "체크리스트 항목. 예: 여권 챙기기" },
          kind: {
            type: "string",
            description: "종류(선택). 비우면 준비물",
            enum: ["prep", "packing"],
          },
        },
        required: ["planTitle", "text"],
      },
      async toBody(args) {
        return {
          planId: await planIdByTitle(args.planTitle),
          text: String(args.text ?? "").trim(),
          kind: optStr(args.kind),
        };
      },
      undoApi: (id) => `/api/plan-checklist/${id}`,
    },
  },

  {
    key: "todo",
    label: "할일",
    listPath: "/todos",
    async catalog() {
      // 끝난 할일이 목차를 차지하면 "할일 뭐 있어?"에 이미 끝난 것을 읊게 된다.
      // 남은 할일을 먼저 싣고, 끝난 것은 개수만 덧붙인다.
      const [rows, doneCount] = await Promise.all([
        prisma.todo.findMany({
          where: { done: false },
          orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
          select: { id: true, title: true, date: true },
          take: LIST_TAKE,
        }),
        prisma.todo.count({ where: { done: true } }),
      ]);
      const entries: CatalogEntry[] = capped(
        rows.map((t) => ({ id: t.id, title: t.title, hint: kDateShort(t.date) })),
        LIST_TAKE
      );
      if (doneCount) entries.push({ title: `완료한 할일 ${doneCount}개` });
      return entries;
    },
    create: {
      api: "/api/todos",
      describe: "할일을 추가한다.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "할 일 내용" },
          date: { type: "string", description: "할 날짜 yyyy-MM-dd. 비우면 오늘" },
          dueTime: { type: "string", description: "시각 HH:mm(선택)" },
          priority: {
            type: "string",
            description: "중요도(선택). 비우면 보통",
            enum: ["low", "normal", "high"],
          },
          memberName: {
            type: "string",
            description: "맡을 사람(선택). 목차의 가족에 있는 이름이나 역할 그대로. 예: 엄마",
          },
        },
        required: ["title"],
      },
      async toBody(args) {
        return {
          title: String(args.title ?? "").trim(),
          date: args.date ? String(args.date) : undefined,
          dueTime: args.dueTime ? String(args.dueTime) : undefined,
          priority: optStr(args.priority),
          memberId: await memberIdByName(args.memberName),
        };
      },
      undoApi: (id) => `/api/todos/${id}`,
    },
  },

  {
    key: "event",
    label: "캘린더 일정",
    listPath: "/calendar",
    async catalog() {
      const select = { id: true, title: true, start: true, allDay: true, location: true, description: true };
      // 다가오는 일정 위주로 보여주되, 앞으로의 일정이 없으면 최근 지난 일정이라도 보여준다
      // (빈 목차는 "일정이 하나도 없다"는 잘못된 답으로 이어진다).
      let rows = await prisma.calendarEvent.findMany({
        where: { start: { gte: startOfDay(new Date()) } },
        orderBy: { start: "asc" },
        select,
        take: LIST_TAKE,
      });
      // 폴백으로 지난 일정을 싣는 경우, 표시가 없으면 "다음 일정"을 지난 일로 답하게 된다.
      let past = false;
      if (rows.length === 0) {
        rows = (
          await prisma.calendarEvent.findMany({ orderBy: { start: "desc" }, select, take: PAST_TAKE })
        ).reverse();
        past = true;
      }
      return capped(
        rows.map((e) => ({
          id: e.id,
          title: e.title,
          hint: hintOf([
            past ? "지난 일정" : null,
            kDateShort(e.start),
            e.allDay ? "하루 종일" : kTime(e.start),
            e.location,
          ]),
          ...(e.description ? { body: e.description } : {}),
        })),
        past ? PAST_TAKE : LIST_TAKE
      );
    },
    create: {
      api: "/api/events",
      describe: "가족 캘린더에 일정을 추가한다. 시각이 정해지지 않았으면 하루 종일 일정으로 만든다.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "일정 제목" },
          date: { type: "string", description: "날짜 yyyy-MM-dd" },
          allDay: { type: "boolean", description: "하루 종일 일정이면 true(선택)" },
          startTime: { type: "string", description: "시작 시각 HH:mm(선택). 하루 종일이면 비운다" },
          endTime: { type: "string", description: "끝 시각 HH:mm(선택)" },
          description: { type: "string", description: "설명(선택)" },
          location: { type: "string", description: "장소(선택)" },
        },
        required: ["title", "date"],
      },
      async toBody(args) {
        return {
          title: String(args.title ?? "").trim(),
          date: optStr(args.date),
          allDay: optBool(args.allDay),
          startTime: optStr(args.startTime),
          endTime: optStr(args.endTime),
          description: optStr(args.description),
          location: optStr(args.location),
        };
      },
      undoApi: (id) => `/api/events/${id}`,
    },
  },

  {
    key: "anniversary",
    label: "기념일",
    listPath: "/anniversaries",
    async catalog() {
      const rows = await prisma.anniversary.findMany({
        orderBy: { date: "asc" },
        select: { id: true, title: true, date: true, type: true, recurring: true, note: true },
        take: LIST_TAKE,
      });
      // 저장된 원본 날짜를 그대로 쓰면 반복 기념일의 요일이 수십 년 전 요일이 된다.
      // 화면들과 똑같이 dday 의 nextDate 를 쓴다(반복이 아니면 원본 날짜와 같다).
      const entries = rows
        .map((a) => ({ ...a, d: dday(a.date, { recurring: a.recurring }) }))
        // 다가오는 것을 가까운 순으로 앞에, 이미 지난 것(반복이 아닌 기념일)은 최근 순으로 뒤에.
        // 지난 것이 앞에 오면 "다음 기념일"을 지난 일로 답하게 된다.
        .sort((x, y) => {
          const xPast = x.d.days < 0 ? 1 : 0;
          const yPast = y.d.days < 0 ? 1 : 0;
          if (xPast !== yPast) return xPast - yPast;
          return xPast ? y.d.days - x.d.days : x.d.days - y.d.days;
        })
        .map((a) => ({
          id: a.id,
          title: a.title,
          hint: hintOf([
            a.d.days < 0 ? "지난 기념일" : null,
            kDateShort(a.d.nextDate),
            a.d.label,
            a.recurring ? "매년" : null,
          ]),
          ...(a.note ? { body: a.note } : {}),
        }));
      return capped(entries, LIST_TAKE);
    },
    create: {
      api: "/api/anniversaries",
      describe: "생일·기념일을 추가한다. D-day 로 표시된다.",
      schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "기념일 이름. 예: 결혼기념일" },
          date: { type: "string", description: "날짜 yyyy-MM-dd" },
          type: {
            type: "string",
            description: "종류(선택). 비우면 기념일",
            enum: ["birthday", "anniversary", "memorial", "event"],
          },
          recurring: { type: "boolean", description: "매년 반복하면 true(선택). 비우면 매년 반복" },
          note: { type: "string", description: "메모(선택)" },
          memberName: {
            type: "string",
            description: "관련된 사람(선택). 목차의 가족에 있는 이름이나 역할 그대로",
          },
        },
        required: ["title", "date"],
      },
      async toBody(args) {
        return {
          title: String(args.title ?? "").trim(),
          date: optStr(args.date),
          type: optStr(args.type),
          recurring: optBool(args.recurring),
          note: optStr(args.note),
          memberId: await memberIdByName(args.memberName),
        };
      },
      undoApi: (id) => `/api/anniversaries/${id}`,
    },
  },

  {
    key: "board",
    label: "게시판 글",
    listPath: "/board",
    async catalog() {
      const rows = await prisma.boardPost.findMany({
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        select: { id: true, content: true, pinned: true, createdAt: true, author: { select: { name: true } } },
        take: LIST_TAKE,
      });
      return capped(
        rows.map((p) => ({
          id: p.id,
          title: firstLine(p.content),
          hint: hintOf([kDateShort(p.createdAt), p.author?.name, p.pinned ? "고정" : null]),
          body: p.content,
        })),
        LIST_TAKE
      );
    },
    create: {
      api: "/api/board",
      describe: "가족 게시판에 글을 올린다. 내용은 마크다운으로 쓸 수 있다.",
      schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "글 내용(마크다운)" },
          pinned: { type: "boolean", description: "맨 위에 고정하려면 true(선택)" },
          authorName: {
            type: "string",
            description: "쓴 사람(선택). 목차의 가족에 있는 이름이나 역할 그대로",
          },
        },
        required: ["content"],
      },
      async toBody(args) {
        return {
          content: String(args.content ?? "").trim(),
          pinned: optBool(args.pinned),
          authorId: await memberIdByName(args.authorName),
        };
      },
      undoApi: (id) => `/api/board/${id}`,
    },
  },

  {
    key: "shopping",
    label: "장보기",
    listPath: "/shopping",
    async catalog() {
      const rows = await prisma.shoppingItem.findMany({
        orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
        select: { id: true, name: true, quantity: true, done: true },
        take: LIST_TAKE,
      });
      return capped(
        rows.map((s) => ({
          id: s.id,
          title: s.name,
          hint: hintOf([s.quantity, s.done ? "완료" : null]),
        })),
        LIST_TAKE
      );
    },
    create: {
      api: "/api/shopping",
      describe: "장보기 목록에 살 것을 추가한다.",
      schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "살 것. 예: 우유" },
          quantity: { type: "string", description: "수량(선택). 예: 2개, 1L" },
          memberName: {
            type: "string",
            description: "담은 사람(선택). 목차의 가족에 있는 이름이나 역할 그대로",
          },
        },
        required: ["name"],
      },
      async toBody(args) {
        return {
          name: String(args.name ?? "").trim(),
          quantity: optStr(args.quantity),
          addedById: await memberIdByName(args.memberName),
        };
      },
      undoApi: (id) => `/api/shopping/${id}`,
    },
  },

  {
    key: "baby",
    label: "아기",
    listPath: "/baby",
    async catalog() {
      const baby = await prisma.baby.findFirst({
        orderBy: { createdAt: "desc" },
        select: { nickname: true, dueDate: true, birthDate: true, _count: { select: { entries: true } } },
      });
      if (!baby) return [];
      return [{
        title: baby.nickname,
        hint: [
          baby.birthDate ? `출생 ${kDateShort(baby.birthDate)}` : `예정일 ${kDateShort(baby.dueDate)}`,
          `기록 ${baby._count.entries}`,
        ].join(" · "),
      }];
    },
    // 아기는 1명이라 상세 경로(/baby/:id)가 없다 → open_page("/baby") 가 id 없이 부른다.
    async detail() {
      return prisma.baby.findFirst({
        orderBy: { createdAt: "desc" },
        include: {
          // 기록은 최근 것만 싣는다. 몇 개를 못 실었는지는 _count 로 함께 알려 준다
          // (잘린 줄 모르면 "기록은 이게 전부"라고 답해 버린다).
          entries: { orderBy: { date: "desc" }, take: LIST_TAKE, include: { author: true } },
          checklist: { orderBy: { sortOrder: "asc" } },
          links: { orderBy: { sortOrder: "asc" } },
          _count: { select: { entries: true } },
        },
      });
    },
    // 아기 자체는 agent 가 만들지 않는다(예정일 등은 사람이 정한다).
  },

  {
    key: "babyEntry",
    label: "아기 기록",
    listPath: "/baby",
    // 개수만 세어 주던 자리다. 부부가 주고받는 교환일기인데 에이전트가 "12개" 라는 것밖에
    // 몰라서, 자기가 적어 준 기록조차 다시 읽지 못했다.
    async catalog() {
      const rows = await prisma.babyEntry.findMany({
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: { id: true, kind: true, date: true, mood: true, content: true, author: { select: { name: true } } },
        take: LIST_TAKE,
      });
      return capped(
        rows.map((e) => ({
          id: e.id,
          title: firstLine(e.content),
          hint: hintOf([kindMeta(e.kind).label, kDateShort(e.date), e.author?.name, e.mood]),
          body: e.content,
        })),
        LIST_TAKE
      );
    },
    create: {
      api: "/api/baby-entries",
      describe:
        "아기 페이지에 기록을 남긴다. diary=일상, checkup=검진, letter=아기에게 쓰는 편지.",
      schema: {
        type: "object",
        properties: {
          content: { type: "string", description: "기록 내용(마크다운)" },
          date: { type: "string", description: "기록 날짜 yyyy-MM-dd. 비우면 오늘" },
          kind: {
            type: "string",
            description: "기록 종류(선택). 비우면 일상",
            enum: ["diary", "checkup", "letter"],
          },
          mood: { type: "string", description: "그날 컨디션 이모지 하나(선택). 예: 😊" },
          authorName: {
            type: "string",
            description: "쓴 사람(선택). 목차의 가족에 있는 이름이나 역할 그대로",
          },
        },
        required: ["content"],
      },
      async toBody(args) {
        return {
          babyId: await requireBabyId(),
          content: String(args.content ?? "").trim(),
          date: optStr(args.date),
          kind: optStr(args.kind),
          mood: optStr(args.mood),
          authorId: await memberIdByName(args.authorName),
        };
      },
      undoApi: (id) => `/api/baby-entries/${id}`,
    },
  },

  {
    key: "babyChecklist",
    label: "아기 준비 체크리스트",
    listPath: "/baby",
    async catalog() {
      const [count, done] = await Promise.all([
        prisma.babyChecklistItem.count(),
        prisma.babyChecklistItem.count({ where: { done: true } }),
      ]);
      return count ? [{ title: `아기 준비 항목 ${count}개`, hint: `완료 ${done}` }] : [];
    },
    create: {
      api: "/api/baby-checklist",
      describe: "아기 맞이 준비 체크리스트에 항목 하나를 추가한다.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "체크리스트 항목. 예: 산모수첩 챙기기" },
        },
        required: ["text"],
      },
      async toBody(args) {
        return { babyId: await requireBabyId(), text: String(args.text ?? "").trim() };
      },
      undoApi: (id) => `/api/baby-checklist/${id}`,
    },
  },

  {
    key: "babyLink",
    label: "아기 참고 사이트",
    listPath: "/baby",
    async catalog() {
      const count = await prisma.babyLink.count();
      return count ? [{ title: `참고 사이트 ${count}개` }] : [];
    },
    create: {
      api: "/api/baby-links",
      describe:
        "아기 페이지의 참고 사이트에 링크를 추가한다. 임신·육아 관련 자료 URL을 저장할 때 쓴다.",
      schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "사이트 주소" },
          title: { type: "string", description: "한 줄 설명. 비우면 도메인이 표시된다" },
        },
        required: ["url"],
      },
      async toBody(args) {
        const babyId = await requireBabyId();
        return { babyId, url: String(args.url ?? "").trim(), title: String(args.title ?? "").trim() };
      },
      undoApi: (id) => `/api/baby-links/${id}`,
    },
  },

  {
    key: "decoration",
    // 스티커만 모아 보는 페이지는 없다. 목록 경로는 다른 리소스와 겹치지 않게 둔 가상 경로다.
    // ("/" 를 쓰면 홈이 "스티커 목록"으로 해석되어 홈 질문에 엉뚱하게 답한다.)
    label: "꾸미기 스티커",
    listPath: "/decorations",
    async catalog() {
      const count = await prisma.decoration.count();
      return count ? [{ title: `스티커 ${count}개` }] : [];
    },
    create: {
      api: "/api/decorations",
      describe:
        "페이지에 사진 스티커를 붙인다. 이미 올라간 사진 주소가 필요하고, 페이지 꾸미기는 관리자만 할 수 있다.",
      schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "스티커로 쓸 사진 주소" },
          page: {
            type: "string",
            description: "붙일 페이지 경로(선택). global 은 모든 페이지. 비우면 global",
            enum: DECORATION_PAGES,
          },
          xPct: { type: "number", description: "가로 위치 %(선택, 중심 기준). 비우면 50" },
          yPx: { type: "number", description: "세로 위치 px(선택, 중심 기준). 비우면 200" },
          width: { type: "number", description: "너비 px(선택). 비우면 160" },
          rotation: { type: "number", description: "기울기 도(선택). 비우면 0" },
        },
        required: ["url"],
      },
      async toBody(args) {
        const page = optStr(args.page);
        return {
          url: String(args.url ?? "").trim(),
          page: page && DECORATION_PAGES.includes(page) ? page : undefined,
          xPct: optNum(args.xPct),
          yPx: optNum(args.yPx),
          width: optNum(args.width),
          rotation: optNum(args.rotation),
        };
      },
      undoApi: (id) => `/api/decorations/${id}`,
    },
  },

  {
    key: "memory",
    label: "기억",
    listPath: "/memories",
    // **목차에는 안 나온다.** 목차는 "사이트에 뭐가 있나" 고 기억은 "내가 아는 것" 이다.
    // 같은 4,000자를 두고 게시판 글과 다투게 두면 글이 늘어난 날 기억이 조용히 접힌다.
    // 대신 안내문에 제 몫의 칸으로 들어간다(`loop.ts` 의 `memoryLines`).
    inCatalog: false,
    async catalog() {
      const rows = await prisma.agentMemory.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, text: true, by: true, createdAt: true },
        take: MEMORY_TAKE,
      });
      // 다른 16종과 같은 규칙으로 꼬리("…더 있음")를 단다 — 잘린 것을 전부인 척하지 않는다.
      return capped(
        rows.map((m) => ({
          id: m.id,
          title: m.text,
          // 누가 적었는지를 **반드시** 붙인다 — 포동이가 짐작해 적은 것과 가족이 말해 준 것이
          // 같아 보이면, 잘못 짐작한 기억이 사실처럼 굳는다.
          hint: hintOf([m.by, kDateShort(m.createdAt)]),
        })),
        MEMORY_TAKE
      );
    },
    create: {
      api: "/api/memories",
      describe:
        "다음 대화에서도 기억할 **한 줄짜리 사실**을 적어 둔다. 대화 요약이나 할 일을 넣는 곳이 아니다.",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "기억할 한 줄. 예: 아내 예정일은 2027년 5월 3일" },
          by: {
            type: "string",
            description: "가족이 직접 말해 준 사실이면 가족, 대화에서 알아낸 것이면 포동이",
            enum: ["포동이", "가족"],
          },
        },
        required: ["text"],
      },
      async toBody(args) {
        return { text: String(args.text ?? "").trim(), by: optStr(args.by) };
      },
      undoApi: (id) => `/api/memories/${id}`,
    },
  },
];
