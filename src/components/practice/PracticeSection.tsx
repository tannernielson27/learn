import type { ShareEntry } from "@/lib/supabase/practiceShares";
import { PracticeShareForm, type PracticeShareFormProps } from "./PracticeShareForm";
import { PracticeShareList, type PracticeShareListProps } from "./PracticeShareList";

export interface PracticeSectionProps {
  /** Heading level and look follow the page: the bank page's sections are larger. */
  headingClassName: string;
  intro: string;
  /** The current shares, or null when they could not be read. */
  shares: readonly ShareEntry[] | null;
  /** Every class (bank page) or bank (class page) of the org, or null when unreadable. */
  options: readonly { id: string; name: string }[] | null;
  list: Pick<
    PracticeShareListProps<ShareEntry>,
    "label" | "stopActionFor" | "stopLabelFor" | "warningFor" | "emptyMessage"
  >;
  form: Pick<PracticeShareFormProps, "action" | "label" | "emptyMessage">;
}

const HEADING_ID = "practice-heading";

/**
 * The Practice section of a bank page or a class page (#240): who it is shared with, Stop sharing,
 * and a form to share with one more. The form offers only what is not already shared.
 */
export function PracticeSection({
  headingClassName,
  intro,
  shares,
  options,
  list,
  form,
}: PracticeSectionProps) {
  const shared = new Set((shares ?? []).map((entry) => entry.id));
  const choices = (options ?? []).filter((option) => !shared.has(option.id));

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
      {/* Focusable from script only: a confirmed Stop sharing sends focus here (#288). */}
      <h2 id={HEADING_ID} tabIndex={-1} className={headingClassName}>
        Practice
      </h2>
      <p className="max-w-prose text-ink-2">{intro}</p>
      {shares === null ? (
        <p role="alert" className="text-ink-2">
          The practice shares could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <PracticeShareList entries={shares} focusAfterStop={HEADING_ID} {...list} />
      )}
      {options === null || shares === null ? null : (
        <PracticeShareForm choices={choices} {...form} />
      )}
    </section>
  );
}
