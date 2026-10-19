"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, CollapsibleCard } from "@/components/ui";
// 모양·계산은 prisma 없는 blob-budget.ts 에서 — blob-usage.ts 는 서버 전용이다.
import type { StorageStatus } from "@/lib/blob-budget";
import { kDateShortYear, kTime } from "@/lib/date";
import { cn } from "@/lib/utils";

/** 바이트 → MB(십진, 한도를 십진 1GB 로 잡았으니 같은 잣대로). 0.1MB 단위. */
function mb(bytes: number): string {
  const v = bytes / 1_000_000;
  return v >= 100 ? Math.round(v).toLocaleString("ko-KR") : v.toFixed(1);
}

/**
 * 관리자 화면 「사진 저장 공간」 — Vercel Blob(무료) 저장소가 얼마나 찼는지.
 *
 * 무료(Hobby) 한도를 넘으면 저장소가 **통째로 한 달쯤 멈추고 이미 올린 사진까지 안 보인다.** 그래서 90% 에서
 * 사이트가 올리기를 먼저 멈춘다(`lib/upload-guard.ts`). 이 카드는 그 숫자를 보여 주고 다시 재게 한다.
 * 숫자는 서버가 기억한 값이다(6시간마다 다시 잰다 — 재기도 Blob 요청 한도를 쓴다).
 */
export function StorageCard({ initial }: { initial: StorageStatus | null }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/storage", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.bytes === "number") setStatus(data as StorageStatus);
      else setError(data?.error ?? "저장 공간을 재지 못했어요.");
    } catch {
      setError("인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 접혀 있을 때 오른쪽 한 줄 — 폰에서 제목이 두 줄로 접히지 않게 짧게.
  const pct = status ? Math.min(100, Math.round((status.bytes / status.limit) * 100)) : 0;
  const summary = !status
    ? undefined
    : status.state === "blocked"
      ? `${pct}% · 올리기 멈춤`
      : status.state === "warn"
        ? `${pct}% · 거의 참`
        : `${mb(status.bytes)} / ${mb(status.limit)}MB`;

  return (
    <CollapsibleCard
      emoji="🗄️"
      emojiClassName="bg-butter-soft"
      title="사진 저장 공간"
      summary={summary}
      // 막혔으면 펼쳐 둔다 — 관리자가 화면을 열자마자 알아야 할 일이다.
      defaultOpen={status?.state === "blocked"}
      className="gap-4"
    >
      {status ? <Meter status={status} /> : (
        <p className="text-sm text-ink-soft">아직 확인할 수 없어요. 잠시 뒤 [다시 재기]를 눌러 보세요.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" size="sm" onClick={recount} disabled={busy}>
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /> {busy ? "재는 중…" : "다시 재기"}
        </Button>
        {status && (
          <span className="text-xs text-ink-faint">
            <span className="font-num">
              {kDateShortYear(status.measuredAt)} {kTime(status.measuredAt)}
            </span>{" "}
            에 잼 · 6시간마다 다시 재요
          </span>
        )}
      </div>
      {error && <p className="text-sm text-danger-ink">{error}</p>}
    </CollapsibleCard>
  );
}

function Meter({ status }: { status: StorageStatus }) {
  const pct = Math.min(100, Math.round((status.bytes / status.limit) * 100));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink">
          <span className="font-num text-lg font-bold">{mb(status.bytes)}MB</span>
          <span className="text-ink-soft">
            {" "}
            / <span className="font-num">{mb(status.limit)}MB</span> 사용
          </span>
        </p>
        <p className="text-xs text-ink-faint">
          사진 <span className="font-num">{status.count.toLocaleString("ko-KR")}</span>장
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="사진 저장 공간"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            status.state === "blocked" ? "bg-danger" : status.state === "warn" ? "bg-butter" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {status.state === "ok" && (
        <p className="text-xs text-ink-faint">
          <span className="font-num">{mb(status.blockAt)}MB</span>(90%)가 되면 사진 올리기를 먼저 멈춰요 —
          무료 저장소는 한도를 넘으면 통째로 멈추거든요.
        </p>
      )}
      {status.state === "warn" && (
        <p className="rounded-md bg-butter-soft px-3.5 py-3 text-sm text-butter-ink">
          저장 공간이 <span className="font-num">{pct}%</span> 찼어요. 무료 저장소는 한도를 넘으면 한 달쯤 통째로 멈추고
          이미 올린 사진도 안 보여요. 안 쓰는 사진을 지우거나 Vercel 요금제를 올려 주세요.{" "}
          <span className="font-num">{mb(status.blockAt)}MB</span>(90%)에서 사이트가 올리기를 멈춰요.
        </p>
      )}
      {status.state === "blocked" && (
        <p className="rounded-md bg-danger-soft px-3.5 py-3 text-sm text-danger-ink">
          사진 올리기를 멈췄어요(<span className="font-num">{pct}%</span>). 이대로 더 올리면 저장소가 통째로 멈춰 이미
          올린 사진까지 안 보여요. 안 쓰는 사진을 지우거나 Vercel 요금제를 올린 뒤 [다시 재기]를 눌러 주세요.
        </p>
      )}
    </div>
  );
}
