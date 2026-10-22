import { Skeleton, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

const ROWS = 3;

function Rows() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: ROWS }, (_, row) => (
        <div
          key={row}
          className="flex min-h-16 flex-col justify-center gap-1 rounded-md border border-line px-4 py-3"
        >
          <SkeletonLine still lineClassName="h-6 w-3/5" className="h-4 w-full" />
          <SkeletonLine still lineClassName="h-5 w-2/5" className="h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
}

function Heading() {
  return <SkeletonLine still lineClassName="mb-3 h-7 w-32" className="h-5 w-full" />;
}

/**
 * The student home in outline while it loads: the real h1, then the pick-up card and the lists
 * as quiet ruled shapes of their own size, in the page's own columns. The blocks hold still:
 * nothing loops (design doc §5).
 *
 * In the `(home)` route group so that it wraps the home alone. At `/learn` it would wrap the
 * assignment and practice pages too, whose `notFound()` would then answer 200 once this streamed
 * (docs: file-conventions/loading, "Status Codes"; `src/app/loadingBoundaries.test.ts`).
 */
export default function StudentHomeLoading() {
  return (
    <SkeletonScreen label="Loading your classes">
      <div className="mb-8 flex flex-col gap-2">
        {/* The page's own h1, word for word: static text, so the loading screen keeps its heading. */}
        <h1 className="font-read text-display leading-tight text-ink-1">Your classes</h1>
        <SkeletonLine still lineClassName="h-6 w-48" className="h-4 w-full" />
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-10">
          <div className="flex flex-col gap-3 rounded-md border border-line-field p-4 sm:p-5">
            <SkeletonLine still lineClassName="h-4 w-40" className="h-3 w-full" />
            <SkeletonLine still lineClassName="h-7 w-4/5" className="h-5 w-full" />
            <SkeletonLine still lineClassName="h-5 w-1/2" className="h-3.5 w-full" />
            <Skeleton still className="h-(--button-height-md) w-full sm:w-32" />
          </div>
          <div>
            <Heading />
            <Rows />
          </div>
          <div>
            <Heading />
            <Rows />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-10">
          <div>
            <Heading />
            <div className="flex flex-col divide-y divide-line border-y border-line">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex flex-col gap-1.5 px-2 py-3">
                  <SkeletonLine still lineClassName="h-6 w-1/2" className="h-4 w-full" />
                  <Skeleton still className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
