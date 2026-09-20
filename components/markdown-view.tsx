import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { youtubeIds } from "@/lib/media";

/** 마크다운 렌더링 (GFM: 체크박스·표·취소선) + 유튜브 링크 자동 임베드 */
export function MarkdownView({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const ids = youtubeIds(children || "");
  return (
    <div className={cn("md-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a target="_blank" rel="noreferrer noopener" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
      {ids.map((id) => (
        <div
          key={id}
          className="mt-3 overflow-hidden rounded-md bg-ink/5"
          style={{ aspectRatio: "16 / 9" }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title="YouTube"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ))}
    </div>
  );
}
