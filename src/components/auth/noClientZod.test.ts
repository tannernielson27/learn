// The forms where a student or teacher types their name never parse it with zod in the browser:
// the server does (`displayNameRule`). zod is about 85 kB gzip, so a value import of
// `lib/auth/displayName.ts` for its length limit put all of it on sign-up and the class invite.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, packagesIn, reachable, shortest } from "../testing/importGraph";

const NAME_FORMS = [
  path.join(SRC, "components", "auth", "DisplayNameField.tsx"),
  path.join(SRC, "components", "auth", "SignUpForm.tsx"),
  path.join(SRC, "components", "auth", "AccountNameForm.tsx"),
  path.join(SRC, "components", "classes", "InviteSignUpForm.tsx"),
  path.join(SRC, "components", "classes", "InvitePanel.tsx"),
];

const zodChains = (entry: string) =>
  packagesIn(reachable(entry))
    .filter(({ specifier }) => specifier === "zod" || specifier.startsWith("zod/"))
    .map(({ chain }) => shortest(chain));

describe("the name forms ship no zod", () => {
  it.each(NAME_FORMS.map((f) => [path.relative(SRC, f), f] as const))(
    "%s never reaches zod",
    (_name, entry) => {
      expect(reachable(entry).size).toBeGreaterThan(1);
      expect(zodChains(entry)).toEqual([]);
    },
  );

  it("would catch it: the server's name rule does reach zod", () => {
    expect(zodChains(path.join(SRC, "lib", "auth", "displayName.ts")).length).toBeGreaterThan(0);
  });
});
