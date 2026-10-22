import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

const ROWS = 4;

/**
 * The Classes list in outline while it loads: the real heading, then ruled rows the height of a
 * class's row (its name, then the student count, which wraps under it at 375px). Each line keeps
 * the real text's line height, so the list lands without a shift.
 *
 * In the `(list)` route group with its page, so it covers /author/classes only. A `loading.tsx`
 * starts the response streaming, after which a page's `notFound()` can no longer answer 404;
 * this page has none, and /author/classes/[classId], which has, sits outside the group and keeps
 * its status code (docs: file-conventions/loading, "Status Codes"; docs/ui-polish-log.md row 6).
 */
export default function ClassesLoading() {
  return (
    <ReadingWidth>
      <SkeletonScreen label="Loading classes">
        {/* The page's own h1, word for word and class for class, so the screen keeps its one
            heading and it does not move when the list arrives. */}
        <h1 className="mb-6 font-read text-3xl text-ink-1">Classes</h1>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {Array.from({ length: ROWS }, (_, row) => (
            <div
              key={row}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 py-3"
            >
              <SkeletonLine lineClassName="h-[1.6rem] w-1/2 sm:w-2/5" className="h-4 w-full" />
              <SkeletonLine lineClassName="h-5 w-20" className="h-3.5 w-full" />
            </div>
          ))}
        </div>
      </SkeletonScreen>
    </ReadingWidth>
  );
}
