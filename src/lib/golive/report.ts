/** Prints `pnpm golive:check`'s lines (#237). Plain text, no colour, so it pastes into a PR. */
import type { CheckResult, CheckStatus } from "./types.ts";

const LABEL: Record<CheckStatus, string> = { pass: "PASS  ", fail: "FAIL  ", manual: "MANUAL" };

export function formatReport(results: readonly CheckResult[]): string {
  const lines = results.map(
    (result) => `${LABEL[result.status]}  ${result.title}\n        ${result.detail}`,
  );
  const count = (status: CheckStatus) => results.filter((r) => r.status === status).length;
  const summary = `${count("pass")} pass, ${count("fail")} fail, ${count("manual")} manual`;
  const verdict =
    count("fail") === 0
      ? "Every automated check passes. Work through the MANUAL lines before inviting students."
      : "Not ready: fix each FAIL line using the docs/05 step it names, then run this again.";
  return [...lines, "", summary, verdict].join("\n");
}

/** Non-zero when any automated check fails; manual lines alone do not fail the run. */
export function exitCode(results: readonly CheckResult[]): number {
  return results.some((result) => result.status === "fail") ? 1 : 0;
}
