import type { Metadata } from "next";
import { ClassList } from "@/components/classes/ClassList";
import { ClassNameForm } from "@/components/classes/ClassNameForm";
import { requireAuthor } from "@/lib/authoring/session";
import { CLASSES_PATH } from "@/lib/classes/classes";
import { listClasses } from "@/lib/supabase/classes";
import { createClass } from "./actions";

export const metadata: Metadata = { title: "Classes" };

/** The org's classes (#205). Row level security keeps the list to the author's org. */
export default async function ClassesPage() {
  const { supabase } = await requireAuthor(CLASSES_PATH);
  const classes = await listClasses(supabase);

  return (
    <>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Classes</h1>
      {classes === null ? (
        <p role="alert" className="text-ink-2">
          The class list could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <ClassList classes={classes} />
      )}
      <section aria-labelledby="new-class-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="new-class-heading" className="mb-3 text-lg font-medium text-ink-1">
          New class
        </h2>
        <ClassNameForm action={createClass} />
      </section>
    </>
  );
}
