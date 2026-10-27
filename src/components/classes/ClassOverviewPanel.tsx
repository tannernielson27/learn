import { LocalTime } from "@/components/assignments/LocalTime";
import { TextLink } from "@/components/ui/TextLink";
import { assignmentReportPath, STATE_LABEL } from "@/lib/assignments/assignments";
import type { ClassOverview } from "@/lib/classes/classOverview";
import { classTabPath } from "@/lib/classes/classTabs";
import { InviteQrCode } from "./InviteLinkPanel";

export interface ClassOverviewPanelProps {
  classId: string;
  classTitle: string;
  url: string;
  overview: ClassOverview;
}

const HEADING = "text-lg font-medium text-ink-1";
/** An en dash: the mark for a number that could not be read. */
const UNKNOWN = "–";
const NOT_LOADED = "Could not be loaded. Reload the page to try again.";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:px-4 sm:first:pl-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-mono text-2xl text-ink-1 tabular-nums">{value}</dd>
      {detail ? <dd className="text-sm text-ink-2">{detail}</dd> : null}
    </div>
  );
}

/**
 * A class at a glance (the class page's first tab): its numbers, the assignment a teacher most
 * likely wants, who joined last, and the QR code to put on the projector. Everything here comes
 * from what the page already read; the other tabs hold the full lists and every control.
 */
export function ClassOverviewPanel({
  classId,
  classTitle,
  url,
  overview,
}: ClassOverviewPanelProps) {
  const { students, assignments, practice, focus, recentJoins } = overview;
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-10">
        <section aria-labelledby="glance-heading" className="flex flex-col gap-3">
          <h2 id="glance-heading" className={HEADING}>
            At a glance
          </h2>
          <dl className="grid divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Stat
              label="Students"
              value={students === null ? UNKNOWN : String(students)}
              detail={students === null ? NOT_LOADED : undefined}
            />
            <Stat
              label="Open assignments"
              value={assignments === null ? UNKNOWN : String(assignments.open)}
              detail={
                assignments === null
                  ? NOT_LOADED
                  : `${assignments.scheduled} not yet open · ${assignments.closed} closed`
              }
            />
            <Stat
              label="Shared for practice"
              value={practice === null ? UNKNOWN : String(practice)}
              detail={practice === null ? NOT_LOADED : practice === 1 ? "quiz" : "quizzes"}
            />
          </dl>
        </section>

        <section aria-labelledby="next-heading" className="flex flex-col gap-3">
          <h2 id="next-heading" className={HEADING}>
            {focus?.state === "scheduled" ? "Next to open" : "Open now"}
          </h2>
          {focus ? (
            <div className="flex flex-col gap-2 border-y border-line px-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0 font-medium break-words text-ink-1">
                  {focus.assignment.title}
                </span>
                <span
                  className={`rounded-sm border px-2 text-sm ${
                    focus.state === "open"
                      ? "border-accent text-accent-ink"
                      : "border-line text-ink-2"
                  }`}
                >
                  {STATE_LABEL[focus.state]}
                </span>
              </div>
              <p className="text-sm text-ink-2">
                {focus.state === "open" ? "Closes " : "Opens "}
                <span className="text-ink-1">
                  <LocalTime
                    iso={
                      focus.state === "open" ? focus.assignment.closesAt : focus.assignment.opensAt
                    }
                  />
                </span>
              </p>
              {focus.state === "open" ? (
                <TextLink
                  href={assignmentReportPath(focus.assignment.id)}
                  size="sm"
                  aria-label={`View progress for ${focus.assignment.title}`}
                  className="self-start"
                >
                  View progress
                </TextLink>
              ) : null}
            </div>
          ) : (
            <p className="text-ink-2">
              {assignments === null ? NOT_LOADED : "Nothing is open or waiting to open."}
            </p>
          )}
          <TextLink href={classTabPath(classId, "assignments")} size="sm" className="self-start">
            All assignments
          </TextLink>
        </section>

        <section aria-labelledby="joined-heading" className="flex flex-col gap-3">
          <h2 id="joined-heading" className={HEADING}>
            Recently joined
          </h2>
          {recentJoins.length > 0 ? (
            <ul
              aria-label="Recently joined"
              className="flex flex-col divide-y divide-line border-y border-line"
            >
              {recentJoins.map((entry) => (
                <li
                  key={entry.profileId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3"
                >
                  <span className="min-w-0 truncate text-ink-1">
                    {entry.displayName ?? entry.email}
                  </span>
                  <span className="text-sm text-ink-2">
                    <LocalTime iso={entry.joinedAt} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">
              {students === null
                ? NOT_LOADED
                : "No students yet. Share the class code or the invite link."}
            </p>
          )}
          <TextLink href={classTabPath(classId, "students")} size="sm" className="self-start">
            All students
          </TextLink>
        </section>
      </div>

      <section aria-labelledby="invite-heading" className="flex min-w-0 flex-col gap-4">
        <h2 id="invite-heading" className={HEADING}>
          Invite students
        </h2>
        <InviteQrCode url={url} classTitle={classTitle} className="w-56 max-w-full sm:w-64" />
        <TextLink href={classTabPath(classId, "settings")} size="sm" className="self-start">
          Replace the link in Settings
        </TextLink>
      </section>
    </div>
  );
}
