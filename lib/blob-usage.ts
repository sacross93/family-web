// 사진 저장 공간 — 재고(Blob `list()` 또는 public/uploads), 기억하고(BlobUsage 표), 더한다. 서버 전용.
// 계산(문턱·남은 양·크기 읽기)은 `lib/blob-budget.ts`.
//
// ⚠️ **`list()` 를 요청마다 부르지 말 것.** Hobby 의 고급 요청은 월 2천 건이고 list 도 거기 든다 —
// 넘으면 저장소가 통째로 멈춘다. 그래서 6시간에 한 번(또는 관리자의 [다시 재기], 1분에 한 번까지)만 잰다.
// 한 번 재는 데 드는 요청 = ceil(파일 수 / 1000) — 1GB 안의 폰 사진이면 1건이다.

import path from "path";
import { readdir, stat } from "fs/promises";
import { prisma } from "@/lib/prisma";
import {
  blockAt,
  FORCE_RECOUNT_MIN_MS,
  RECOUNT_AFTER_MS,
  resolveLimit,
  toStatus,
  type StorageStatus,
} from "@/lib/blob-budget";

const ID = "main";

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** 지금 한도. `BLOB_LIMIT_BYTES` 로 줄일 수 있다(시험용 — 서버 환경변수만). */
export function currentLimit(): number {
  return resolveLimit(process.env.BLOB_LIMIT_BYTES);
}

export type Usage = { bytes: number; count: number; measuredAt: Date };

/** 저장소를 처음부터 끝까지 센다. 운영 = Blob `list()`(1000개씩), 로컬 = public/uploads. */
export async function measureUsage(): Promise<{ bytes: number; count: number }> {
  if (blobConfigured()) {
    const { list } = await import("@vercel/blob");
    let bytes = 0;
    let count = 0;
    let cursor: string | undefined;
    do {
      const page = await list({ limit: 1000, cursor });
      for (const b of page.blobs) {
        bytes += b.size;
        count += 1;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return { bytes, count };
  }
  const dir = path.join(process.cwd(), "public", "uploads");
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => !n.startsWith("."));
  } catch {
    return { bytes: 0, count: 0 }; // 폴더가 없으면 아무것도 안 올린 것이다
  }
  let bytes = 0;
  let count = 0;
  for (const n of names) {
    try {
      const s = await stat(path.join(dir, n));
      if (s.isFile()) {
        bytes += s.size;
        count += 1;
      }
    } catch {
      // 그 사이 지워졌다
    }
  }
  return { bytes, count };
}

async function readRow(): Promise<Usage | null> {
  const row = await prisma.blobUsage.findUnique({ where: { id: ID } });
  return row ? { bytes: Number(row.bytes), count: row.count, measuredAt: row.measuredAt } : null;
}

async function recount(): Promise<Usage> {
  const { bytes, count } = await measureUsage();
  const measuredAt = new Date();
  await prisma.blobUsage.upsert({
    where: { id: ID },
    create: { id: ID, bytes: BigInt(bytes), count, measuredAt },
    update: { bytes: BigInt(bytes), count, measuredAt },
  });
  return { bytes, count, measuredAt };
}

/**
 * 지금 사용량. 기억한 값이 6시간보다 오래됐거나 없으면 다시 잰다. `force` 는 관리자의 [다시 재기] —
 * 그래도 1분 안에 잰 값이 있으면 그걸 쓴다(연달아 눌러 고급 요청을 태우지 않게).
 * 못 재면 던진다 — 부르는 쪽이 정한다.
 */
export async function getUsage({ force = false }: { force?: boolean } = {}): Promise<Usage> {
  const row = await readRow();
  const age = row ? Date.now() - row.measuredAt.getTime() : Infinity;
  if (row && age < (force ? FORCE_RECOUNT_MIN_MS : RECOUNT_AFTER_MS)) return row;
  try {
    return await recount();
  } catch (e) {
    if (row) return row; // 재기가 실패하면 지난 값으로 — 없는 것보다 낫다
    throw e;
  }
}

/**
 * 올리기를 허락하면서 그만큼을 **미리 더한다**(예약). 더한 뒤에도 막는 선 안일 때만 더하고 true —
 * 조건과 더하기가 한 문장(UPDATE … WHERE)이라, 두 사람이 동시에 올려도 둘 다 선을 넘겨 통과하지 못한다.
 * 크기를 모르면(0) 더하지 않고 "이미 막혔나" 만 본다. 지운 것은 빼지 않는다 — 다음 재기가 바로잡는다.
 */
export async function reserveUsage(bytes: number, files: number, limit: number): Promise<boolean> {
  const n = Math.max(0, Math.floor(bytes));
  const { count } = await prisma.blobUsage.updateMany({
    where: { id: ID, bytes: { lte: BigInt(Math.max(0, blockAt(limit) - n)) } },
    data: { bytes: { increment: BigInt(n) }, count: { increment: files } },
  });
  return count === 1;
}

/** 관리자 카드용. 못 읽으면 null(표가 아직 없는 배포 등) — 카드는 "확인할 수 없어요" 로 그린다. */
export async function storageStatus(opts: { force?: boolean } = {}): Promise<StorageStatus | null> {
  try {
    const u = await getUsage(opts);
    return toStatus(u, currentLimit(), blobConfigured() ? "blob" : "local");
  } catch {
    return null;
  }
}
