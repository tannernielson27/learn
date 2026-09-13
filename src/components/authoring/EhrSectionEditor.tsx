"use client";

import { Button } from "@/components/ui/Button";
import {
  EHR_LIMITS,
  EHR_TAB_KIND_LABELS,
  EHR_TAB_KINDS,
  type EhrBlockForm,
  type EhrBlockKind,
  type EhrTabForm,
  type EhrTabKind,
  type EhrTimePointForm,
} from "@/lib/authoring/forms/ehr";
import {
  EhrBlockEditor,
  Sr,
  fieldClass,
  type FieldHelpers,
  type FocusLater,
} from "./EhrBlockEditors";

const BLOCK_LABELS: Record<EhrBlockKind, string> = {
  markdown: "Text",
  table: "Table",
  vitals: "Vitals",
};
const BLOCK_KINDS = Object.keys(BLOCK_LABELS) as EhrBlockKind[];

export type SectionPatch = Partial<Pick<EhrTabForm, "kind" | "title" | "timePointId">>;

export function moveButtonId(ids: string, index: number, direction: "up" | "down"): string {
  return `${ids}-section-${index}-${direction}`;
}

export interface EhrSectionEditorProps {
  tab: EhrTabForm;
  index: number;
  total: number;
  timePoints: readonly EhrTimePointForm[];
  ids: string;
  fields: FieldHelpers;
  focusLater: FocusLater;
  onChange: (patch: SectionPatch) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onAddBlock: (kind: EhrBlockKind) => void;
  onRemoveBlock: (blockIndex: number) => void;
  onBlockChange: (blockIndex: number, block: EhrBlockForm) => void;
}

/** One section of the record: what it is, its title, when it was charted, and its blocks. */
export function EhrSectionEditor({
  tab,
  index,
  total,
  timePoints,
  ids,
  fields,
  focusLater,
  onChange,
  onMove,
  onRemove,
  onAddBlock,
  onRemoveBlock,
  onBlockChange,
}: EhrSectionEditorProps) {
  const number = index + 1;
  const path = `tabs.${index}`;
  const control = (part: string) => ({
    id: fields.idFor(`${path}.${part}`),
    "aria-invalid": fields.invalid(`${path}.${part}`),
    "aria-describedby": fields.describedBy(`${path}.${part}`),
  });
  // The first Add button carries the section's block list id, for "needs at least one block".
  const addBlockId = fields.idFor(`${path}.blocks`);

  return (
    <fieldset className="flex flex-col gap-4 rounded-sm border border-line p-4">
      <legend className="px-1 text-sm font-medium text-ink-1">Section {number}</legend>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={fields.idFor(`${path}.kind`)} className="text-sm text-ink-1">
            <Sr>{`Section ${number}, `}</Sr>
            Kind
          </label>
          <select
            {...control("kind")}
            className={`tap-target ${fieldClass}`}
            value={tab.kind}
            onChange={(event) => onChange({ kind: event.target.value as EhrTabKind })}
          >
            {EHR_TAB_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EHR_TAB_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={fields.idFor(`${path}.title`)} className="text-sm text-ink-1">
            <Sr>{`Section ${number}, `}</Sr>
            Title
          </label>
          <input
            {...control("title")}
            type="text"
            className={`tap-target ${fieldClass}`}
            value={tab.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={fields.idFor(`${path}.timePointId`)} className="text-sm text-ink-1">
            <Sr>{`Section ${number}, `}</Sr>
            Time
          </label>
          <select
            {...control("timePointId")}
            className={`tap-target ${fieldClass}`}
            value={tab.timePointId}
            onChange={(event) => onChange({ timePointId: event.target.value })}
          >
            <option value="">Every time</option>
            {timePoints.map((point, at) => (
              <option key={point.id} value={point.id}>
                {point.label.trim() || `Time ${at + 1}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab.blocks.map((block, blockIndex) => (
        <div key={blockIndex} className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink-1">
            Block {blockIndex + 1}: {BLOCK_LABELS[block.kind]}
          </p>
          <EhrBlockEditor
            block={block}
            path={`${path}.blocks.${blockIndex}`}
            sectionNumber={number}
            blockNumber={blockIndex + 1}
            fields={fields}
            focusLater={focusLater}
            onChange={(next) => onBlockChange(blockIndex, next)}
          />
          {tab.blocks.length > 1 ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  focusLater(addBlockId);
                  onRemoveBlock(blockIndex);
                }}
              >
                Remove block
                <Sr>{` ${blockIndex + 1} from section ${number}`}</Sr>
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {tab.blocks.length < EHR_LIMITS.blocks ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {BLOCK_KINDS.map((kind, at) => (
            <Button
              key={kind}
              id={at === 0 ? addBlockId : undefined}
              size="sm"
              onClick={() => onAddBlock(kind)}
            >
              Add {BLOCK_LABELS[kind].toLowerCase()}
              <Sr>{` to section ${number}`}</Sr>
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {index > 0 ? (
          <Button
            id={moveButtonId(ids, index, "up")}
            size="sm"
            variant="ghost"
            onClick={() => onMove(-1)}
          >
            Move
            <Sr>{` section ${number}`}</Sr> up
          </Button>
        ) : null}
        {index < total - 1 ? (
          <Button
            id={moveButtonId(ids, index, "down")}
            size="sm"
            variant="ghost"
            onClick={() => onMove(1)}
          >
            Move
            <Sr>{` section ${number}`}</Sr> down
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove section
          <Sr>{` ${number}`}</Sr>
        </Button>
      </div>
    </fieldset>
  );
}
