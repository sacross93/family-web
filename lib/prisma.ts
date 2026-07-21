import { PrismaClient } from "@prisma/client";

// Next.js 개발 모드에서 핫 리로드 시 PrismaClient 인스턴스가 여러 개
// 생기는 것을 막기 위한 싱글턴 패턴.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
