import type { Metadata } from "next";
import { StudentClassList } from "@/components/classes/StudentClassList";
import { requireStudent } from "@/lib/classes/viewer";
import { myClasses } from "@/lib/supabase/classInvites";

export const metadata: Metadata = { title: "Your classes" };

/**
 * The student home (#205): the classes this student belongs to. Minimal on purpose; #207 adds the
 * assignments. Anyone who is not a student is sent to their own home by `requireStudent`.
 */
export default async function StudentHomePage() {
  const { supabase } = await requireStudent();
  const classes = await myClasses(supabase);

  return (
    <>
      <h1 className="mb-6 font-read text-3xl text-ink-1">Your classes</h1>
      {classes === null ? (
        <p role="alert" className="text-ink-2">
          Your classes could not be loaded. Reload the page to try again.
        </p>
      ) : (
        <StudentClassList classes={classes} />
      )}
    </>
  );
}
