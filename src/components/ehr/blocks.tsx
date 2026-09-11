import type { EhrBlock } from "@/lib/ngn/schemas";

/** A clock time opening a note line: "0800: Alert and oriented." */
const TIMESTAMP = /^(\d{3,4}):\s+/;

const isList = (paragraph: string) =>
  paragraph.split("\n").every((line) => line.trimStart().startsWith("- "));

/**
 * The note face for chart text: paragraphs split on blank lines, dash lines as a real list, and a
 * leading clock time set in the mono face (docs/04-DESIGN-DIRECTION.md §6). Full markdown arrives
 * with authoring; charts only ever carry these two shapes.
 */
function NoteBlock({ value }: { value: string }) {
  const paragraphs = value.split(/\n{2,}/);
  return (
    <div className="ehr-note text-ink-1">
      {paragraphs.map((paragraph, index) => {
        const spacing = index > 0 ? "mt-3" : "";
        if (isList(paragraph)) {
          return (
            <ul key={index} className={`list-disc pl-5 ${spacing}`.trim()}>
              {paragraph.split("\n").map((line, lineIndex) => (
                <li key={lineIndex}>{line.trimStart().slice(2)}</li>
              ))}
            </ul>
          );
        }
        const stamp = TIMESTAMP.exec(paragraph);
        return (
          <p key={index} className={spacing}>
            {stamp ? <span className="ehr-time">{stamp[1]}</span> : null}
            {stamp ? ` ${paragraph.slice(stamp[0].length)}` : paragraph}
          </p>
        );
      })}
    </div>
  );
}

/**
 * A charted grid. The first cell of every row heads it; when its column header is blank the corner
 * stays a plain cell, because an empty `th` fails the axe empty-table-header rule.
 */
function TableBlock({ columns, rows }: Extract<EhrBlock, { kind: "table" }>) {
  const [corner, ...headers] = columns;
  const cornerIsBlank = !corner?.trim();
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {cornerIsBlank ? (
              <td className="border-b border-line-strong pb-2" />
            ) : (
              <th scope="col" className="border-b border-line-strong pr-4 pb-2 font-medium">
                {corner}
              </th>
            )}
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="border-b border-line-strong pr-4 pb-2 font-medium text-ink-2"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const [head, ...cells] = row;
            return (
              <tr key={rowIndex} className="border-b border-line last:border-b-0">
                <th scope="row" className="py-2 pr-4 align-top font-normal whitespace-nowrap">
                  {head}
                </th>
                {cells.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-2 pr-4 align-top">
                    {cell}
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

/**
 * Vitals and labs. Abnormal values carry an H or L tag with a spoken word beside it, never colour
 * alone, and red stays reserved for feedback (docs/04-DESIGN-DIRECTION.md §6, §8).
 */
function VitalsBlock({ rows }: Extract<EhrBlock, { kind: "vitals" }>) {
  return (
    <table className="tabular w-full border-collapse text-left text-sm">
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-line last:border-b-0">
            <th scope="row" className="py-2 pr-4 align-top font-normal">
              {row.label}
            </th>
            <td className="py-2 text-right align-top font-mono">{row.value}</td>
            <td className="py-2 pl-2 align-top text-ink-2">{row.unit ?? ""}</td>
            <td className="w-8 py-2 pl-2 align-top">
              {row.flag ? (
                <span className="inline-flex items-center rounded-sm border border-line-strong px-1 font-mono text-xs text-ink-2">
                  <span aria-hidden="true">{row.flag}</span>
                  <span className="sr-only">{row.flag === "H" ? "high" : "low"}</span>
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Every block of one chart tab, in order. */
export function EhrBlocks({ blocks }: { blocks: readonly EhrBlock[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => {
        if (block.kind === "markdown") return <NoteBlock key={index} value={block.value} />;
        if (block.kind === "table") return <TableBlock key={index} {...block} />;
        return <VitalsBlock key={index} {...block} />;
      })}
    </div>
  );
}
