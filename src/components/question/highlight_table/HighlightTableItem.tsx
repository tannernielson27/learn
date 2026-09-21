"use client";

import { useId, type ReactNode } from "react";
import { ElementRationaleList } from "../ElementRationale";
import {
  HighlightTokens,
  spanOrder,
  toggleSpan,
  type HighlightToken,
} from "../highlight/HighlightTokens";
import { RowScoreMark, type RowScore } from "../matrix/Matrix";
import { rowScorer } from "../rowScore";
import type { ItemRendererProps } from "../types";

interface HighlightRow {
  id: string;
  cells: readonly (readonly HighlightToken[])[];
}

/** Grid and cards both render, one hidden by CSS, so each needs its own explanation ids. */
type Layout = "grid" | "card";

interface LayoutProps {
  columns: readonly string[];
  rows: readonly HighlightRow[];
  cell: (tokens: readonly HighlightToken[], layout: Layout) => ReactNode;
  /** Explanations for a cell's spans, in feedback only; renders nothing otherwise. */
  why: (tokens: readonly HighlightToken[], layout: Layout) => ReactNode;
  rowScore?: (rowId: string) => RowScore | undefined;
}

const CAPTION = "Select every finding that applies.";

/** Plain text of a cell, used to name a row card after its first cell. */
const cellText = (tokens: readonly HighlightToken[]) => tokens.map((t) => t.value).join("");

/**
 * Cells with spans use a 46px line height so padded spans never overlap. A text-only row header
 * keeps normal leading, so a long label wraps tightly, and is nudged down 19px to sit on the
 * first line of its findings: (46px - 24px) / 2 of half-leading difference plus the 8px cell top.
 */
const headerClasses = (tokens: readonly HighlightToken[]) =>
  tokens.some((t) => t.kind === "span") ? "pt-2 leading-[2.875]" : "pt-[1.1875rem]";

/** A table at 768px and wider, one card per row below; both render from one response. */
function HighlightGrid({ columns, rows, cell, why, rowScore }: LayoutProps) {
  return (
    // Padding cancelled by the margin, so the scroll box does not clip a span's focus ring.
    <div className="-m-1 hidden overflow-x-auto p-1 md:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{CAPTION}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={`border-b border-line-strong pr-4 pb-2 text-sm font-medium text-ink-2 ${index === 0 ? "w-1/4" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const score = rowScore?.(row.id);
            const [first, ...rest] = row.cells;
            return (
              <tr key={row.id} className="border-b border-line">
                <th
                  scope="row"
                  className={`option pr-4 pb-2 text-left align-top font-normal ${headerClasses(first)}`}
                >
                  {cell(first, "grid")}
                  {score ? <RowScoreMark score={score} /> : null}
                  {why(first, "grid")}
                </th>
                {rest.map((tokens, index) => (
                  <td key={index} className="option py-2 pr-4 align-top leading-[2.875]">
                    {cell(tokens, "grid")}
                    {why(tokens, "grid")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HighlightCards({ columns, rows, cell, why, rowScore }: LayoutProps) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <p className="sr-only">{CAPTION}</p>
      {rows.map((row) => {
        const score = rowScore?.(row.id);
        const [first, ...rest] = row.cells;
        return (
          <fieldset
            key={row.id}
            aria-label={cellText(first)}
            className="min-w-0 rounded-sm border border-line bg-surface-1 px-3 pt-1 pb-3"
          >
            <legend className="option float-left w-full py-2 font-medium">
              {cell(first, "card")}
            </legend>
            {score ? (
              <p className="clear-left -mt-1 mb-1 text-ink-2">
                <RowScoreMark score={score} />
              </p>
            ) : null}
            <div className="clear-left">{why(first, "card")}</div>
            <div className="clear-left flex flex-col gap-2">
              {rest.map((tokens, index) => (
                <div key={index}>
                  <p className="eyebrow">{columns[index + 1]}</p>
                  <p className="option leading-[2.875]">{cell(tokens, "card")}</p>
                  {why(tokens, "card")}
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function HighlightTableItem({
  item,
  response,
  mode,
  score,
  onChange,
}: ItemRendererProps<"highlight_table">) {
  const uid = useId();
  const { columns, rows } = item.content;
  const order = rows.flatMap((r) => r.cells.flatMap((c) => spanOrder(c)));
  const selected = new Set(response.spanIds);
  const correct = new Set(item.answerKey?.correctSpanIds ?? []);
  // Rationale reaches the renderer in feedback only; the mode check keeps it off the page anyway.
  const rationale = (spanId: string) =>
    mode === "feedback" ? item.rationale?.perElement?.[spanId] : undefined;
  const whyId = (layout: Layout, spanId: string) => `${uid}-${layout}-why-${spanId}`;
  const cell = (tokens: readonly HighlightToken[], layout: Layout) => (
    <HighlightTokens
      tokens={tokens}
      selected={selected}
      correct={correct}
      mode={mode}
      describedBy={(spanId) => (rationale(spanId) ? whyId(layout, spanId) : undefined)}
      onToggle={(spanId) =>
        onChange({ type: "highlight_table", spanIds: toggleSpan(order, response.spanIds, spanId) })
      }
    />
  );
  // #49: a span is a phrase in a table cell, so its explanation goes beneath that cell, inside it,
  // where the finding sits in the grid and in its row card. A cell's findings are a list, not a
  // sentence, so nothing reads broken; with more than one explained, each is named.
  const why = (tokens: readonly HighlightToken[], layout: Layout) => (
    <ElementRationaleList
      className="pb-2"
      items={tokens.flatMap((token) =>
        token.kind === "span"
          ? [{ id: whyId(layout, token.spanId), label: token.value, text: rationale(token.spanId) }]
          : [],
      )}
    />
  );
  const layout: LayoutProps = {
    columns,
    rows,
    cell,
    why,
    // Per-row marks appear only when the item scores per row, which is exactly when the score
    // carries per-row subtotals.
    rowScore: rowScorer(mode, score),
  };
  return (
    <div>
      <HighlightGrid {...layout} />
      <HighlightCards {...layout} />
    </div>
  );
}
