import { AccountSkeleton } from "@/components/auth/AccountSkeleton";
import { AuthFrame } from "@/components/auth/AuthFrame";

/**
 * The account page, and the password page under it, in outline while the signed-in person is
 * read (`AccountSkeleton`). Neither page calls `notFound()`, so streaming costs no 404
 * (`src/app/loadingBoundaries.test.ts`); a signed-out visitor is still sent to sign in, by a
 * client-side redirect once this has streamed (docs: file-conventions/loading, "Status Codes").
 */
export default function AccountLoading() {
  return (
    <AuthFrame>
      <AccountSkeleton />
    </AuthFrame>
  );
}
