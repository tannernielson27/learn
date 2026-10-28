// A student's phone has no Supabase account, so it never needs `@supabase/ssr`, the cookie-session
// client a signed-in author's browser uses. The phone's channel client is `channelClient.ts`;
// importing it from `browser.ts`, beside `createSupabaseBrowserClient`, put `@supabase/ssr` on
// every phone in the room.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

const PHONE_ENTRIES = [
  path.join(SRC, "components", "live", "StudentRoom.tsx"),
  path.join(SRC, "components", "live", "StudentPacedRoom.tsx"),
  path.join(SRC, "components", "live", "phone", "useStudentRoom.ts"),
];

const ssrChains = (entry: string) =>
  packagesIn(reachable(entry))
    .filter(({ specifier }) => specifier.startsWith("@supabase/ssr"))
    .map(({ chain }) => shortest(chain));

describe("a phone in the room ships no @supabase/ssr", () => {
  it.each(PHONE_ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches @supabase/ssr",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(2);
      expect(ssrChains(entry)).toEqual([]);
    },
  );

  it("would catch it: the host's room does reach it", () => {
    const host = path.join(SRC, "components", "live", "host", "useHostRoom.ts");
    expect(ssrChains(host).length).toBeGreaterThan(0);
  });
});
