"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui";
import type {
  FamilyMember,
  Pregnancy,
  CycleEvent,
  JourneyEntryWithAuthor,
  JourneyChecklistItem,
  JourneyLink,
  JourneyPageData,
} from "@/lib/types";
import { fromDateInput } from "@/lib/date";
// "use client" 파일은 journey-core 에서 — lib/journey.ts 는 prisma 를 가져와 브라우저 묶음에 섞인다.
import { stageOf } from "@/lib/journey-core";
import { predictCycle, type CycleKind } from "@/lib/cycle";
import { BabyHero } from "./baby-hero";
import { PrepHero } from "./prep-hero";
import { BabySettingsModal, type BabySettingsPatch } from "./baby-settings-modal";
import { JourneySettingsModal } from "./journey-settings-modal";
import { PregnancyStartModal, type PregnancyStartPayload } from "./pregnancy-start-modal";
import { BackToPrepModal } from "./back-to-prep-modal";
import { CycleCard } from "./cycle-card";
import { CycleEventModal, type CycleEventPayload } from "./cycle-event-modal";
import { EntryModal, type EntryPayload } from "./entry-modal";
import { EntryTimeline, type EntryFilter } from "./entry-timeline";
import { DEFAULT_CHECKLIST } from "./baby-meta";
import { BabyChecklist } from "./baby-checklist";
import { BabyLinks } from "./baby-links";

const JSON_HEADERS = { "Content-Type": "application/json" };
const RETRY = "잠시 후 다시 시도해 주세요.";

async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return (data?.error as string | undefined) ?? fallback;
}

function sortEntries(list: JourneyEntryWithAuthor[]) {
  return [...list].sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime();
    return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/** 주기 기록은 오래된 것부터(page.tsx 와 같은 순서) — lib/cycle.ts 가 그 순서를 가정하지는 않지만 맞춰 둔다. */
function sortCycle(list: CycleEvent[]) {
  return [...list].sort((a, b) => {
    const d = new Date(a.date).getTime() - new Date(b.date).getTime();
    return d !== 0 ? d : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * 아기 페이지 — 준비 → 임신 → 출생을 한 페이지에서.
 *
 * 단계는 저장하지 않고 `stageOf(active)` 로 계산한다. **단계를 바꾸는 일(임신 시작·준비로 돌아가기)은
 * 낙관적으로 하지 않는다** — 체크리스트가 단계마다 따로라, 화면이 먼저 바뀌면 잠깐 엉뚱한 단계의
 * 목록이 보인다. 서버가 바꿨다고 답하면 `router.refresh()` 로 page.tsx 를 다시 읽고,
 * page.tsx 의 `key` 가 바뀌어 이 컴포넌트가 새 단계의 데이터로 다시 붙는다.
 */
export function BabyClient({ initial, members }: { initial: JourneyPageData; members: FamilyMember[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  // 서버에서 새 단계를 받아 오는 중 — 그동안 "임신을 확인했어요" 를 또 누르지 못하게.
  const [refreshing, startRefresh] = useTransition();

  const [active, setActive] = useState<Pregnancy | null>(initial.active);
  const [entries, setEntries] = useState<JourneyEntryWithAuthor[]>(initial.entries);
  const [checklist, setChecklist] = useState<JourneyChecklistItem[]>(initial.checklist);
  const [links, setLinks] = useState<JourneyLink[]>(initial.links);
  const [cycleEvents, setCycleEvents] = useState<CycleEvent[]>(initial.cycleEvents);
  const [showOnHome, setShowOnHome] = useState(initial.showOnHome);
  // 준비 단계로 돌아온 날. 임신을 끝내면 key 가 바뀌어 새 값으로 다시 붙는다 — 상태로 드는 것은
  // "처음부터 다시 시작" 때문이다: 준비 단계에서 지우면 key 가 그대로라 서버가 지운 값이 여기 안 온다.
  const [cycleSince, setCycleSince] = useState<Date | null>(initial.cycleSince);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);
  const [cycleModal, setCycleModal] = useState<CycleKind | null>(null);
  const [filter, setFilter] = useState<EntryFilter>("all");
  // null=닫힘, "new"=새 기록, entry=수정
  const [entryModal, setEntryModal] = useState<"new" | JourneyEntryWithAuthor | null>(null);

  const stage = stageOf(active);
  // 주기 예측은 준비 단계에서만 — 임신 중에 "다음 생리 예정" 을 계산할 이유가 없다.
  // cycleSince 앞의 시작(임신 전 생리)은 기준이 못 된다 — 서버(journeyState)와 같은 계산이다.
  // 임신 시작 창의 "마지막 생리일" 도 이 값(prediction.lastStart)에서 오므로 같이 비워진다.
  const prediction = stage === "prep" ? predictCycle(cycleEvents, undefined, cycleSince) : null;
  // 준비 단계엔 아기 색이 없다 — 새로 만드는 것은 로즈로 시작한다(DESIGN §2).
  const color = active?.color ?? "rose";

  function refresh() {
    startRefresh(() => router.refresh());
  }

  // ── 단계 ──
  async function startPregnancy(payload: PregnancyStartPayload) {
    const res = await fetch("/api/pregnancy", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) {
      alert(`시작하지 못했어요. ${RETRY}`);
      return;
    }
    if (res.status === 409) {
      // 다른 폰에서 먼저 시작했다 — 그 임신으로 화면을 맞춘다.
      alert(await readError(res, "이미 임신 단계예요. 새로고침해 주세요."));
      setStartOpen(false);
      refresh();
      return;
    }
    if (!res.ok) {
      alert(await readError(res, `시작하지 못했어요. ${RETRY}`));
      return;
    }
    setStartOpen(false);
    refresh();
  }

  async function savePregnancy(patch: BabySettingsPatch) {
    if (!active) return;
    const prev = active;
    setActive({
      ...active,
      ...patch,
      dueDate: fromDateInput(patch.dueDate),
      birthDate: patch.birthDate ? fromDateInput(patch.birthDate) : null,
    });
    const res = await fetch(`/api/pregnancy/${active.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res || !res.ok) {
      setActive(prev);
      alert(`설정을 저장하지 못했어요. ${RETRY}`);
      return;
    }
    const updated: Pregnancy = await res.json();
    setActive(updated);
  }

  // 서버가 바꿨다고 답한 뒤에만 닫는다. 실패하면 아무것도 바꾸지 않는다 — 고른 것이 창에 남아 다시 누를 수 있다.
  async function endPregnancy(keep: boolean) {
    if (!active) return;
    const res = await fetch(`/api/pregnancy/${active.id}/end`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ keep }),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(`바꾸지 못했어요. ${RETRY}`);
      return;
    }
    setBackOpen(false);
    refresh();
  }

  async function setHome(v: boolean) {
    setShowOnHome(v);
    const res = await fetch("/api/baby", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ showOnHome: v }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setShowOnHome(!v);
      alert(`홈 표시를 바꾸지 못했어요. ${RETRY}`);
    }
  }

  // 처음부터 다시 시작. 낙관적으로 지우지 않는다 — 한꺼번에 사라지는 양이 커서,
  // 서버가 정말 지웠다고 답한 뒤에만 빈 준비 단계로 돌아간다.
  async function resetAll() {
    // 설정 창 위에 묻는 창이 겹치지 않게 먼저 닫는다.
    setSettingsOpen(false);
    if (
      !(await confirm({
        title: "아기 페이지의 모든 기록을 지울까요?",
        description: "일기·주기 기록·체크리스트·참고 사이트와 올린 사진이 모두 사라지고, 다시 볼 수 없어요.",
        confirmLabel: "모두 지우기",
      }))
    )
      return;
    const res = await fetch("/api/baby", { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      alert(`지우지 못했어요. ${RETRY}`);
      return;
    }
    setActive(null);
    setEntries([]);
    setChecklist([]);
    setLinks([]);
    setCycleEvents([]);
    setCycleSince(null);
    setShowOnHome(false);
    setFilter("all");
    setEntryModal(null);
    // 홈의 아기 카드 같은 서버 화면이 지운 기록을 계속 들고 있지 않게.
    // 임신 단계였다면 key 가 "prep" 으로 바뀌어 빈 준비 단계로 다시 붙는다.
    refresh();
  }

  // ── 주기 기록 ──
  async function addCycleEvent(payload: CycleEventPayload): Promise<boolean> {
    const res = await fetch("/api/cycle-events", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(`기록하지 못했어요. ${RETRY}`);
      return false;
    }
    const saved: CycleEvent = await res.json();
    // 같은 날 같은 기록이면 서버가 있던 행을 돌려준다 — 두 줄로 늘리지 않는다.
    setCycleEvents((list) => (list.some((e) => e.id === saved.id) ? list : sortCycle([...list, saved])));
    return true;
  }

  // 묻지 않는다 — 날짜 하나라 다시 적는 데 3초다(장보기와 같은 규칙, DESIGN §8).
  async function removeCycleEvent(id: string) {
    const removed = cycleEvents.find((e) => e.id === id);
    if (!removed) return;
    setCycleEvents((list) => list.filter((e) => e.id !== id));
    const res = await fetch(`/api/cycle-events/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setCycleEvents((list) => (list.some((e) => e.id === id) ? list : sortCycle([...list, removed])));
      alert(`지우지 못했어요. ${RETRY}`);
    }
  }

  // ── 일기 ──
  async function saveEntry(payload: EntryPayload): Promise<boolean> {
    const editing = entryModal && entryModal !== "new" ? entryModal : null;
    const res = await fetch(editing ? `/api/baby-entries/${editing.id}` : "/api/baby-entries", {
      method: editing ? "PATCH" : "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(res ? await readError(res, "기록을 저장하지 못했어요.") : `기록을 저장하지 못했어요. ${RETRY}`);
      return false;
    }
    const saved: JourneyEntryWithAuthor = await res.json();
    setEntries((list) => sortEntries(editing ? list.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...list]));
    return true;
  }

  async function deleteEntry(entry: JourneyEntryWithAuthor) {
    if (
      !(await confirm({
        title: "이 기록을 지울까요?",
        description: "글과 함께 붙여둔 사진도 사라지고, 다시 볼 수 없어요.",
      }))
    )
      return;
    const prev = entries;
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    setEntryModal(null);
    const res = await fetch(`/api/baby-entries/${entry.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setEntries(prev);
      alert(`기록을 지우지 못했어요. ${RETRY}`);
    }
  }

  // ── 체크리스트 (지금 단계 것 — 서버가 단계를 찍는다) ──
  async function addCheck(text: string) {
    const res = await fetch("/api/baby-checklist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ text }),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(`항목을 넣지 못했어요. ${RETRY}`);
      return;
    }
    const created: JourneyChecklistItem = await res.json();
    setChecklist((list) => [...list, created]);
  }

  async function addDefaultChecks() {
    const res = await fetch("/api/baby-checklist", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ texts: DEFAULT_CHECKLIST }),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(`항목을 넣지 못했어요. ${RETRY}`);
      return;
    }
    const created: JourneyChecklistItem[] = await res.json();
    setChecklist((list) => [...list, ...created]);
  }

  async function toggleCheck(item: JourneyChecklistItem) {
    const next = !item.done;
    setChecklist((list) => list.map((c) => (c.id === item.id ? { ...c, done: next } : c)));
    const res = await fetch(`/api/baby-checklist/${item.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ done: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setChecklist((list) => list.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)));
      alert(`표시를 바꾸지 못했어요. ${RETRY}`);
    }
  }

  async function removeCheck(id: string) {
    const prev = checklist;
    setChecklist((list) => list.filter((c) => c.id !== id));
    const res = await fetch(`/api/baby-checklist/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setChecklist(prev);
      alert(`지우지 못했어요. ${RETRY}`);
    }
  }

  // ── 참고 사이트 ──
  async function addLink(url: string, title: string) {
    const res = await fetch("/api/baby-links", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ url, title }),
    }).catch(() => null);
    if (!res || !res.ok) {
      alert(res ? await readError(res, "사이트를 저장하지 못했어요.") : `사이트를 저장하지 못했어요. ${RETRY}`);
      return;
    }
    const created: JourneyLink = await res.json();
    setLinks((list) => [...list, created]);
  }

  async function editLinkTitle(id: string, title: string) {
    const prev = links;
    setLinks((list) => list.map((l) => (l.id === id ? { ...l, title } : l)));
    const res = await fetch(`/api/baby-links/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setLinks(prev);
      alert(`설명을 저장하지 못했어요. ${RETRY}`);
    }
  }

  async function removeLink(id: string) {
    const prev = links;
    setLinks((list) => list.filter((l) => l.id !== id));
    const res = await fetch(`/api/baby-links/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setLinks(prev);
      alert(`지우지 못했어요. ${RETRY}`);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* 제목줄이 없다 — 히어로가 이 화면의 h1 을 가진다(준비: "아기 준비", 임신: 태명). 기록을 더하는
          버튼은 더해지는 목록(일기·주기) 옆에 있다. 같은 말을 위아래로 두 번 하지 않는다. */}
      {stage === "prep" || !active ? (
        <PrepHero
          prediction={prediction}
          entries={entries}
          starting={refreshing}
          onOpenSettings={() => setSettingsOpen(true)}
          onRecordStart={() => setCycleModal("periodStart")}
          onStartPregnancy={() => setStartOpen(true)}
        />
      ) : (
        <BabyHero pregnancy={active} entries={entries} onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {/* 폰에서는 **일기가 먼저**다(준비 단계의 주기 카드만 그 앞). 전에는 접힌 카드 두 장(준비
          체크리스트·참고 사이트)이 히어로 바로 밑에 붙어, 한 줄씩 보여 주려고 160px 을 쓰고 정작
          읽으러 온 일기를 아래로 밀어냈다. 데스크톱은 옆에 나란히 서므로 지금대로가 맞다. */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 사이드. **폰에서는 껍데기 두 겹이 `contents` 로 사라져** 안의 묶음이 바깥 격자의 칸이 된다 —
            그래야 준비 단계의 주기 카드만 order 로 일기 **앞**에 세울 수 있다(준비 때 가장 자주 하는 일이
            "생리 시작 적기" 인데, 사이드 통째로 일기 뒤에 두면 일기를 다 지나야 닿았다).
            데스크톱은 전과 같다: 사이드가 한 덩어리로 오른쪽 칸에 붙어(sticky) 주기 카드가 맨 위. */}
        <div className="contents lg:order-2 lg:block lg:min-w-0">
          <div className="contents lg:sticky lg:top-6 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            {/* 준비 단계: 펼친 주기 카드. 폰은 히어로 바로 밑(일기 앞), 데스크톱은 사이드 맨 위.
                `lg:order-none` 이 꼭 있어야 한다 — 데스크톱에서는 아래 묶음이 `contents` 라 그 order-3 이
                사라지고 카드들이 order 0 이 되는데, 이 칸만 1 이면 기둥의 **맨 아래**로 내려간다. */}
            {stage === "prep" && (
              <div className="order-1 min-w-0 lg:order-none">
                <CycleCard
                  events={cycleEvents}
                  prediction={prediction}
                  color={color}
                  onAdd={setCycleModal}
                  onRemove={removeCycleEvent}
                />
              </div>
            )}
            {/* 나머지 사이드는 폰에서 일기 **뒤**. 데스크톱에서는 이 묶음도 `contents` 라 카드들이
                sticky 기둥의 칸으로 그대로 이어진다(간격 gap-6 도 기둥의 것). */}
            <div className="order-3 flex min-w-0 flex-col gap-6 lg:contents">
              <BabyChecklist
                // 단계마다 따로인 목록이라 이름도 따로 — 준비 때 적은 것과 아기를 맞을 준비는 다른 일이다.
                title={stage === "prep" ? "준비 체크리스트" : "아기 맞이 체크리스트"}
                items={checklist}
                color={color}
                onAdd={addCheck}
                // 준비 단계엔 기본 항목이 없다 — 무엇을 넣어도 의료 조언이 된다.
                onAddDefaults={stage === "prep" ? undefined : addDefaultChecks}
                onToggle={toggleCheck}
                onRemove={removeCheck}
              />
              <BabyLinks items={links} color={color} onAdd={addLink} onEditTitle={editLinkTitle} onRemove={removeLink} />
              {/* 임신·출생 단계: 준비 때 기록은 접힌 한 줄로만(읽기·지우기). */}
              {stage !== "prep" && cycleEvents.length > 0 && (
                <CycleCard
                  collapsed
                  events={cycleEvents}
                  prediction={null}
                  color={color}
                  onAdd={setCycleModal}
                  onRemove={removeCycleEvent}
                />
              )}
            </div>
          </div>
        </div>
        <div className="order-2 min-w-0 lg:order-1 lg:col-span-2">
          <EntryTimeline
            entries={entries}
            filter={filter}
            onFilterChange={setFilter}
            active={active}
            onEdit={(e) => setEntryModal(e)}
            onDelete={deleteEntry}
            onCreate={() => setEntryModal("new")}
          />
        </div>
      </div>

      {settingsOpen &&
        (stage === "prep" || !active ? (
          <JourneySettingsModal
            showOnHome={showOnHome}
            onClose={() => setSettingsOpen(false)}
            onToggleHome={setHome}
            onReset={resetAll}
          />
        ) : (
          <BabySettingsModal
            pregnancy={active}
            showOnHome={showOnHome}
            onClose={() => setSettingsOpen(false)}
            onSave={savePregnancy}
            onToggleHome={setHome}
            // 설정 창 위에 묻는 창이 겹치지 않게 먼저 닫는다 — 겹치면 "준비 단계로" 단추가 둘이 된다.
            onBackToPrep={() => {
              setSettingsOpen(false);
              setBackOpen(true);
            }}
            onReset={resetAll}
          />
        ))}
      {backOpen && active && <BackToPrepModal onClose={() => setBackOpen(false)} onConfirm={endPregnancy} />}
      {startOpen && (
        <PregnancyStartModal
          lastPeriodStart={prediction?.lastStart ?? null}
          onClose={() => setStartOpen(false)}
          onStart={startPregnancy}
        />
      )}
      {cycleModal && (
        <CycleEventModal kind={cycleModal} onClose={() => setCycleModal(null)} onSave={addCycleEvent} />
      )}
      {dialog}
      {entryModal && (
        <EntryModal
          members={members}
          initial={entryModal === "new" ? null : entryModal}
          onClose={() => setEntryModal(null)}
          onSave={saveEntry}
          onDelete={entryModal === "new" ? undefined : () => deleteEntry(entryModal)}
        />
      )}
    </div>
  );
}
