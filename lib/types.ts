// 서버 컴포넌트 → 클라이언트로 전달되는 데이터 타입.
// Next.js RSC 는 Date 를 직렬화해 보존하므로 클라이언트에서도 Date 로 받습니다.
import type {
  FamilyMember,
  Album,
  Photo,
  Plan,
  PlanItem,
  PlanChecklistItem,
  CalendarEvent,
  Todo,
  Anniversary,
  BoardPost,
  ShoppingItem,
  Pregnancy,
  JourneyEntry,
  JourneyChecklistItem,
  JourneyLink,
  CycleEvent,
} from "@prisma/client";

export type {
  FamilyMember,
  Album,
  Photo,
  Plan,
  PlanItem,
  PlanChecklistItem,
  CalendarEvent,
  Todo,
  Anniversary,
  BoardPost,
  ShoppingItem,
  Pregnancy,
  JourneyEntry,
  JourneyChecklistItem,
  JourneyLink,
  CycleEvent,
};

export type AlbumWithCount = Album & { _count: { photos: number } };
export type AlbumWithPhotos = Album & { photos: Photo[] };
export type PlanWithItems = Plan & { items: PlanItem[] };
export type PlanDetail = Plan & {
  items: PlanItem[];
  checklist: PlanChecklistItem[];
};
export type PlanWithCount = Plan & { _count: { items: number } };
export type TodoWithMember = Todo & { member: FamilyMember | null };
export type AnniversaryWithMember = Anniversary & { member: FamilyMember | null };
export type BoardPostWithAuthor = BoardPost & { author: FamilyMember | null };
export type ShoppingItemWithMember = ShoppingItem & { addedBy: FamilyMember | null };

export type JourneyEntryWithAuthor = JourneyEntry & { author: FamilyMember | null };

/** 아기 페이지가 서버에서 받는 것. 체크리스트는 지금 단계 것만(준비 = pregnancyId null). */
export interface JourneyPageData {
  showOnHome: boolean;
  active: Pregnancy | null;
  entries: JourneyEntryWithAuthor[];
  checklist: JourneyChecklistItem[];
  links: JourneyLink[];
  cycleEvents: CycleEvent[];
  /** 끝난 임신의 추정 시작(`JourneySettings.cycleSince`, 예정일 − 266일). 주기 예측이 그 앞의 시작을 기준으로 삼지 않게 */
  cycleSince: Date | null;
}
