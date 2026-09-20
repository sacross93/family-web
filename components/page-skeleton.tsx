/**
 * 페이지가 오는 동안 보여 주는 뼈대.
 *
 * 이게 없으면 느린 연결에서 **탭을 눌러도 1초 넘게 아무 일도 안 일어난다** —
 * 주소도 안 바뀌고 탭도 안 켜지고 옛 화면이 그대로 있어서, 안 눌렸나 싶어 또 누른다.
 * 경로마다 `loading.tsx` 를 두면 Next 가 곧바로 이 뼈대를 그리고 주소도 바로 바뀐다
 * (node_modules/next/dist/docs/.../use-link-status.md 가 권하는 방식).
 *
 * 빙글빙글 도는 표시 대신 **올 내용의 모양**을 흐리게 둔다 — 화면이 덜컥이지 않는다.
 */
export function PageSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      {/* 제목 자리 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-sunken" />
        <div className="flex flex-col gap-2">
          <div className="h-5 w-32 rounded-full bg-sunken" />
          <div className="h-3 w-44 rounded-full bg-sunken/70" />
        </div>
      </div>
      {/* 카드 자리 */}
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-line bg-surface p-5">
            <div className="mb-3 h-4 w-28 rounded-full bg-sunken" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-full rounded-full bg-sunken/70" />
              <div className="h-3 w-4/5 rounded-full bg-sunken/70" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
