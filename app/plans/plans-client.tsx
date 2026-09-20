"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, CalendarRange, MapPin, ListChecks } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  EmptyState,
  Tag,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  ColorPicker,
  useToast,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { kDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PlanWithCount } from "@/lib/types";

const PLAN_TYPES = ["여행", "주말", "이벤트", "기타"] as const;
const EMOJI_SUGGESTIONS = ["🗺️", "🌴", "🏖️", "⛰️", "🏕️", "🎡", "🎢", "🎂", "🎉", "🍜", "🚗", "🏠"];

/** 기간 표시: "7월 21일 (화) ~ 7월 23일 (목)" */
function periodLabel(plan: PlanWithCount): string | null {
  if (plan.startDate && plan.endDate) {
    return `${kDateShort(plan.startDate)} ~ ${kDateShort(plan.endDate)}`;
  }
  if (plan.startDate) return `${kDateShort(plan.startDate)}부터`;
  if (plan.endDate) return `${kDateShort(plan.endDate)}까지`;
  return null;
}

export function PlansClient({ initialPlans }: { initialPlans: PlanWithCount[] }) {
  const { say } = useToast();
  const [plans, setPlans] = useState(initialPlans);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("여행");
  const [emoji, setEmoji] = useState("🗺️");
  const [color, setColor] = useState<PaletteKey>("sky");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function resetForm() {
    setTitle("");
    setType("여행");
    setEmoji("🗺️");
    setColor("sky");
    setDescription("");
    setLocation("");
    setStartDate("");
    setEndDate("");
  }

  async function createPlan() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          emoji,
          color,
          description,
          location,
          startDate: startDate || null,
          endDate: endDate || null,
        }),
      });
      if (res.ok) {
        const created: PlanWithCount = await res.json();
        setPlans((prev) => [created, ...prev]);
        resetForm();
        setOpen(false);
      }
    } catch {
      // 네트워크가 끊기면 fetch 는 거부된다 — catch 가 없으면 조용히 사라진다.
      say("계획을 못 만들었어요. 연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        emoji="🗺️"
        title="계획"
        description="여행도 주말도, 날짜별로 함께 그려봐요"
        summary={plans.length > 0 ? `계획 ${plans.length}개` : undefined}
      >
        {/* 목록이 비면 아래 빈 화면의 초대가 같은 일을 한다 — 같은 버튼을 한 화면에
            두 번 두지 않는다(DESIGN.md §1 "화면당 강조는 하나만"). */}
        {plans.length > 0 && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> 새 계획
          </Button>
        )}
      </PageHeader>

      {plans.length === 0 ? (
        <EmptyState
          emoji="🧭"
          title="아직 계획이 없어요"
          description="첫 여행이나 주말 나들이를 계획해 볼까요?"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> 새 계획 만들기
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const pal = palette(plan.color);
            const period = periodLabel(plan);
            return (
              <Link
                key={plan.id}
                href={`/plans/${plan.id}`}
                className="block h-full"
              >
                <Card
                  interactive
                  flush
                  className="flex h-full flex-col overflow-hidden"
                >
                  <div
                    className={cn(
                      "flex items-start justify-between gap-2 bg-gradient-to-br p-5",
                      pal.gradient
                    )}
                  >
                    <span className="text-4xl leading-none">{plan.emoji}</span>
                    <Tag color={plan.color}>{plan.type}</Tag>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-5 pt-4">
                    <h3 className="font-display text-lg font-bold leading-snug text-ink">
                      {plan.title}
                    </h3>
                    {period && (
                      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                        <CalendarRange className="h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="truncate">{period}</span>
                      </p>
                    )}
                    {plan.location && (
                      <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                        <MapPin className="h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="truncate">{plan.location}</span>
                      </p>
                    )}
                    <p className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-ink-faint">
                      <ListChecks className="h-3.5 w-3.5 shrink-0" />
                      {/* 한 덩어리로 감싼다 — flex 안에서는 "일정", 숫자, "개" 가 각각
                          flex 항목이 되어 `gap` 이 그 사이에 들어간다("일정 5 개"). */}
                      <span>일정 {plan._count.items}개</span>
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="새 계획"
        emoji="🗺️"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={createPlan} disabled={!title.trim() || busy}>
              만들기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="제목">
            <Input
              placeholder="예: 여름 제주도 여행"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlan()}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="종류">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {PLAN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="이모지">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="text-center text-lg"
              />
            </Field>
          </div>

          <div className="-mt-1 flex flex-wrap gap-1.5">
            {EMOJI_SUGGESTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`이모지 ${e}`}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md text-lg transition hover:bg-sunken",
                  emoji === e && "bg-sunken ring-2 ring-primary"
                )}
              >
                {e}
              </button>
            ))}
          </div>

          <Field label="색">
            <ColorPicker value={color} onChange={setColor} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 날짜">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="종료 날짜">
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="장소" hint="선택 사항이에요.">
            <Input
              placeholder="예: 제주도"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>

          <Field label="설명" hint="선택 사항이에요.">
            <Textarea
              placeholder="어떤 계획인지 간단히 적어봐요."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
