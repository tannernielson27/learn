// A student's phone in a live session never parses anything with zod: what it reads arrives
// already checked by the server (`/api/live/view`, the page's own reads). zod is about 85 kB gzip,
// more than the rest of the room together, so one value import of a schema module puts it on
// every phone in the class. The schemas themselves stay where they are, on the server and on the
// author's screens; this holds the phone to the parts it needs (`runPlace.ts`, not
// `caseStudyRuns.ts`).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

/** Everything a participant's browser runs in the room, and the record beside it. */
const PHONE_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "CaseStudyLayout.tsx"),
  path.join(SRC, "components", "live", "JoinForm.tsx"),
  path.join(SRC, "app", "join", "JoinScreen.tsx"),
];

const zodChains = (entry: string) =>
  packagesIn(reachable(entry))
    .filter(({ specifier }) => specifier === "zod" || specifier.startsWith("zod/"))
    .map(({ chain }) => shortest(chain));

describe("a phone in the room ships no zod", () => {
  it.each(PHONE_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches zod",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(zodChains(entry)).toEqual([]);
    },
  );

  it("would catch it: the case-study runs parser does reach zod", () => {
    const parser = path.join(SRC, "lib", "live", "caseStudyRuns.ts");
    expect(zodChains(parser).length).toBeGreaterThan(0);
  });
});
