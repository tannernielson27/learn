import { describe, expect, it } from "vitest";
import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema, type Item } from "@/lib/ngn/schemas";
import { createFakeRoom, type FakeRoom } from "./testing/supabaseRoom";

/**
 * A case study run live (#184), on the bytes a phone actually receives.
 *
 * #46 put one rule on a case study played by a student: a step's key arrives with that step and
 * no sooner, so the keys for steps the student has not reached are never loaded at all. A room
 * running the six steps together must keep the same rule. `createFakeRoom` stands up the real
 * route handlers and the real participant transport over an in-process Postgres and Realtime, so
 * what is read below is every HTTP body and every channel payload the phone was handed.
 */

const STEPS: readonly Item[] = caseStudySchema.parse(sampleCaseStudy).items;

/** The strings only a key, a rationale or a scoring rule of `step` would put on the wire. */
function secretsOf(step: Item): string[] {
  const secrets = [JSON.stringify(step.answerKey)];
  if (step.rationale.general) secrets.push(step.rationale.general.value);
  for (const text of Object.values(step.rationale.perElement ?? {})) secrets.push(text.value);
  return secrets.map((secret) => (secret.startsWith("{") ? secret : JSON.stringify(secret)));
}

/** Everything the phone was handed from `from` on, as the bytes it was handed them in. */
function wireSince(live: FakeRoom, from: number): string {
  return live.stack.wire
    .slice(from)
    .map((entry) => entry.body)
    .join("\n");
}

/**
 * A JSON string as it sits inside a larger JSON body: without its quotes, so the check does not
 * depend on where in the payload the value lands. Object-valued secrets are matched whole.
 */
function asWireFragment(secret: string): string {
  return secret.startsWith('"') ? secret.slice(1, -1) : secret;
}

function expectNoneOf(bytes: string, steps: readonly Item[]) {
  for (const step of steps) {
    for (const secret of secretsOf(step)) expect(bytes).not.toContain(asWireFragment(secret));
  }
}

describe("a case study run live, on the participant's wire (#184)", () => {
  it("carries no step's key before that step is revealed, and only that step's after", async () => {
    const live = createFakeRoom({
      items: STEPS,
      code: "CASE84",
      sessionId: "00000000-0000-0000-0000-000000000184",
    });
    const host = live.host();
    await host.open();

    const ada = live.participant();
    await ada.join(live.code, { displayName: "Ada" });
    await host.start();
    await live.settle();

    let seen = 0;
    for (const [index, step] of STEPS.entries()) {
      if (index > 0) {
        await host.advance();
        await live.settle();
      }

      // Before the reveal: this step arrived, and no step's key, rationale or scoring did —
      // not this one's, and not any step's still to come.
      const before = wireSince(live, seen);
      expect(before).toContain(step.id);
      expect(before).not.toContain('"answerKey"');
      expectNoneOf(before, STEPS);
      seen = live.stack.wire.length;

      await host.reveal();
      await live.settle();

      // The control: at the reveal the key and the rationale do arrive, so the checks above are
      // not passing for want of a payload. Only this step's — never a later one's.
      const after = wireSince(live, seen);
      expect(after).toContain('"answerKey"');
      for (const secret of secretsOf(step)) expect(after).toContain(asWireFragment(secret));
      expectNoneOf(after, STEPS.slice(index + 1));
      seen = live.stack.wire.length;
    }
  });
});
