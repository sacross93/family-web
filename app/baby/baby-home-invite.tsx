"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, useToast } from "@/components/ui";

/**
 * 홈에 "아기 소식을 여기서도 볼까요?" 한 줄.
 *
 * `Baby.showOnHome` 의 기본값은 `false` 다. 그래서 가족이 태명·예정일을 다 넣어 두고도
 * **홈에서는 아기가 아예 안 보인다** — 끄기로 정한 게 아니라, 그런 스위치가 있는 줄
 * 몰랐을 뿐이다(설정 모달 안에 있다). 이 사이트에서 지금 가장 중요한 숫자가
 * 아무도 본 적 없는 기본값 때문에 숨어 있었다.
 *
 * 값을 대신 바꾸지는 않는다. **한 번 눌러 켤 수 있게** 두고, 켜고 나면 이 줄은 사라진다.
 * 다시 끄고 싶으면 아기 페이지의 설정(⚙)에서 끄면 된다.
 */
export function BabyHomeInvite({
  id,
  emoji,
  nickname,
  summary,
}: {
  id: string;
  emoji: string;
  nickname: string;
  /** 지금 상태 한 줄 — "8주 1일" 또는 "태어난 지 12일" */
  summary: string;
}) {
  const router = useRouter();
  const { say } = useToast();
  const [busy, setBusy] = useState(false);

  async function showOnHome() {
    setBusy(true);
    const res = await fetch("/api/baby", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, showOnHome: true }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setBusy(false);
      say("지금은 안 되네요. 잠시 후 다시 해 주세요.", "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong px-4 py-3">
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink-soft">
        <Link href="/baby" className="font-semibold text-ink hover:underline">
          {nickname}
        </Link>{" "}
        <span className="font-num">{summary}</span>
      </p>
      <Button size="sm" variant="soft" onClick={showOnHome} disabled={busy}>
        홈에서도 보기
      </Button>
    </div>
  );
}
