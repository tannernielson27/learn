"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  EHR_LIMITS,
  addTableColumn,
  addTableRow,
  addVitalsRow,
  removeTableColumn,
  removeTableRow,
  removeVitalsRow,
  setTableCell,
  setTableHeading,
  updateVitalsRow,
  type EhrBlockForm,
  type EhrFlag,
  type EhrTableBlockForm,
  type EhrVitalsBlockForm,
} from "@/lib/authoring/forms/ehr";

export const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

/**
 * Words only a screen reader hears. Labels stay short on screen, where the section and block they
 * sit in are plain to see, and whole when read out of context, such as from a list of form fields.
 *
 * Name computation trims the text of each child element, so a space at either end of the hidden
 * words is moved outside the span; otherwise "Move" and " section 2" would read "Movesection 2".
 */
export function Sr({ children }: { children: string }): ReactNode {
  return (
    <>
      {children.startsWith(" ") ? " " : null}
      <span className="sr-only">{children.trim()}</span>
      {children.endsWith(" ") ? " " : null}
    </>
  );
}

/** How a field finds its id and its problem message, from its path in the form. */
export interface FieldHelpers {
  idFor: (field: string) => string;
  invalid: (field: string) => true | undefined;
  describedBy: (field: string) => string | undefined;
}

/**
 * Focuses the first of these elements that exists after the next render. A Remove button often
 * removes itself, which would otherwise leave keyboard focus on the page. Call it from handlers.
 */
export type FocusLater = (...elementIds: string[]) => void;

interface BlockEditorProps<Block extends EhrBlockForm> {
  block: Block;
  /** Form path of the block, e.g. "tabs.1.blocks.0". */
  path: string;
  sectionNumber: number;
  blockNumber: number;
  fields: FieldHelpers;
  focusLater: FocusLater;
  onChange: (block: EhrBlockForm) => void;
}

function TextBlockEditor({
  block,
  path,
  sectionNumber,
  blockNumber,
  fields,
  onChange,
}: BlockEditorProps<Extract<EhrBlockForm, { kind: "markdown" }>>) {
  const id = fields.idFor(path);
  const hint = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-1">
        <Sr>{`Section ${sectionNumber}, block ${blockNumber}, `}</Sr>
        Text
      </label>
      <textarea
        id={id}
        rows={5}
        className={fieldClass}
        value={block.value}
        aria-invalid={fields.invalid(path)}
        aria-describedby={[hint, fields.describedBy(path)].filter(Boolean).join(" ")}
        onChange={(event) => onChange({ kind: "markdown", value: event.target.value })}
      />
      <p id={hint} className="text-xs text-ink-2">
        Leave a blank line between paragraphs. Start lines with &quot;- &quot; for a list, or a note
        with a time such as &quot;0800: &quot;.
      </p>
    </div>
  );
}

/**
 * A table as a heading per column and a group per row, stacked rather than laid out as a grid, so
 * a wide chart never pushes the page sideways on a phone.
 */
function TableBlockEditor({
  block,
  path,
  sectionNumber,
  blockNumber,
  fields,
  focusLater,
  onChange,
}: BlockEditorProps<EhrTableBlockForm>) {
  const where = `Section ${sectionNumber}, block ${blockNumber}, `;
  const scope = `section ${sectionNumber}, block ${blockNumber}`;
  const base = fields.idFor(path);
  // The first heading carries the block's own id, so a problem with the block focuses it.
  const headingId = (column: number) => (column === 0 ? base : `${base}-heading-${column}`);
  const cellId = (row: number, column: number) => `${base}-row-${row}-column-${column}`;
  const addRowId = `${base}-add-row`;
  const addColumnId = `${base}-add-column`;

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-ink-1">Column headings</legend>
        <p className="text-xs text-ink-2">
          The first column heads each row. Leave its heading blank for a grid of measures by time.
        </p>
        {block.columns.map((heading, column) => (
          <div key={column} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={headingId(column)} className="text-sm text-ink-1">
                <Sr>{where}</Sr>
                Column {column + 1} heading
              </label>
              <input
                id={headingId(column)}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={heading}
                aria-invalid={column === 0 ? fields.invalid(path) : undefined}
                aria-describedby={column === 0 ? fields.describedBy(path) : undefined}
                onChange={(event) => onChange(setTableHeading(block, column, event.target.value))}
              />
            </div>
            {block.columns.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  focusLater(addColumnId);
                  onChange(removeTableColumn(block, column));
                }}
              >
                Remove column {column + 1}
                <Sr>{` from ${scope}`}</Sr>
              </Button>
            ) : null}
          </div>
        ))}
      </fieldset>

      {block.rows.map((cells, row) => (
        <fieldset key={row} className="flex flex-col gap-2 rounded-sm border border-line p-3">
          <legend className="px-1 text-sm text-ink-1">Row {row + 1}</legend>
          {cells.map((cell, column) => (
            <div key={column} className="flex flex-col gap-1">
              <label htmlFor={cellId(row, column)} className="text-sm text-ink-1">
                <Sr>{where}</Sr>
                Row {row + 1}, column {column + 1}
              </label>
              <input
                id={cellId(row, column)}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={cell}
                onChange={(event) => onChange(setTableCell(block, row, column, event.target.value))}
              />
            </div>
          ))}
          {block.rows.length > 1 ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  focusLater(addRowId);
                  onChange(removeTableRow(block, row));
                }}
              >
                Remove row {row + 1}
                <Sr>{` from ${scope}`}</Sr>
              </Button>
            </div>
          ) : null}
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        {block.rows.length < EHR_LIMITS.tableRows ? (
          <Button id={addRowId} size="sm" onClick={() => onChange(addTableRow(block))}>
            Add row
            <Sr>{` to ${scope}`}</Sr>
          </Button>
        ) : null}
        {block.columns.length < EHR_LIMITS.tableColumns ? (
          <Button id={addColumnId} size="sm" onClick={() => onChange(addTableColumn(block))}>
            Add column
            <Sr>{` to ${scope}`}</Sr>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const FLAGS: { value: EhrFlag; label: string }[] = [
  { value: "", label: "None" },
  { value: "H", label: "H (high)" },
  { value: "L", label: "L (low)" },
];

/** Vitals and labs: a measure, its value, an optional unit and an optional high or low flag. */
function VitalsBlockEditor({
  block,
  path,
  sectionNumber,
  blockNumber,
  fields,
  focusLater,
  onChange,
}: BlockEditorProps<EhrVitalsBlockForm>) {
  const scope = `section ${sectionNumber}, block ${blockNumber}`;
  const addMeasureId = `${fields.idFor(path)}-add-measure`;

  return (
    <div className="flex flex-col gap-3">
      {block.rows.map((measure, row) => {
        const prefix = `Section ${sectionNumber}, block ${blockNumber}, row ${row + 1}, `;
        const rowPath = `${path}.rows.${row}`;
        const textField = (key: "label" | "value" | "unit", label: string) => {
          const field = `${rowPath}.${key}`;
          const id = fields.idFor(field);
          return (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={id} className="text-sm text-ink-1">
                <Sr>{prefix}</Sr>
                {label}
              </label>
              <input
                id={id}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={measure[key]}
                aria-invalid={fields.invalid(field)}
                aria-describedby={fields.describedBy(field)}
                onChange={(event) => {
                  const text = event.target.value;
                  const patch =
                    key === "label"
                      ? { label: text }
                      : key === "value"
                        ? { value: text }
                        : { unit: text };
                  onChange(updateVitalsRow(block, row, patch));
                }}
              />
            </div>
          );
        };
        const flagId = fields.idFor(`${rowPath}.flag`);

        return (
          <fieldset key={row} className="flex flex-col gap-2 rounded-sm border border-line p-3">
            <legend className="px-1 text-sm text-ink-1">Measure {row + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {textField("label", "Measure")}
              {textField("value", "Value")}
              {textField("unit", "Unit")}
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={flagId} className="text-sm text-ink-1">
                  <Sr>{prefix}</Sr>
                  Flag
                </label>
                <select
                  id={flagId}
                  className={`tap-target ${fieldClass}`}
                  value={measure.flag}
                  onChange={(event) =>
                    onChange(updateVitalsRow(block, row, { flag: event.target.value as EhrFlag }))
                  }
                >
                  {FLAGS.map((flag) => (
                    <option key={flag.value} value={flag.value}>
                      {flag.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {block.rows.length > 1 ? (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    focusLater(addMeasureId);
                    onChange(removeVitalsRow(block, row));
                  }}
                >
                  Remove measure {row + 1}
                  <Sr>{` from ${scope}`}</Sr>
                </Button>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {block.rows.length < EHR_LIMITS.vitalsRows ? (
        <div>
          <Button id={addMeasureId} size="sm" onClick={() => onChange(addVitalsRow(block))}>
            Add measure
            <Sr>{` to ${scope}`}</Sr>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The fields for one block of a section, by its kind. */
export function EhrBlockEditor(props: BlockEditorProps<EhrBlockForm>) {
  const { block } = props;
  if (block.kind === "markdown") return <TextBlockEditor {...props} block={block} />;
  if (block.kind === "table") return <TableBlockEditor {...props} block={block} />;
  return <VitalsBlockEditor {...props} block={block} />;
}
