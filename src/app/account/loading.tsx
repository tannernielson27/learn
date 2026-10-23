import { AuthFrame } from "@/components/auth/AuthFrame";
import { Skeleton, SkeletonLine, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The account page, and the password page under it, in outline while the signed-in person is
 * read: the form's column with still blocks the size of the heading, subline, field and button
 * (nothing loops, design doc §5). Neither page calls `notFound()`, so streaming costs no 404
 * (`src/app/loadingBoundaries.test.ts`); a signed-out visitor is still sent to sign in, by a
 * client-side redirect once this has streamed (docs: file-conventions/loading, "Status Codes").
 */
export default function AccountLoading() {
  return (
    <AuthFrame>
      <SkeletonScreen label="Loading your account">
        <SkeletonLine still lineClassName="mb-2 h-12 w-3/4" className="h-9 w-full" />
        <SkeletonLine still lineClassName="mb-8 h-6 w-2/3" className="h-4 w-full" />
        <div className="flex flex-col gap-1.5">
          <SkeletonLine still lineClassName="h-5 w-24" className="h-3.5 w-full" />
          <Skeleton still className="h-13 w-full" />
        </div>
        <Skeleton still className="mt-5 h-(--button-height-lg) w-full" />
      </SkeletonScreen>
    </AuthFrame>
  );
}
