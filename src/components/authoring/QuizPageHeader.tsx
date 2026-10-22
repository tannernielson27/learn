import Link from "next/link";
import { PracticeBadge } from "@/components/practice/PracticeBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StartLiveButton } from "./StartLiveButton";

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
}

/**
 * The quiz page's head (Quiz mockup): the way back, the quiz's name, and its three ways of being
 * used, with Start a live session as the one primary. Pacing stays one choice away, under them.
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
}: QuizPageHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      {crumbs}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <h1 className="min-w-0 font-read text-display break-words text-ink-1">{heading}</h1>
          {summary ? <p className="text-ink-2">{summary}</p> : null}
          <PracticeBadge classNames={sharedWith} />
        </div>
        <form action={start} className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <a href={practiceHref} className={buttonClasses()}>
              Share for practice
            </a>
            {/* #207: the same quiz, given to a class to take at home. */}
            <Link href={assignHref} className={buttonClasses()}>
              Assign
            </Link>
            <StartLiveButton variant="primary" label="Start a live session" />
          </div>
          {/* #185: how the live session is paced. Teacher-paced is the default and comes first. */}
          <fieldset className="flex flex-wrap items-center gap-x-4">
            <legend className="sr-only">Pacing</legend>
            <label className="tap-target inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
              <input
                type="radio"
                name="pacing"
                value="instructor_paced"
                defaultChecked
                className="size-5 accent-accent"
              />
              Teacher-paced
            </label>
            <label className="tap-target inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
              <input
                type="radio"
                name="pacing"
                value="student_paced"
                className="size-5 accent-accent"
              />
              Student-paced
            </label>
          </fieldset>
        </form>
      </div>
      {liveRefusal ? (
        <Notice role="alert" className="mt-2">
          {liveRefusal}
        </Notice>
      ) : null}
    </header>
  );
}
