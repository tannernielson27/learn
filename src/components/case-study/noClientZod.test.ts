// A student practising a quiz, or working an assignment, never parses anything with zod: what the
// player holds arrives already checked by the server. zod is about 85 kB gzip, so one value import
// of a schema module (even for a constant) puts all of it on the phone. The step constants the
// chart reveal reads live in `ngn/types.ts` for that reason.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

/** The players a student's browser runs outside a live session. */
const STUDENT_ENTRIES = [
  path.join(SRC, "components", "case-study", "CaseStudyPlayer.tsx"),
  path.join(SRC, "components", "practice", "PracticePlayer.tsx"),
  path.join(SRC, "components", "assignments", "AttemptPlayer.tsx"),
  path.join(SRC, "lib", "ngn", "chartReveal.ts"),
];

const zodChains = (entry: string) =>
  packagesIn(reachable(entry))
    .filter(({ specifier }) => specifier === "zod" || specifier.startsWith("zod/"))
    .map(({ chain }) => shortest(chain));

describe("a student's player ships no zod", () => {
  it.each(STUDENT_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches zod",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(1);
      expect(zodChains(entry)).toEqual([]);
    },
  );

  it("would catch it: the schemas do reach zod", () => {
    expect(zodChains(path.join(SRC, "lib", "ngn", "schemas", "index.ts")).length).toBeGreaterThan(
      0,
    );
  });
});
