import { ReadingWidth } from "@/components/authoring/PageWidth";
import { Skeleton, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

const MEMBER_ROWS = 2;

/**
 * The workspace page in outline while it loads: the label and name, the Teachers list as ruled
 * rows (name, email, then role and joined date), and the start of the invite section, as still
 * blocks (nothing loops, docs/04 §5). Each line
 * keeps the real text's line height, so the page lands without a shift.
 *
 * A leaf with no `notFound()`, so streaming costs no status code; see ../sessions/loading.tsx.
 */
export default function WorkspaceLoading() {
  return (
    // The page's reading column, so the page lands where its outline stood.
    <ReadingWidth>
      <SkeletonScreen label="Loading the workspace">
        <SkeletonLine still lineClassName="mb-1 h-5" className="h-3.5 w-24" />
        {/* The page's h1 is the workspace's name, not known yet. A real h1 named for the page, in
          the title's line box (`PageHeader`'s `.display-section`), so the screen keeps its one
          heading and nothing shifts. */}
        <h1 className="mb-8 flex h-[1.1em] items-center text-section">
          <span className="sr-only">Workspace</span>
          <Skeleton still className="h-[0.75em] w-64 max-w-full" />
        </h1>

        <div className="mb-10">
          <SkeletonLine still lineClassName="mb-3 h-7" className="h-5 w-24" />
          <div className="flex flex-col divide-y divide-line border-y border-line">
            {Array.from({ length: MEMBER_ROWS }, (_, row) => (
              <div key={row} className="flex flex-col px-2 py-3">
                <SkeletonLine still lineClassName="h-[1.6rem]" className="h-4 w-40" />
                <SkeletonLine still lineClassName="h-5" className="h-3.5 w-52 max-w-full" />
                <SkeletonLine still lineClassName="h-5" className="h-3.5 w-36" />
              </div>
            ))}
          </div>
        </div>

        <SkeletonLine still lineClassName="mb-2 h-7" className="h-5 w-44" />
        <SkeletonLine still lineClassName="h-[1.6rem]" className="h-4 w-full max-w-prose" />
      </SkeletonScreen>
    </ReadingWidth>
  );
}
