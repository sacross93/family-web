"use client";

import { Modal, Button, Checkbox } from "@/components/ui";

/**
 * 준비 단계의 ⚙ — 페이지 설정. 고칠 이름·날짜가 없으니 저장 단추도 없다:
 * 홈 표시는 누르는 즉시 저장되고, 지우기는 부모가 한 번 더 묻는다.
 */
export function JourneySettingsModal({
  showOnHome,
  onClose,
  onToggleHome,
  onReset,
}: {
  showOnHome: boolean;
  onClose: () => void;
  onToggleHome: (v: boolean) => void;
  /** 처음부터 다시 시작(모두 지우기). 묻고 지우는 일은 부모가 한다. */
  onReset: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="아기 페이지 설정"
      emoji="🌱"
      footer={
        <Button variant="soft" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-md bg-sunken px-4 py-3">
          <Checkbox checked={showOnHome} onChange={onToggleHome} color="rose" label="홈에 보여주기" />
          <span className="flex flex-col">
            <span className="text-[0.9375rem] font-semibold text-ink">홈에 보여주기</span>
            <span className="text-xs text-ink-soft">홈 화면에 다음 예정일과 최근 기록 카드를 띄워요.</span>
          </span>
        </label>
        <ResetSection onReset={onReset} />
      </div>
    </Modal>
  );
}

/** "처음부터 다시 시작" 구역 — 준비 단계 설정과 임신 설정이 같이 쓴다. */
export function ResetSection({ onReset }: { onReset: () => void }) {
  return (
    // 아래 단추줄이 아니라 본문 맨 끝에 둔다 — 취소·저장 옆에 세 번째 단추를 세우면
    // 폰 폭에서 넘치고, 저장 바로 옆이라 잘못 누르기도 쉽다. 줄을 그어 따로 떼어 둔다.
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
      <span className="text-[0.9375rem] font-semibold text-ink">처음부터 다시 시작</span>
      <span className="text-xs text-ink-soft">일기·주기 기록·체크리스트·참고 사이트와 올린 사진을 모두 지워요.</span>
      <Button variant="danger" size="sm" onClick={onReset} className="mt-1 self-start">
        모두 지우기
      </Button>
    </div>
  );
}
