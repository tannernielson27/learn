"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { STUDENT_HOME } from "@/lib/classes/classes";

/**
 * How wide each student page may grow, inside the student AppShell (which has no cap of its own).
 * The home is two columns from 1024px (PLAN §6), so it takes the wide column; every other student
 * page keeps the reading column it had, until its own phase widens it here.
 */
export function learnContentWidth(pathname: string | null): "wide" | "reading" {
  return pathname === STUDENT_HOME ? "wide" : "reading";
}

export function LearnContentWidth({ children }: { children: ReactNode }) {
  const width = learnContentWidth(usePathname());
  return (
    <div className={`mx-auto w-full ${width === "wide" ? "max-w-wide" : "max-w-reading"}`}>
      {children}
    </div>
  );
}
