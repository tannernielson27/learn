"use client";

import { STUDENT_WELCOME_FINISH } from "@/lib/onboarding/studentWelcome";
import type { WelcomeStep } from "@/lib/onboarding/teacherWelcome";
import { WelcomeDialog } from "./WelcomeDialog";

export interface StudentWelcomeProps {
  /** `studentWelcomeSteps(name, classNames)`, from the page. */
  steps: readonly WelcomeStep[];
  /** `markStudentOnboarded`: records that this account has seen the welcome. */
  onDone: () => Promise<void>;
  /** The id of the student home's heading, which takes focus once the welcome closes. */
  focusAfter: string;
}

/**
 * The welcome a new student sees once on the student home (#365), the first time they are there
 * in a class. It is given only a name, class names and fixed copy. See `WelcomeDialog` for how it
 * ends.
 */
export function StudentWelcome({ steps, onDone, focusAfter }: StudentWelcomeProps) {
  return (
    <WelcomeDialog
      steps={steps}
      finishLabel={STUDENT_WELCOME_FINISH}
      onDone={onDone}
      focusAfter={focusAfter}
    />
  );
}
