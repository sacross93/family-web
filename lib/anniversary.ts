import type { SessionUser } from "@/lib/session";

/**
 * 이 기념일을 고치거나 지울 수 있나 — **만든 사람이나 관리자.** 화면(버튼을 보일지)과
 * 라우트(PATCH·DELETE 를 받을지)가 이 한 곳을 같이 쓴다. 둘이 따로 판단하면 버튼은 떠 있는데
 * 누르면 403 이 나는 날이 온다.
 *
 * `ownerUserId` 는 `AnniversaryOwner.userId`. 줄이 없는 기념일(이 표가 생기기 전 것·시드)은
 * 만든 사람을 모르니 관리자만 고친다.
 */
export function canEditAnniversary(
  user: SessionUser | null,
  ownerUserId: string | null | undefined
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return !!ownerUserId && ownerUserId === user.uid;
}

/** 화면이 그대로 그릴 수 있게: owner 줄은 떼고(누가 만들었는지 uid 를 내보내지 않는다) canEdit 만 붙인다. */
export function withCanEdit<T extends { owner?: { userId: string } | null }>(
  row: T,
  user: SessionUser | null
): Omit<T, "owner"> & { canEdit: boolean } {
  const { owner, ...rest } = row;
  return { ...rest, canEdit: canEditAnniversary(user, owner?.userId) };
}
