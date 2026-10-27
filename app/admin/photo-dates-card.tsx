"use client";

import { useState } from "react";
import { CalendarSearch } from "lucide-react";
import { Button, CollapsibleCard } from "@/components/ui";

interface Sum {
  found: number;
  none: number;
  failed: number;
}

/** `/api/photos/taken-at` 의 대답 한 번. `next` 가 null 이면 끝. */
interface Batch extends Sum {
  checked: number;
  next: string | null;
  remaining: number;
}

/**
 * 관리자 화면 「사진 찍은 날짜」 — 이미 올린 사진의 찍은 날을 사진 속 촬영 정보(EXIF)에서 채운다.
 *
 * 새로 올리는 사진은 올릴 때 저절로 채워진다(`lib/photo-date-client.ts`). 이 카드는 그 전에 올린 사진들 몫이다.
 * 홈의 「N년 전 오늘」이 이 날짜로 사진을 찾는다.
 *
 * **누를 때만** 돈다 — 화면을 여는 것으로는 아무것도 안 쓴다(`ui:audit` 의 "로그인 말고 쓰기 0").
 * 서버가 몇 장씩 읽고(`/api/photos/taken-at`) 화면이 끝날 때까지 다시 부른다.
 */
export function PhotoDatesCard({ initialPending }: { initialPending: number | null }) {
  const [pending, setPending] = useState(initialPending);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Sum | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fill() {
    if (progress) return;
    setError(null);
    setResult(null);
    const sum: Sum = { found: 0, none: 0, failed: 0 };
    let after: string | null = null;
    let done = 0;
    setProgress({ done: 0, total: pending ?? 0 });
    try {
      for (;;) {
        const res: Response = await fetch("/api/photos/taken-at", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ after }),
        });
        const data = (await res.json().catch(() => null)) as (Batch & { error?: string }) | null;
        if (!res.ok || !data || typeof data.checked !== "number") {
          setError(data?.error ?? "날짜를 다 못 채웠어요. 잠시 후 다시 눌러 주세요 — 채운 것은 그대로 남아요.");
          break;
        }
        done += data.checked;
        sum.found += data.found;
        sum.none += data.none;
        sum.failed += data.failed;
        setProgress({ done, total: done + data.remaining });
        if (!data.next) break;
        after = data.next;
      }
    } catch {
      setError("인터넷 연결을 확인해 주세요. 채운 것은 그대로 남아요.");
    } finally {
      setResult(sum);
      // 날짜를 못 찾은 사진은 여전히 비어 있다 — 채운 만큼만 줄인다.
      setPending((p) => (p === null ? p : Math.max(0, p - sum.found)));
      setProgress(null);
    }
  }

  const summary = pending === null ? undefined : pending === 0 ? "다 채웠어요" : `${pending}장 비어 있음`;

  return (
    <CollapsibleCard emoji="🕰️" emojiClassName="bg-lavender-soft" title="사진 찍은 날짜" summary={summary} className="gap-4">
      <p className="text-sm text-ink-soft">
        사진 속 촬영 정보에서 찍은 날짜를 읽어 채워요. 홈의 「N년 전 오늘」이 이 날짜로 사진을 찾아요.
        새로 올리는 사진은 올릴 때 저절로 채워져요.
      </p>

      {pending === null ? (
        <p className="text-sm text-ink-soft">지금은 몇 장이 비어 있는지 확인할 수 없어요.</p>
      ) : (
        <p className="text-sm text-ink">
          찍은 날짜가 비어 있는 사진 <span className="font-num font-bold">{pending.toLocaleString("ko-KR")}</span>장
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" size="sm" onClick={fill} disabled={!!progress || pending === 0}>
          <CalendarSearch className="h-4 w-4" />
          {progress ? (
            <>
              읽는 중…{" "}
              <span className="font-num">
                {progress.done} / {progress.total}
              </span>
            </>
          ) : (
            "찍은 날짜 채우기"
          )}
        </Button>
      </div>

      {result && (
        <p className="text-sm text-ink-soft" role="status">
          <span className="font-num font-semibold text-ink">{result.found}</span>장에 찍은 날짜를 넣었어요.
          {result.none > 0 && (
            <>
              {" "}
              <span className="font-num">{result.none}</span>장은 사진에 날짜 정보가 없어요(메신저로 받은 사진 등).
            </>
          )}
          {result.failed > 0 && (
            <>
              {" "}
              <span className="font-num">{result.failed}</span>장은 파일을 못 읽었어요. 잠시 후 다시 눌러 보세요.
            </>
          )}
        </p>
      )}
      {error && <p className="text-sm text-danger-ink">{error}</p>}
    </CollapsibleCard>
  );
}
