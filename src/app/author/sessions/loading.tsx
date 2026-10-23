import { ReadingWidth } from "@/components/authoring/PageWidth";
import { SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

const ROWS = 5;

/**
 * The Live sessions list in outline while it loads: the real heading, then ruled rows the height of a
 * session's row (title, then date, count and status, which wrap under it at 375px). Each line
 * keeps the real text's line height, so the list lands without a shift.
 *
 * Only this leaf has a loading state. A `loading.tsx` starts the response streaming, after which
 * a page's `notFound()` can no longer answer 404; this page has none and no child routes, so
 * nothing here loses a status code. `requireAuthor` sending a student on still works, as a
 * client-side redirect (docs: file-conventions/loading, "Status Codes").
 */
export default function SessionsLoading() {
  return (
    // The page's reading column, so the list lands where its outline stood.
    <ReadingWidth>
      <SkeletonScreen label="Loading live sessions">
        {/* The page's own h1, word for word and class for class: static text, so it is drawn rather
          than outlined, and the loading screen keeps its one heading. */}
        <h1 className="mb-6 font-read text-3xl text-ink-1">Live sessions</h1>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {Array.from({ length: ROWS }, (_, row) => (
            <div
              key={row}
              className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 py-3"
            >
              <SkeletonLine lineClassName="h-[1.6rem] w-1/2 sm:w-2/5" className="h-4 w-full" />
              <SkeletonLine lineClassName="h-5 w-56" className="h-3.5 w-full" />
            </div>
          ))}
        </div>
      </SkeletonScreen>
    </ReadingWidth>
  );
}
