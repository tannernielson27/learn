import { screen, waitFor } from "@testing-library/react";

/**
 * Resolves once a submitted answer's feedback is on the page. The reveal is a transition since #55:
 * Submit's "Checking your answer" commits first and the feedback follows, so a test that presses
 * Submit waits for it here instead of reading the page straight after the click. Submit stays busy
 * until the reveal commits, so "no busy Submit and a score panel" means this submit's reveal, not
 * one left on the page from an earlier step.
 */
export async function feedbackShown(): Promise<void> {
  await waitFor(
    () => {
      if (screen.queryByRole("button", { name: "Checking your answer" })) {
        throw new Error("The answer is still being checked.");
      }
      if (screen.queryAllByRole("complementary", { name: "Score" }).length === 0) {
        throw new Error("No feedback on the page yet.");
      }
    },
    // A ceiling, not a delay, as in `renderersLoaded`: under a full parallel run the reveal can
    // outlast waitFor's 1s default.
    { timeout: 10_000 },
  );
}
