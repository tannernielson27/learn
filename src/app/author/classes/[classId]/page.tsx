import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassNameForm } from "@/components/classes/ClassNameForm";
import { ClassRoster } from "@/components/classes/ClassRoster";
import { InviteLinkPanel } from "@/components/classes/InviteLinkPanel";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { classPath, CLASSES_PATH, inviteUrl } from "@/lib/classes/classes";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { classRoster, readClass } from "@/lib/supabase/classes";
import { removeStudent, renameClass, rotateInvite } from "../actions";

export const metadata: Metadata = { title: "Class" };

/** One class: its name, its invite link and QR code, and its roster (#205). */
export default async function ClassPage({ params }: PageProps<"/author/classes/[classId]">) {
  const { classId } = await params;
  const { supabase } = await requireAuthor(classPath(classId));
  if (!isUuid(classId)) notFound();

  const detail = await readClass(supabase, classId);
  if (!detail) notFound();
  const roster = await classRoster(supabase, classId);
  const url = inviteUrl(canonicalSiteOrigin(await headers()), detail.inviteToken);

  return (
    <>
      <Link
        href={CLASSES_PATH}
        className="tap-target mb-4 inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
      >
        All classes
      </Link>
      <h1 className="mb-6 font-read text-3xl break-words text-ink-1">{detail.name}</h1>

      <section aria-labelledby="invite-heading" className="mb-10">
        <h2 id="invite-heading" className="mb-2 text-lg font-medium text-ink-1">
          Invite students
        </h2>
        <p className="mb-4 max-w-prose text-ink-2">
          Anyone with this link can join the class as a student with their email address. Share it
          with your class only.
        </p>
        <InviteLinkPanel
          url={url}
          classTitle={detail.name}
          rotateAction={rotateInvite.bind(null, detail.id)}
        />
      </section>

      <section aria-labelledby="roster-heading" className="mb-10">
        <h2 id="roster-heading" className="mb-3 text-lg font-medium text-ink-1">
          Roster
        </h2>
        {roster === null ? (
          <p role="alert" className="text-ink-2">
            The roster could not be loaded. Reload the page to try again.
          </p>
        ) : (
          <ClassRoster
            entries={roster}
            removeActionFor={(profileId) => removeStudent.bind(null, detail.id, profileId)}
          />
        )}
      </section>

      <section aria-labelledby="rename-heading" className="border-t border-line pt-6">
        <h2 id="rename-heading" className="mb-3 text-lg font-medium text-ink-1">
          Rename
        </h2>
        <ClassNameForm
          action={renameClass.bind(null, detail.id)}
          initialName={detail.name}
          submitLabel="Rename class"
        />
      </section>
    </>
  );
}
