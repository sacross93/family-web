// 로그인 계정 추가 도우미
// 사용법:
//   npm run user:add -- <아이디> <비밀번호> [이름] [--admin]
// 예시:
//   npm run user:add -- appa 1234 아빠
//   npm run user:add -- eomma 5678 엄마 --admin
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const isAdmin = args.includes("--admin");
  const [username, password, name] = args.filter((a) => a !== "--admin");

  if (!username || !password) {
    console.error("사용법: npm run user:add -- <아이디> <비밀번호> [이름] [--admin]");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.appUser.upsert({
    where: { username },
    update: { passwordHash, name: name ?? undefined, isAdmin },
    create: { username, passwordHash, name: name ?? null, isAdmin },
  });

  console.log(
    `✓ 계정 저장됨 → ${user.username}${user.name ? ` (${user.name})` : ""}${
      user.isAdmin ? " · 관리자" : ""
    }`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
