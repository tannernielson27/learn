import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { studentCountLabel } from "@/lib/classes/classOverview";
import { ClassCodeBlock, InviteLinkField } from "./InviteLinkPanel";

export interface ClassHeaderProps {
  name: string;
  /** How many have joined, or null when the roster could not be read. */
  studentCount: number | null;
  /** The absolute invite URL. */
  url: string;
  /** The class's join code as stored (#356). */
  code: string;
  /** Where "Start a live session" goes: a quiz is chosen there, with this class already set. */
  startHref?: string;
}

/**
 * The top of every class page, above its tabs (#563): the class's name on `PageHeader`, its size
 * as the lead and "Start a live session" as the main action; then what a teacher reaches for in
 * front of a room, the class code and the invite link, each one tap from the clipboard.
 *
 * The two ways in are quiet: no card, one line above them, the code in the mono at a reading size,
 * and from 640px side by side, the link taking the row's width. The link wraps in its box, so the
 * whole of it shows at any width (#563).
 */
export function ClassHeader({ name, studentCount, url, code, startHref }: ClassHeaderProps) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      {/* The way back to every class is the layout's navigation (#412). */}
      <PageHeader
        title={name}
        lead={studentCount === null ? undefined : studentCountLabel(studentCount)}
        action={
          startHref ? (
            <Link href={startHref} className={buttonClasses({ variant: "primary" })}>
              Start a live session
            </Link>
          ) : undefined
        }
      />
      {/* Two blocks that lay themselves out: the code at its own width, the link taking the rest. */}
      <div className="grid max-w-3xl gap-5 border-t border-line pt-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-10">
        <ClassCodeBlock code={code} labelAs="p" />
        <InviteLinkField url={url} />
      </div>
    </div>
  );
}
