// 서버 컴포넌트 → 클라이언트로 전달되는 데이터 타입.
// Next.js RSC 는 Date 를 직렬화해 보존하므로 클라이언트에서도 Date 로 받습니다.
import type {
  FamilyMember,
  Album,
  Photo,
  Plan,
  PlanItem,
  CalendarEvent,
  Todo,
  Anniversary,
  BoardPost,
  ShoppingItem,
} from "@prisma/client";

export type {
  FamilyMember,
  Album,
  Photo,
  Plan,
  PlanItem,
  CalendarEvent,
  Todo,
  Anniversary,
  BoardPost,
  ShoppingItem,
};

export type AlbumWithCount = Album & { _count: { photos: number } };
export type AlbumWithPhotos = Album & { photos: Photo[] };
export type PlanWithItems = Plan & { items: PlanItem[] };
export type PlanWithCount = Plan & { _count: { items: number } };
export type TodoWithMember = Todo & { member: FamilyMember | null };
export type AnniversaryWithMember = Anniversary & { member: FamilyMember | null };
export type BoardPostWithAuthor = BoardPost & { author: FamilyMember | null };
export type ShoppingItemWithMember = ShoppingItem & { addedBy: FamilyMember | null };
