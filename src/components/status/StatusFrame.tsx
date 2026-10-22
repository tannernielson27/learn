import Link from "next/link";
import type { ReactNode } from "react";
import { WORDMARK_CLASSES } from "@/components/ui/AppShell";

/**
 * The page around a root status screen (not found, the root and global error pages), which no
 * AppShell frames: the LeaRN wordmark home, then the panel, on the sign-in form's column and rhythm
 * (Main mockup: wordmark, a 48px gap, the serif heading).
 */
export function StatusFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-12 px-5 py-14">
      <p>
        <Link href="/" className={WORDMARK_CLASSES}>
          LeaRN
        </Link>
      </p>
      {children}
    </main>
  );
}
