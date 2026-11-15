import { Skeleton, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The account page, and the password page under it, in outline: the form's column with still
 * blocks the size of the heading, subline, field and button (nothing loops, design doc §5), and
 * the page's h1 for a screen reader. Drawn inside `AuthFrame` by `src/app/account/loading.tsx`, and by `/gallery/states`.
 */
export function AccountSkeleton() {
  return (
    <SkeletonScreen label="Loading your account">
      {/* A real h1 in the heading's line box, named for the page, so the screen keeps its one
          heading (axe `page-has-heading-one`) and nothing shifts when the form arrives. */}
      <h1 className="mb-2 flex h-12 w-3/4 items-center">
        <span className="sr-only">Your account</span>
        <Skeleton still className="h-9 w-full" />
      </h1>
      <SkeletonLine still lineClassName="mb-8 h-6 w-2/3" className="h-4 w-full" />
      <div className="flex flex-col gap-1.5">
        <SkeletonLine still lineClassName="h-5 w-24" className="h-3.5 w-full" />
        <Skeleton still className="h-13 w-full" />
      </div>
      <Skeleton still className="mt-5 h-(--button-height-lg) w-full" />
    </SkeletonScreen>
  );
}
