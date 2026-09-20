"use client";

import { createContext, useContext, useId } from "react";
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

/**
 * `Field` 가 만든 id 를 안쪽 컨트롤에 건네는 통로.
 *
 * 이게 없을 때는 **라벨이 어디에도 붙어 있지 않았다.** `<Label>아이디</Label>` 과
 * `<Input>` 이 그냥 나란히 있었을 뿐이라, 스크린리더는 그 칸의 이름을 자리표시
 * (placeholder)에서 가져오고 있었다. 로그인 칸에서 자리표시를 지웠더니
 * **이름이 통째로 사라져** ui:audit 이 칸을 못 찾았다 — 그래서 알았다.
 * 라벨을 눌러도 칸에 커서가 가지 않던 것도 같은 이유다.
 */
const FieldId = createContext<string | undefined>(undefined);

const FIELD_BASE =
  "w-full rounded-md border border-control bg-surface px-4 text-[0.9375rem] text-ink placeholder:text-ink-faint outline-none transition focus:border-primary focus:ring-4 focus:ring-primary-soft";

export function Label({
  children,
  className,
  htmlFor,
}: {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-sm font-semibold text-ink", className)}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldId.Provider value={label ? id : undefined}>
      <div className={cn("flex flex-col", className)}>
        {label && <Label htmlFor={id}>{label}</Label>}
        {children}
        {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
      </div>
    </FieldId.Provider>
  );
}

export function Input({
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = useContext(FieldId);
  return <input id={id ?? fieldId} className={cn(FIELD_BASE, "h-11", className)} {...props} />;
}

export function Textarea({
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = useContext(FieldId);
  return (
    <textarea
      id={id ?? fieldId}
      className={cn(FIELD_BASE, "min-h-[92px] resize-none py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = useContext(FieldId);
  return (
    // 화살표를 **글자색으로** 그린다.
    // 전에는 SVG 를 data URI 로 배경에 깔면서 색을 손으로 박아 뒀는데, 팔레트를 두 번
    // 바꾸는 동안 그 값만 옛 색(#6a6279)에 남아 있었다. 토큰 값을 베껴 적으면 반드시 어긋난다.
    <span className="relative block">
      <select
        id={id ?? fieldId}
        className={cn(FIELD_BASE, "h-11 cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      />
    </span>
  );
}
