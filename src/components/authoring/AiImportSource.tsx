import type { ReactNode } from "react";
import {
  pagesLabel,
  parseSource,
  sourceLegend,
  type SourceNode,
} from "@/lib/authoring/sourceMarkup";

export interface AiImportSourceProps {
  /** The question's part of the document, or its opening words (a PDF, an older import). */
  text: string;
  /** For a PDF: the pages it was read from. */
  pages?: { from: number; to: number } | null;
  /** The file's name, said with the pages. */
  fileName?: string | null;
}

function draw(nodes: readonly SourceNode[], path = "n"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}-${index}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "break":
        return <br key={key} />;
      case "shaded":
        return (
          <span key={key} className="mr-1 rounded-sm border border-line px-1 text-sm text-ink-2">
            Shaded
          </span>
        );
      case "bold":
        return <strong key={key}>{draw(node.children, key)}</strong>;
      case "underline":
        return <u key={key}>{draw(node.children, key)}</u>;
      case "struck":
        return <s key={key}>{draw(node.children, key)}</s>;
      case "highlight":
        return (
          <mark key={key} className="bg-flag-soft px-0.5 text-ink-1">
            {draw(node.children, key)}
          </mark>
        );
      case "coloured":
        return (
          <span key={key} className="underline decoration-dotted underline-offset-4">
            {draw(node.children, key)}
          </span>
        );
    }
  });
}

/**
 * A question's source beside it (#593, ADR 0008 step 8): the document's own words with its marks
 * drawn as formatting, so a key marked in bold or yellow can be checked by eye. Text only: every
 * mark is a React element, and nothing from the document is ever set as HTML.
 *
 * A PDF has no text on the server, so only the opening words were kept. The panel says so, and
 * names the pages to look at in the teacher's own file.
 */
export function AiImportSource({ text, pages = null, fileName = null }: AiImportSourceProps) {
  const nodes = parseSource(text);
  const legend = sourceLegend(nodes);
  return (
    <div className="flex flex-col gap-2">
      {text ? (
        <p className="font-read text-base break-words whitespace-pre-wrap text-ink-1">
          {draw(nodes)}
        </p>
      ) : (
        <p className="text-sm text-ink-2">
          The document&apos;s text for this question was not kept.
        </p>
      )}
      {legend ? <p className="text-sm text-ink-2">{legend}</p> : null}
      {pages ? (
        <p className="text-sm text-ink-2" data-testid="source-pages">
          Opening words only. Check the rest on {pagesLabel(pages)}
          {fileName ? ` of ${fileName}` : " of your PDF"}.
        </p>
      ) : null}
    </div>
  );
}
