import type { RichText } from "@/lib/ngn/schemas";

/** Minimal rich text: paragraphs split on blank lines. Markdown parsing arrives with authoring. */
export function RichTextView({ text, className = "" }: { text: RichText; className?: string }) {
  const paragraphs = text.value.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-3" : ""}>
          {p}
        </p>
      ))}
    </div>
  );
}
