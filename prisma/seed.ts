import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── 날짜 헬퍼 (오늘 기준 상대 날짜) ──
const now = new Date();
const Y = now.getFullYear();
function at(monthIndex: number, day: number, h = 0, m = 0) {
  return new Date(Y, monthIndex, day, h, m, 0, 0);
}
function today(h = 0, m = 0) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("🌱 기존 데이터 정리...");
  // FK 순서 고려하여 삭제
  await prisma.photo.deleteMany();
  await prisma.album.deleteMany();
  await prisma.planChecklistItem.deleteMany();
  await prisma.planItem.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.anniversary.deleteMany();
  await prisma.boardPost.deleteMany();
  await prisma.shoppingItem.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.user.deleteMany();

  console.log("🔐 로그인 계정...");
  // 공유 계정 (추후 각자 계정은 DB에서 직접 추가)
  await prisma.appUser.upsert({
    where: { username: "wlsdud022" },
    update: {},
    create: {
      username: "wlsdud022",
      passwordHash: await bcrypt.hash("wlsdud022", 10),
      name: "우리 가족",
      isAdmin: true,
    },
  });

  console.log("👨‍👩‍👧‍👦 가족 구성원...");
  const appa = await prisma.familyMember.create({
    data: { name: "아빠", role: "아빠", emoji: "🧔", color: "sky", birthday: new Date(1986, 4, 12) },
  });
  const eomma = await prisma.familyMember.create({
    data: { name: "엄마", role: "엄마", emoji: "👩", color: "rose", birthday: new Date(1988, 8, 3) },
  });
  const jihun = await prisma.familyMember.create({
    data: { name: "지훈", role: "첫째", emoji: "🧒", color: "mint", birthday: new Date(2016, 2, 21) },
  });
  const seoyeon = await prisma.familyMember.create({
    data: { name: "서연", role: "둘째", emoji: "👧", color: "butter", birthday: new Date(2019, 10, 8) },
  });

  console.log("📸 사진첩...");
  const bali = await prisma.album.create({
    data: {
      title: "발리 가족여행",
      description: "온 가족 첫 해외여행 🌴 우붓 · 스미냑 · 누사두아",
      emoji: "🌴",
      color: "sky",
      coverUrl: "/samples/cover-bali.svg",
      takenOn: at(0, 15),
    },
  });
  const baliCaptions = [
    "야자수 아래에서",
    "해변 도착!",
    "코코넛 한 잔",
    "노을이 예술",
    "스노클링 도전",
    "선셋 크루즈",
    "칵테일 타임",
    "파도랑 놀기",
  ];
  await prisma.photo.createMany({
    data: baliCaptions.map((caption, i) => ({
      albumId: bali.id,
      url: `/samples/bali-${i + 1}.svg`,
      caption,
      sortOrder: i,
    })),
  });

  const home = await prisma.album.create({
    data: {
      title: "우리집 일상",
      description: "소소하지만 확실한 행복 🏡",
      emoji: "🏡",
      color: "peach",
      coverUrl: "/samples/cover-home.svg",
      takenOn: addDays(today(), -20),
    },
  });
  const homeCaptions = ["주말 아침", "아빠표 계란말이", "댕댕이", "거실에서 뒹굴", "생일 케이크", "베란다 해바라기"];
  await prisma.photo.createMany({
    data: homeCaptions.map((caption, i) => ({
      albumId: home.id,
      url: `/samples/home-${i + 1}.svg`,
      caption,
      sortOrder: i,
    })),
  });

  const seoul = await prisma.album.create({
    data: {
      title: "서울 나들이",
      description: "봄날의 서울 산책 🌸",
      emoji: "🌸",
      color: "lavender",
      coverUrl: "/samples/cover-seoul.svg",
      takenOn: at(3, 6),
    },
  });
  const seoulCaptions = ["남산타워", "칼국수 맛집", "벚꽃 만개", "롯데월드", "카페 투어", "야경 산책"];
  await prisma.photo.createMany({
    data: seoulCaptions.map((caption, i) => ({
      albumId: seoul.id,
      url: `/samples/seoul-${i + 1}.svg`,
      caption,
      sortOrder: i,
    })),
  });

  console.log("🗺️ 계획...");
  const trip = await prisma.plan.create({
    data: {
      title: "여름 제주도 여행",
      type: "여행",
      emoji: "🏝️",
      color: "sky",
      description: "2박 3일 제주 한 바퀴",
      location: "제주도",
      startDate: addDays(today(), 14),
      endDate: addDays(today(), 16),
    },
  });
  const d1 = addDays(today(), 14);
  const d2 = addDays(today(), 15);
  const d3 = addDays(today(), 16);
  await prisma.planItem.createMany({
    data: [
      { planId: trip.id, dayDate: d1, time: "09:00", title: "김포공항 출발", category: "sky", sortOrder: 0 },
      { planId: trip.id, dayDate: d1, time: "12:00", title: "제주 도착 · 렌터카", category: "mint", sortOrder: 1 },
      { planId: trip.id, dayDate: d1, time: "13:30", title: "점심 - 고기국수", category: "peach", sortOrder: 2 },
      { planId: trip.id, dayDate: d1, time: "15:00", title: "협재 해수욕장", category: "sky", sortOrder: 3 },
      { planId: trip.id, dayDate: d2, time: "10:00", title: "성산일출봉 트레킹", category: "mint", sortOrder: 0 },
      { planId: trip.id, dayDate: d2, time: "13:00", title: "점심 - 해물뚝배기", category: "peach", sortOrder: 1 },
      { planId: trip.id, dayDate: d2, time: "16:00", title: "우도 유람선", category: "sky", sortOrder: 2 },
      { planId: trip.id, dayDate: d3, time: "10:00", title: "카페 & 기념품", category: "lavender", sortOrder: 0 },
      { planId: trip.id, dayDate: d3, time: "14:00", title: "공항 이동 · 귀가", category: "sky", sortOrder: 1 },
    ],
  });
  await prisma.planChecklistItem.createMany({
    data: [
      { planId: trip.id, kind: "prep", text: "항공권 예약", done: true, sortOrder: 0 },
      { planId: trip.id, kind: "prep", text: "숙소 예약", done: true, sortOrder: 1 },
      { planId: trip.id, kind: "prep", text: "렌터카 예약", sortOrder: 2 },
      { planId: trip.id, kind: "prep", text: "여행자보험 가입", sortOrder: 3 },
      { planId: trip.id, kind: "packing", text: "여권 / 신분증", sortOrder: 0 },
      { planId: trip.id, kind: "packing", text: "휴대폰 충전기", sortOrder: 1 },
      { planId: trip.id, kind: "packing", text: "선크림", sortOrder: 2 },
      { planId: trip.id, kind: "packing", text: "상비약", sortOrder: 3 },
      { planId: trip.id, kind: "packing", text: "수영복", sortOrder: 4 },
    ],
  });

  const weekend = await prisma.plan.create({
    data: {
      title: "이번 주말 계획",
      type: "주말",
      emoji: "🧺",
      color: "peach",
      description: "가볍게 알차게!",
      startDate: addDays(today(), (6 - now.getDay() + 7) % 7 || 6),
    },
  });
  await prisma.planItem.createMany({
    data: [
      { planId: weekend.id, time: "10:00", title: "대청소 & 빨래", category: "mint", sortOrder: 0 },
      { planId: weekend.id, time: "12:30", title: "동네 브런치", category: "peach", sortOrder: 1 },
      { planId: weekend.id, time: "15:00", title: "한강 자전거", category: "sky", sortOrder: 2 },
      { planId: weekend.id, time: "19:00", title: "가족 영화의 밤 🍿", category: "lavender", sortOrder: 3 },
    ],
  });

  console.log("📅 캘린더...");
  await prisma.calendarEvent.createMany({
    data: [
      { title: "치과 정기검진", start: today(15, 0), end: today(16, 0), color: "sky", location: "미소치과" },
      { title: "가족 저녁외식 🍜", start: addDays(today(), 2), allDay: true, color: "peach" },
      { title: "지훈 학교 공개수업", start: addDays(today(), 4), allDay: true, color: "mint", location: "햇살초등학교" },
      { title: "제주도 여행 ✈️", start: addDays(today(), 14), end: addDays(today(), 16), allDay: true, color: "lavender" },
      { title: "엄마 회사 워크샵", start: addDays(today(), 7), allDay: true, color: "rose" },
      { title: "아파트 관리비 납부", start: addDays(today(), 5), allDay: true, color: "butter" },
    ],
  });

  console.log("✅ 할일...");
  await prisma.todo.createMany({
    data: [
      { title: "저녁 장보기 🛒", date: today(), dueTime: "18:00", priority: "high", memberId: eomma.id, sortOrder: 0 },
      { title: "지훈 준비물 챙기기", date: today(), dueTime: "21:00", priority: "normal", memberId: appa.id, sortOrder: 1 },
      { title: "재활용 분리수거", date: today(), priority: "low", memberId: appa.id, sortOrder: 2 },
      { title: "서연 피아노 학원 데려다주기", date: today(), dueTime: "16:00", priority: "normal", memberId: eomma.id, done: true, sortOrder: 3 },
      { title: "제주 숙소 최종 확정", date: addDays(today(), 1), priority: "high", memberId: appa.id, sortOrder: 0 },
      { title: "도서관 책 반납", date: addDays(today(), 2), memberId: jihun.id, sortOrder: 0 },
    ],
  });

  console.log("🎉 기념일...");
  await prisma.anniversary.createMany({
    data: [
      { title: "아빠 생일", date: appa.birthday!, type: "birthday", emoji: "🎂", color: "sky", memberId: appa.id },
      { title: "엄마 생일", date: eomma.birthday!, type: "birthday", emoji: "🎂", color: "rose", memberId: eomma.id },
      { title: "지훈 생일", date: jihun.birthday!, type: "birthday", emoji: "🎂", color: "mint", memberId: jihun.id },
      { title: "서연 생일", date: seoyeon.birthday!, type: "birthday", emoji: "🎂", color: "butter", memberId: seoyeon.id },
      { title: "결혼기념일", date: new Date(2014, 5, 20), type: "anniversary", emoji: "💍", color: "rose" },
      { title: "가족 여행 D-day", date: addDays(today(), 14), type: "event", emoji: "✈️", color: "lavender", recurring: false },
    ],
  });

  console.log("💬 게시판...");
  await prisma.boardPost.createMany({
    data: [
      {
        content: "우리 가족 공간 '포동'에 오신 걸 환영해요! 🏡 여기에 사진도 올리고, 일정도 잡고, 하고 싶은 말도 남겨요.",
        emoji: "🎈",
        color: "lavender",
        pinned: true,
        authorId: eomma.id,
      },
      { content: "이번 주말 영화 뭐 볼지 추천 받아요~ 🍿", emoji: "🎬", color: "butter", authorId: jihun.id },
      { content: "냉장고에 서연이 푸딩 있으니까 아무도 손대지 마세요 🍮😤", emoji: "🍮", color: "rose", authorId: seoyeon.id },
      { content: "제주 여행 짐 리스트 장보기에 추가해뒀어요!", emoji: "🧳", color: "sky", authorId: appa.id },
    ],
  });

  console.log("🛒 장보기...");
  await prisma.shoppingItem.createMany({
    data: [
      { name: "우유", quantity: "2팩", category: "sky", addedById: eomma.id, sortOrder: 0 },
      { name: "계란", quantity: "1판", category: "butter", addedById: eomma.id, sortOrder: 1 },
      { name: "바나나", quantity: "1송이", category: "butter", addedById: jihun.id, sortOrder: 2 },
      { name: "세제", quantity: "1통", category: "mint", addedById: appa.id, sortOrder: 3 },
      { name: "여행용 선크림", quantity: "2개", category: "peach", addedById: appa.id, sortOrder: 4 },
      { name: "강아지 사료", quantity: "1봉", category: "peach", done: true, addedById: eomma.id, sortOrder: 5 },
    ],
  });

  console.log("✨ 시드 완료!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
