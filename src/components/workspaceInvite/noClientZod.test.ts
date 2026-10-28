// A workspace invitation's page never parses anything with zod in the browser, and neither does
// the proxy that runs before every request: both import the page's half of the invitation
// (`invitePage.ts`). The teacher's half checks an address with zod and is the server's alone;
// importing it here put all of zod (about 85 kB gzip) on `/w/<token>` and in the proxy.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

// `AcceptInviteForm` is left out: its name field reaches zod through `lib/auth/displayName.ts`,
// which `perf/auth-name-no-zod` fixes on its own; add it here once both are in.
const ENTRIES = [
  path.join(SRC, "components", "workspaceInvite", "JoinWorkspaceButton.tsx"),
  path.join(SRC, "components", "workspaceInvite", "MoveWorkspaceForm.tsx"),
  path.join(SRC, "components", "workspaceInvite", "InviteAnswerView.tsx"),
  path.join(SRC, "proxy.ts"),
];

const zodChains = (entry: string) =>
  packagesIn(reachable(entry))
    .filter(({ specifier }) => specifier === "zod" || specifier.startsWith("zod/"))
    .map(({ chain }) => shortest(chain));

describe("the invitation page and the proxy ship no zod", () => {
  it.each(ENTRIES.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches zod",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(1);
      expect(zodChains(entry)).toEqual([]);
    },
  );

  it("would catch it: the teacher's half does reach zod", () => {
    expect(zodChains(path.join(SRC, "lib", "workspace", "invite.ts")).length).toBeGreaterThan(0);
  });
});
