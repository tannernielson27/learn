import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { startClassLiveSession } from "@/app/live/actions";
import { ClassLiveStartForm } from "@/components/classes/progress/ClassLiveStartForm";
import { listBanks } from "@/lib/authoring/banks";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classStartPath } from "@/lib/classes/classes";
import { classTabPath } from "@/lib/classes/classTabs";
import { classLiveStartMessage } from "@/lib/live/liveStart";
import { readClass } from "@/lib/supabase/classes";

export const metadata: Metadata = { title: "Start a live session" };

/**
 * The class header's "Start a live session": the teacher chooses a quiz, and it starts for this
 * class (`startClassLiveSession`, which is the quiz page's start with the class set). A class the
 * teacher cannot see is not-found.
 */
export default async function ClassLiveStartPage({
  params,
  searchParams,
}: PageProps<"/author/classes/[classId]/start">) {
  const { classId } = await params;
  const { supabase } = await requireAuthor(classStartPath(classId));
  if (!isUuid(classId)) notFound();

  const detail = await readClass(supabase, classId);
  if (!detail) notFound();
  const quizzes = await listBanks(supabase).catch(() => null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-2">
        <Link
          href={classTabPath(detail.id, "sessions")}
          className="tap-target inline-flex items-center hover:text-ink-1"
        >
          {`${detail.name}: Live sessions`}
        </Link>
      </p>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Class</p>
        <h1 className="font-read text-display leading-tight break-words text-ink-1">
          Start a live session
        </h1>
      </header>
      <ClassLiveStartForm
        className={detail.name}
        quizzes={quizzes}
        action={startClassLiveSession.bind(null, detail.id)}
        refusal={classLiveStartMessage((await searchParams).live)}
      />
    </div>
  );
}
