import { FocusHeading } from "@/components/status/FocusHeading";
import { StatusLinks } from "@/components/status/StatusLinks";

const HEADING = "font-read text-display leading-tight break-words text-ink-1 outline-none";

/**
 * The one answer `/b/<token>` gives for a link that does not work, and for anyone who is not a
 * teacher. It takes only the sentence, so it cannot say which.
 */
export function UnusableLink({ sentence }: { sentence: string }) {
  return (
    <section aria-labelledby="free-access-unusable" className="flex flex-col gap-4">
      <FocusHeading id="free-access-unusable" className={HEADING}>
        {sentence}
      </FocusHeading>
      <StatusLinks />
    </section>
  );
}
