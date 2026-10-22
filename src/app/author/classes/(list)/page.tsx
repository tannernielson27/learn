import type { Metadata } from "next";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { ClassList } from "@/components/classes/ClassList";
import { ClassNameForm } from "@/components/classes/ClassNameForm";
import { Notice } from "@/components/ui/Notice";
import { requireAuthor } from "@/lib/authoring/session";
import { CLASSES_PATH } from "@/lib/classes/classes";
import { listClasses } from "@/lib/supabase/classes";
import { createClass } from "../actions";

export const metadata: Metadata = { title: "Classes" };

/**
 * The org's classes (#205). Row level security keeps the list to the author's org.
 *
 * In the `(list)` route group so that its `loading.tsx` covers this page only: a loading state
 * starts the response streaming, and `[classId]`'s `notFound()` must still answer 404.
 */
export default async function ClassesPage() {
  const { supabase } = await requireAuthor(CLASSES_PATH);
  const classes = await listClasses(supabase);

  return (
    <ReadingWidth>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Classes</h1>
      {classes === null ? (
        <Notice role="alert">
          The class list could not be loaded. Reload the page to try again.
        </Notice>
      ) : (
        <ClassList
          classes={classes}
          emptyAction={{ href: "#new-class-heading", label: "New class" }}
        />
      )}
      <section aria-labelledby="new-class-heading" className="mt-10 border-t border-line pt-6">
        <h2 id="new-class-heading" className="mb-3 text-lg font-medium text-ink-1">
          New class
        </h2>
        <ClassNameForm action={createClass} />
      </section>
    </ReadingWidth>
  );
}
