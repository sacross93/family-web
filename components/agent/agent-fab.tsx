"use client";

import { AgentSheet } from "./agent-sheet";

/**
 * 포동이 대화 시트를 셸에 붙여 두는 자리.
 *
 * 전에는 우하단에 떠 있는 버튼 + 시트였는데, 버튼은 하단 탭바 안으로 옮겼다
 * (`components/bottom-tabs.tsx`). 화면 한가운데에 떠 있는 버튼은 그 밑에 깔린
 * 콘텐츠를 **누를 수 없게** 만든다 — 아기 기록의 `…` 가 정확히 그 밑이라
 * 일기를 고치려고 누르면 이 채팅이 열렸다.
 *
 * 여는 상태는 `AppShell` 이 쥔다(탭바와 시트가 형제라 공통 부모만 이을 수 있다).
 * 여기는 조건 없이 렌더한다 — `{open && <AgentSheet/>}` 로 감싸면 닫을 때마다
 * 대화 훅이 사라져 하던 이야기가 날아간다. 시트는 스스로 !open 이면 null 을 돌려준다.
 */
export function AgentFab({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <AgentSheet open={open} onClose={onClose} />;
}
