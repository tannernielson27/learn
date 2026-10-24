import { CLASS_PAGE_FIXTURE_CLASS } from "@/lib/classes/classPageFixture";
import { parseClassTab } from "@/lib/classes/classTabs";
import { supportedTimeZones, timeZoneChoices } from "@/lib/classes/timeZone";
import { ClassPageDemo } from "./demo";

/**
 * The teacher's class page (`/author/classes/[classId]`) drawn from `classPageFixture.ts`, with no
 * database behind it, so the screenshot suite covers its layout. `?tab=` picks the tab as it does
 * on the real page; the tabs themselves link to the real page's addresses. Nothing here carries an
 * answer key, and every name is fictional.
 *
 * Opened by URL, not from the gallery nav, as `/gallery/email` is: a nav entry would change the
 * sidebar in every full-page gallery baseline.
 */
export default async function ClassPageGallery({ searchParams }: PageProps<"/gallery/class-page">) {
  const tab = parseClassTab((await searchParams).tab);
  return (
    <article>
      <p className="eyebrow">Composites</p>
      {/* Not a heading: the class name is this page's h1, as it is on the real page. */}
      <p className="mt-2 text-2xl font-semibold">Class page</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        One class with four students, three assignments and a quiz shared for practice. Every form
        answers that it is not available here.
      </p>
      <ClassPageDemo
        tab={tab}
        zones={timeZoneChoices(supportedTimeZones(), CLASS_PAGE_FIXTURE_CLASS.timeZone)}
      />
    </article>
  );
}
