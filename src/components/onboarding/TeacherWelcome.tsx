"use client";

import { TEACHER_WELCOME_FINISH, type WelcomeStep } from "@/lib/onboarding/teacherWelcome";
import { WelcomeDialog } from "./WelcomeDialog";

export interface TeacherWelcomeProps {
  /** `teacherWelcomeSteps(name)`, from the page. */
  steps: readonly WelcomeStep[];
  /** `markOnboarded`: records that this account has seen the welcome, so it never shows again. */
  onDone: () => Promise<void>;
  /** The id of the Get started heading, which takes focus once the welcome closes. */
  focusAfter: string;
}

/**
 * The welcome a new teacher sees once on the author home (#364). Its last button hands over to the
 * Get started checklist, which then has the focus. See `WelcomeDialog` for how it ends.
 */
export function TeacherWelcome({ steps, onDone, focusAfter }: TeacherWelcomeProps) {
  return (
    <WelcomeDialog
      steps={steps}
      finishLabel={TEACHER_WELCOME_FINISH}
      onDone={onDone}
      focusAfter={focusAfter}
    />
  );
}
