import { SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

const MEMBER_ROWS = 2;

/**
 * The workspace page in outline while it loads: the label and name, the Teachers list as ruled
 * rows (name, email, then role and joined date), and the start of the invite section. Each line
 * keeps the real text's line height, so the page lands without a shift.
 *
 * A leaf with no `notFound()`, so streaming costs no status code; see ../sessions/loading.tsx.
 */
export default function WorkspaceLoading() {
  return (
    <SkeletonScreen label="Loading the workspace">
      <SkeletonLine lineClassName="mb-1 h-5" className="h-3.5 w-24" />
      <SkeletonLine lineClassName="mb-8 h-[2.7rem]" className="h-8 w-64 max-w-full" />

      <div className="mb-10">
        <SkeletonLine lineClassName="mb-3 h-7" className="h-5 w-24" />
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {Array.from({ length: MEMBER_ROWS }, (_, row) => (
            <div key={row} className="flex flex-col px-2 py-3">
              <SkeletonLine lineClassName="h-[1.6rem]" className="h-4 w-40" />
              <SkeletonLine lineClassName="h-5" className="h-3.5 w-52 max-w-full" />
              <SkeletonLine lineClassName="h-5" className="h-3.5 w-36" />
            </div>
          ))}
        </div>
      </div>

      <SkeletonLine lineClassName="mb-2 h-7" className="h-5 w-44" />
      <SkeletonLine lineClassName="h-[1.6rem]" className="h-4 w-full max-w-prose" />
    </SkeletonScreen>
  );
}
