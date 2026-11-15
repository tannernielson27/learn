import type { Metadata } from "next";
import { ReadingWidth } from "@/components/authoring/PageWidth";
import { ClassList } from "@/components/classes/ClassList";
import { ClassNameForm } from "@/components/classes/ClassNameForm";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
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

  // One way to make a class (#563): the form is the header's main action, in the first screen at
  // 375px. The empty list's "New class" is a link to it, not a second form.
  const newClass = (
    <section
      aria-labelledby="new-class-heading"
      className="w-[min(26rem,calc(100vw-2*var(--shell-gutter,1rem)))]"
    >
      {/* The label names the field; the heading names the region and is where the link lands. */}
      <h2 id="new-class-heading" className="sr-only">
        New class
      </h2>
      <ClassNameForm action={createClass} inline />
    </section>
  );

  return (
    <ReadingWidth>
      <div className="flex flex-col gap-8">
        <PageHeader title="Classes" action={newClass} />
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
      </div>
    </ReadingWidth>
  );
}
