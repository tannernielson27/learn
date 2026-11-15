import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK_CLASSES } from "@/components/ui/AppShell";

/**
 * The page around a root status screen (not found, the root and global error pages), which no
 * AppShell frames: the LeaRN wordmark home, then the panel, on the sign-in form's column and rhythm
 * (Main mockup: wordmark, a 48px gap, the serif heading).
 *
 * `landmark={false}` draws the same frame as a `div`, for the gallery (`/gallery/states`), whose
 * own layout already holds the page's one main.
 */
export function StatusFrame({
  children,
  landmark = true,
}: {
  children: ReactNode;
  landmark?: boolean;
}) {
  const Main = landmark ? "main" : "div";
  return (
    <Main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-12 px-5 py-14">
      <p>
        <Link href="/" className={WORDMARK_CLASSES}>
          LeaRN
        </Link>
      </p>
      {children}
    </Main>
  );
}
