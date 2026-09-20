"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Quote,
  Link2,
  ImagePlus,
  Code,
  Eye,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownView } from "@/components/markdown-view";
import { MAX_EDGE, shrinkForUpload } from "@/lib/image-upload";

/** 옵시디언식 마크다운 에디터 — 툴바·단축키·미리보기·이미지 업로드 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "여기에 자유롭게 적어보세요… (마크다운 지원)",
  minHeight = 160,
  autoFocus,
  label = "내용",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
  /**
   * 글 칸의 이름. 스크린리더가 읽는다.
   * 자리표시로는 안 된다 — 글자를 넣는 순간 사라진다. `ui:audit` 이 확인한다.
   */
  label?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 툴바 조작 후 커서 위치 복원
  useEffect(() => {
    if (pendingSel.current && taRef.current) {
      const [s, e] = pendingSel.current;
      taRef.current.focus();
      taRef.current.setSelectionRange(s, e);
      pendingSel.current = null;
      autoGrow();
    }
  });

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(minHeight, ta.scrollHeight) + "px";
  }

  function wrap(before: string, after: string) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = value.slice(s, e);
    const nv = value.slice(0, s) + before + sel + after + value.slice(e);
    pendingSel.current = [s + before.length, s + before.length + sel.length];
    onChange(nv);
  }

  function linePrefix(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const segment = value.slice(lineStart, e);
    const prefixed = segment
      .split("\n")
      .map((l) => prefix + l)
      .join("\n");
    const nv = value.slice(0, lineStart) + prefixed + value.slice(e);
    pendingSel.current = [lineStart, lineStart + prefixed.length];
    onChange(nv);
  }

  function insert(text: string, selectFrom?: number, selectTo?: number) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const nv = value.slice(0, s) + text + value.slice(e);
    if (selectFrom != null) pendingSel.current = [s + selectFrom, s + (selectTo ?? selectFrom)];
    else pendingSel.current = [s + text.length, s + text.length];
    onChange(nv);
  }

  function addLink() {
    const ta = taRef.current;
    if (!ta) return;
    const sel = value.slice(ta.selectionStart, ta.selectionEnd) || "링크";
    const text = `[${sel}](url)`;
    insert(text, sel.length + 3, sel.length + 6); // "url" 선택
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", await shrinkForUpload(file, MAX_EDGE.photo));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const { urls } = await res.json();
      if (urls?.[0]) insert(`\n![](${urls[0]})\n`);
    } finally {
      setUploading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      wrap("**", "**");
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      wrap("*", "*");
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      addLink();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // 목록/체크박스/인용 자동 이어쓰기
      const ta = taRef.current!;
      const s = ta.selectionStart;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(lineStart, s);
      const m = line.match(/^(\s*)(- \[[ xX]\] |[-*] |> |(\d+)\. )/);
      if (m) {
        e.preventDefault();
        const content = line.slice(m[0].length);
        if (content.trim() === "") {
          // 빈 항목 → 목록 종료
          const nv = value.slice(0, lineStart) + value.slice(s);
          pendingSel.current = [lineStart, lineStart];
          onChange(nv);
        } else {
          let marker = m[2];
          if (m[3]) marker = `${Number(m[3]) + 1}. `; // 번호 증가
          if (/\[[xX]\]/.test(marker)) marker = "- [ ] "; // 체크는 빈 체크로
          const ins = "\n" + m[1] + marker;
          insert(ins);
        }
      }
    }
  }

  const files = useRef<HTMLInputElement>(null);

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-surface focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-soft">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
        <ToolBtn label="굵게 (⌘B)" onClick={() => wrap("**", "**")}><Bold className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="기울임 (⌘I)" onClick={() => wrap("*", "*")}><Italic className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="제목" onClick={() => linePrefix("## ")}><Heading2 className="h-4 w-4" /></ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn label="목록" onClick={() => linePrefix("- ")}><List className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="체크리스트" onClick={() => linePrefix("- [ ] ")}><ListChecks className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="인용" onClick={() => linePrefix("> ")}><Quote className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="코드" onClick={() => wrap("`", "`")}><Code className="h-4 w-4" /></ToolBtn>
        <span className="mx-1 h-4 w-px bg-line" />
        <ToolBtn label="링크 (⌘K)" onClick={addLink}><Link2 className="h-4 w-4" /></ToolBtn>
        <ToolBtn label="사진" onClick={() => files.current?.click()} disabled={uploading}>
          <ImagePlus className="h-4 w-4" />
        </ToolBtn>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className={cn(
              "flex h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold transition lg:h-7",
              preview ? "bg-primary-soft text-primary-ink" : "text-ink-faint hover:bg-sunken hover:text-ink"
            )}
          >
            {preview ? <PenLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "쓰기" : "미리보기"}
          </button>
        </div>
        <input
          ref={files}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadImage(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* 본문 */}
      {preview ? (
        <div className="px-4 py-3" style={{ minHeight }}>
          {value.trim() ? (
            <MarkdownView>{value}</MarkdownView>
          ) : (
            <p className="text-sm text-ink-faint">미리볼 내용이 없어요.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            autoGrow();
          }}
          onKeyDown={onKeyDown}
          onInput={autoGrow}
          onDrop={(e) => {
            const f = e.dataTransfer.files?.[0];
            if (f && f.type.startsWith("image/")) {
              e.preventDefault();
              uploadImage(f);
            }
          }}
          onPaste={(e) => {
            // 클립보드 이미지 붙여넣기 → 업로드
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const it of items) {
              if (it.type.startsWith("image/")) {
                const f = it.getAsFile();
                if (f) {
                  e.preventDefault();
                  uploadImage(f);
                }
                return;
              }
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          autoFocus={autoFocus}
          className="block w-full resize-none border-0 bg-transparent px-4 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}

function ToolBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      // 폰·태블릿에서는 40px(DESIGN §9). 32px 툴바를 손가락으로 겨누면 옆 버튼이 눌린다.
      // 이 툴바는 접힌 작성칸 안에 있어서 **검사에 한 번도 안 잡혔다** — 모달·작성칸을
      // 열어 보게 하고서야 드러났다.
      className="flex h-10 w-10 items-center justify-center rounded-md text-ink-soft transition hover:bg-sunken hover:text-ink disabled:opacity-40 lg:h-8 lg:w-8"
    >
      {children}
    </button>
  );
}
