import { ConfirmSubmit, type ConfirmSubmitProps } from "@/components/classes/ConfirmSubmit";

export interface PracticeShareEntry {
  id: string;
  name: string;
}

export interface PracticeShareListProps<Entry extends PracticeShareEntry> {
  /** The list's accessible name. */
  label: string;
  /** The classes a bank is shared with, or the banks shared with a class. */
  entries: readonly Entry[];
  /** The stop Server Function bound to one entry. */
  stopActionFor: (id: string) => ConfirmSubmitProps["action"];
  /** A name for the Stop sharing button that says which share it stops. */
  stopLabelFor: (entry: Entry) => string;
  /** What stopping does, said before it happens: seen answers stay seen. */
  warningFor: (entry: Entry) => string;
  emptyMessage: string;
  /**
   * The id of the focusable heading above the list. A confirmed Stop sharing takes the row and its
   * button off the page, so focus goes here rather than to the document body (#288).
   */
  focusAfterStop?: string;
}

/** The practice shares on a bank page or a class page, each with Stop sharing (#240). */
export function PracticeShareList<Entry extends PracticeShareEntry>({
  label,
  entries,
  stopActionFor,
  stopLabelFor,
  warningFor,
  emptyMessage,
  focusAfterStop,
}: PracticeShareListProps<Entry>) {
  if (entries.length === 0) return <p className="text-ink-2">{emptyMessage}</p>;

  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line border-y border-line">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-3"
        >
          <span className="min-w-0 break-words text-ink-1">{entry.name}</span>
          <ConfirmSubmit
            action={stopActionFor(entry.id)}
            label="Stop sharing"
            ariaLabel={stopLabelFor(entry)}
            confirmLabel="Stop sharing"
            warning={warningFor(entry)}
            focusOnSuccess={focusAfterStop}
          />
        </li>
      ))}
    </ul>
  );
}
