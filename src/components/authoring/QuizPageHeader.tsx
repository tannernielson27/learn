import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Popover } from "@/components/ui/Popover";
import { LiveClassSelect } from "./LiveClassSelect";
import { StartLiveButton } from "./StartLiveButton";

/** The live session options' panel, and the name of the button that opens it. */
export const LIVE_OPTIONS_ID = "live-session-options";
export const LIVE_OPTIONS_LABEL = "Live session options";

export interface QuizPageHeaderProps {
  /** The breadcrumbs, drawn above the heading. */
  crumbs: React.ReactNode;
  heading: string;
  /** The classes the quiz is shared with for practice, for the badge under the heading. */
  sharedWith: readonly string[];
  /** "12 questions · 2 case studies", when the whole quiz is listed; null in a narrowed view. */
  summary: string | null;
  /** Starts a live session of this quiz (`startLiveSession` bound to it). */
  start: (formData: FormData) => Promise<void>;
  /** Where Assign goes. */
  assignHref: string;
  /** Where Share for practice goes: the page's own Practice section. */
  practiceHref: string;
  /** Why the last Start was refused, carried back on the query string. */
  liveRefusal?: string;
  /** The teacher's classes, for "For a class" (ADR 0013); null or empty leaves it out. */
  classes?: readonly { id: string; name: string }[] | null;
}

const RADIO_ROW =
  "tap-target inline-flex cursor-pointer items-center gap-2 rounded-md px-1 text-base text-ink-1";

/**
 * The quiz page's head (#563): the way back, the quiz's name on `PageHeader`, and its three ways
 * of being used, with Start a live session as the one primary.
 *
 * How the live session runs (its pacing, and a class) is one press away, in a labelled panel
 * beside Start: a fieldset with a legend, closed when the page opens, and holding the defaults
 * (teacher-paced, no class) until the teacher changes them. The panel's controls belong to the
 * start form while it is closed, so Start always sends them; nothing is remembered between visits.
 */
export function QuizPageHeader({
  crumbs,
  heading,
  sharedWith,
  summary,
  start,
  assignHref,
  practiceHref,
  liveRefusal,
  classes = null,
}: QuizPageHeaderProps) {
  const badge = <PracticeBadge classNames={sharedWith} />;
  const lead =
    summary || sharedWith.length > 0 ? (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-base">
        {summary ? <span>{summary}</span> : null}
        {badge}
      </span>
    ) : undefined;

  const actions = (
    <form action={start} className="flex flex-wrap items-center gap-2">
      <a href={practiceHref} className={buttonClasses()}>
        Share for practice
      </a>
      {/* #207: the same quiz, given to a class to take at home. */}
      <Link href={assignHref} className={buttonClasses()}>
        Assign
      </Link>
      <span className="flex items-center gap-1">
        <StartLiveButton variant="primary" label="Start a live session" />
        <Popover
          id={LIVE_OPTIONS_ID}
          accessibleName={LIVE_OPTIONS_LABEL}
          buttonClassName={buttonClasses({ variant: "ghost", size: "sm" })}
          label={
            <>
              Options
              <Icon icon={ChevronDown} />
            </>
          }
        >
          <fieldset className="flex min-w-0 flex-col gap-4">
            <legend className="mb-3 font-semibold text-ink-1">{LIVE_OPTIONS_LABEL}</legend>
            {/* #185: how the live session is paced. Teacher-paced is the default and comes first. */}
            <fieldset className="flex flex-col">
              <legend className="mb-1 text-sm font-medium text-ink-1">Pacing</legend>
              <label className={RADIO_ROW}>
                <input
                  type="radio"
                  name="pacing"
                  value="instructor_paced"
                  defaultChecked
                  className="size-5 accent-accent"
                />
                Teacher-paced
              </label>
              <label className={RADIO_ROW}>
                <input
                  type="radio"
                  name="pacing"
                  value="student_paced"
                  className="size-5 accent-accent"
                />
                Student-paced
              </label>
            </fieldset>
            {/* ADR 0013: a live session for a class. No class is the default and comes first. */}
            <LiveClassSelect id="live-class" classes={classes} />
          </fieldset>
          <button
            type="button"
            popoverTarget={LIVE_OPTIONS_ID}
            popoverTargetAction="hide"
            className={`${buttonClasses({ size: "sm" })} mt-4`}
          >
            Done
          </button>
        </Popover>
      </span>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      {crumbs}
      <PageHeader title={heading} lead={lead} action={actions} />
      {liveRefusal ? (
        <Notice role="alert" className="mt-2">
          {liveRefusal}
        </Notice>
      ) : null}
    </div>
  );
}
