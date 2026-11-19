import { TableBlock } from "@/components/ehr/blocks";
import { richTextBlocks } from "@/lib/ngn/richTextBlocks";
import type { RichText } from "@/lib/ngn/schemas";

/**
 * Minimal rich text: paragraphs split on blank lines, and a pipe table (#605), shown with the
 * chart's own table so a lab table in a question reads as it would in the patient record. Fuller
 * markdown arrives with authoring.
 */
export function RichTextView({ text, className = "" }: { text: RichText; className?: string }) {
  return (
    <div className={className}>
      {richTextBlocks(text.value).map((block, i) => {
        const spacing = i > 0 ? "mt-3" : "";
        if (block.kind === "table") {
          return (
            <div key={i} className={spacing || undefined}>
              <TableBlock kind="table" columns={block.columns} rows={block.rows} inText />
            </div>
          );
        }
        return (
          <p key={i} className={spacing}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
