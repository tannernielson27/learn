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
}

/**
 * The top of every class page, above its tabs: the class's name and size, and what a teacher
 * reaches for in front of a room, the class code and the invite link, each one tap from the
 * clipboard. Beside the name from 1024px; under it below that.
 *
 * On a phone it stays short enough that the tabs and the start of the open tab are on the first
 * screen: each copy button sits beside what it copies rather than under it, and the box loses its
 * frame. From 1024px the box keeps 18rem for the name, so a narrow main column never squeezes the
 * name to a letter a line.
 */
export function ClassHeader({ name, studentCount, url, code }: ClassHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
      <div className="flex min-w-0 flex-col gap-2 lg:flex-1">
        <p className="eyebrow">Class</p>
        {/* The way back to every class is the layout's navigation (#412). */}
        <h1 className="font-read text-display leading-tight break-words text-ink-1">{name}</h1>
        {studentCount === null ? null : (
          <p className="text-ink-2">{studentCountLabel(studentCount)}</p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:gap-6 sm:rounded-md sm:border sm:bg-surface-1 sm:p-4 lg:w-[40rem] lg:max-w-[calc(100%-18rem)] lg:shrink-0">
        <div className="sm:shrink-0">
          <ClassCodeBlock code={code} labelAs="p" />
        </div>
        <div className="min-w-0 flex-1 sm:basis-56">
          <InviteLinkField url={url} />
        </div>
      </div>
    </header>
  );
}
