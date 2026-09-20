"use client";

import { useState } from "react";
import { Plus, Trash2, ShoppingBasket, ChevronDown } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  CheckCircle,
  ColorPicker,
  Avatar,
  IconButton,
  EmptyState,
  Tag,
  useToast,
} from "@/components/ui";
import { palette, type PaletteKey } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { ShoppingItemWithMember, FamilyMember } from "@/lib/types";

export function ShoppingClient({
  initialItems,
  members,
}: {
  initialItems: ShoppingItemWithMember[];
  members: FamilyMember[];
}) {
  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState<PaletteKey>("mint");
  const [addedById, setAddedById] = useState<string>(members[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const { say } = useToast();

  const addedBy = members.find((m) => m.id === addedById);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  async function addItem() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      // 네트워크가 끊기면 fetch 는 **거부된다** — 응답이 안 오는 게 아니라 예외다.
      // catch 가 없으면 조용히 사라져서 "눌렀는데 아무 일도 없다" 가 된다.
      const res = await fetch("/api/shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, category, addedById: addedById || null }),
      });
      if (res.ok) {
        const created: ShoppingItemWithMember = await res.json();
        setItems((prev) => [...prev, created]);
        setName("");
        setQuantity("");
      } else {
        // 조용히 아무 일도 안 일어나면 자기가 잘못 눌렀다고 생각한다.
        say("못 담았어요. 잠시 후 다시 해 주세요.", "error");
      }
    } catch {
      say("못 담았어요. 연결을 확인해 주세요.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ShoppingItemWithMember) {
    const next = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
    await fetch(`/api/shopping/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: next }),
    }).catch(() => {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)));
      say("표시를 못 바꿨어요. 잠시 후 다시 해 주세요.", "error");
    });
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    const res = await fetch(`/api/shopping/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setItems(prev);
      say("못 지웠어요. 잠시 후 다시 해 주세요.", "error");
    }
  }

  async function clearDone() {
    const doneIds = done.map((d) => d.id);
    setItems((prev) => prev.filter((i) => !i.done));
    await Promise.all(doneIds.map((id) => fetch(`/api/shopping/${id}`, { method: "DELETE" })));
  }

  return (
    <div>
      <PageHeader
        emoji="🛒"
        title="장보기"
        description="온 가족이 함께 채우는 장바구니"
      >
        {done.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearDone}>
            <Trash2 className="h-4 w-4" /> 완료 {done.length}개 비우기
          </Button>
        )}
      </PageHeader>

      {/* 빠른 추가 — 폼이 목록을 밀어내지 않게 한 줄로.
          예전에는 수량·분류 6색·사람 4명이 늘 펼쳐져 있어 첫 항목까지 290px 였다.
          마트에서 필요한 건 목록이다. 분류·사람은 대개 지난번 그대로라 접어 두고,
          접힌 줄이 지금 값을 보여 준다 — 무엇이 골라져 있는지 펼치지 않고도 알게. */}
      <Card className="mb-4 flex flex-col gap-2.5">
        <div className="flex gap-2">
          <Input
            placeholder="무엇을 살까요? (예: 우유)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="min-w-0 flex-1"
          />
          <Input
            placeholder="수량"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="hidden w-28 sm:block"
          />
          <Button onClick={addItem} disabled={!name.trim() || busy} className="shrink-0">
            <Plus className="h-4 w-4" /> 담기
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="flex h-10 items-center gap-2 self-start rounded-full px-1 text-xs font-medium text-ink-faint transition hover:text-ink"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", palette(category).dot)} />
          {addedBy && (
            <Avatar emoji={addedBy.emoji} color={addedBy.color} name={addedBy.name} size="xs" />
          )}
          <span>수량, 분류, 담은 사람</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition", more && "rotate-180")} />
        </button>

        {more && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <Input
              placeholder="수량 (예: 2팩)"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              className="sm:hidden"
            />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-faint">분류</span>
                <ColorPicker value={category} onChange={setCategory} />
              </div>
              {members.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink-faint">추가한 사람</span>
                  <div className="flex gap-1">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAddedById(m.id)}
                        aria-pressed={addedById === m.id}
                        className={cn(
                          "rounded-full transition",
                          addedById === m.id
                            ? "ring-2 ring-primary ring-offset-1"
                            : "opacity-50 hover:opacity-100"
                        )}
                      >
                        <Avatar emoji={m.emoji} color={m.color} name={m.name} size="sm" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* 목록 */}
      {items.length === 0 ? (
        <EmptyState
          emoji="🧺"
          title="장바구니가 비었어요"
          description="위에서 살 것을 추가해 보세요."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {open.length > 0 && (
            <Card flush className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-5 py-3">
                <ShoppingBasket className="h-4 w-4 text-mint-ink" />
                <span className="font-display text-lg font-bold text-ink">살 것</span>
                <Tag color="mint" className="font-num">
                  {open.length}
                </Tag>
              </div>
              <ul>
                {open.map((item) => (
                  <ShoppingRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
                ))}
              </ul>
            </Card>
          )}

          {done.length > 0 && (
            <div>
              <p className="mb-2 px-1 text-sm font-semibold text-ink-faint">
                담은 것 {done.length}
              </p>
              <Card flush className="overflow-hidden opacity-70">
                <ul>
                  {done.map((item) => (
                    <ShoppingRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShoppingRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItemWithMember;
  onToggle: (i: ShoppingItemWithMember) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="group flex items-center border-b border-line last:border-0">
      {/* 줄 전체가 체크 버튼이다.
          마트에서 한 손으로 쓰는 화면이라, 24px 짜리 동그라미를 겨누는 것보다
          "우유" 라는 글자를 누르는 편이 훨씬 쉽다. 동그라미는 이제 모양만 맡는다.
          지우기는 버튼 안에 버튼을 넣을 수 없으므로 바깥에 형제로 둔다. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.quantity ? `${item.name} ${item.quantity}` : item.name}
        onClick={() => onToggle(item)}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 pr-2 text-left active:opacity-70"
      >
        <CheckCircle checked={item.done} color={item.category} />
        {/* 이름과 수량을 한 덩어리로 묶고 좁아지면 수량이 아래로 내려간다.
            한 줄로 밀어 넣으면 글자를 키운 사람에게 "우유" 가 "두" 로 잘린다. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          <span
            className={cn(
              "min-w-0 flex-1 basis-24 text-[0.9375rem]",
              item.done ? "text-ink-faint line-through" : "text-ink"
            )}
          >
            {item.name}
          </span>
          {item.quantity && (
            <span className="shrink-0 text-sm text-ink-faint">{item.quantity}</span>
          )}
        </span>
      </button>
      {/* 분류 색은 동그라미가 이미 지니고 있다 — 옆의 작은 점은 같은 말을 두 번 하는 것이었고,
          이름 말고는 아무 데도 적혀 있지 않아 색만으로는 무슨 분류인지 알 수도 없었다. */}
      {item.addedBy && (
        <Avatar emoji={item.addedBy.emoji} color={item.addedBy.color} name={item.addedBy.name} size="xs" />
      )}
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`${item.name} 지우기`}
        onClick={() => onRemove(item.id)}
        className="mr-3 ml-1 text-ink-faint transition hover:text-danger-ink lg:opacity-0 lg:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </li>
  );
}
