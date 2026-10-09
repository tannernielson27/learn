import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/nextPath";
import {
  INVITE_CLOSED,
  INVITE_NOT_VALID_HEADING,
  INVITE_NOT_VALID_TEXT,
  INVITE_REFUSED,
  INVITE_UNAVAILABLE,
  inviteResponseHeaders,
  inviterLabel,
  isWorkspaceInvitePath,
  maskEmail,
  mustEndEarlierAccess,
  ORG_INVITE_LIFETIME_MS,
  sameAddress,
  sessionStartedAt,
  signInToAcceptPath,
  workspaceInvitePath,
} from "./invite";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";

describe("the invitation's path", () => {
  it("is /w/<token>", () => {
    expect(workspaceInvitePath(TOKEN)).toBe(`/w/${TOKEN}`);
  });

  it("escapes and clips what is not a token", () => {
    expect(workspaceInvitePath("a/b?c")).toBe("/w/a%2Fb%3Fc");
    expect(workspaceInvitePath("x".repeat(500))).toBe(`/w/${"x".repeat(64)}`);
  });

  it("sends someone through sign-in and back, by a path sign-in will follow", () => {
    const path = signInToAcceptPath(TOKEN);
    expect(path).toBe(`/sign-in?next=${encodeURIComponent(`/w/${TOKEN}`)}`);
    const next = new URL(path, "https://learn.example").searchParams.get("next");
    expect(safeNextPath(next)).toBe(`/w/${TOKEN}`);
  });

  it.each([
    [`/w/${TOKEN}`, true],
    ["/w/", true],
    ["/w", false],
    ["/welcome", false],
    ["/author/workspace", false],
  ])("knows whether %s is an invitation page", (pathname, expected) => {
    expect(isWorkspaceInvitePath(pathname)).toBe(expected);
  });
});

describe("inviteResponseHeaders", () => {
  it("keeps the token out of every Referer", () => {
    expect(inviteResponseHeaders(`/w/${TOKEN}`)).toEqual({ "Referrer-Policy": "no-referrer" });
  });

  it("adds nothing anywhere else", () => {
    expect(inviteResponseHeaders("/welcome")).toEqual({});
    expect(inviteResponseHeaders("/author")).toEqual({});
  });

  it("covers a page whose own address carries the invitation in `next`", () => {
    const next = encodeURIComponent(`/w/${TOKEN}`);
    const sent = { "Referrer-Policy": "no-referrer" };
    expect(inviteResponseHeaders("/sign-in", `?next=${next}`)).toEqual(sent);
    expect(inviteResponseHeaders("/sign-up", `?role=teacher&next=${next}`)).toEqual(sent);
    // Carried one page further, inside another page's own `next`.
    const nested = encodeURIComponent(`/account/password?next=${next}`);
    expect(inviteResponseHeaders("/sign-in", `?next=${nested}`)).toEqual(sent);
  });

  it("adds nothing for a `next` that is not an invitation, or is not there", () => {
    expect(inviteResponseHeaders("/sign-in", "")).toEqual({});
    expect(inviteResponseHeaders("/sign-in", "?next=%2Fauthor")).toEqual({});
    expect(inviteResponseHeaders("/sign-in", "?next=%2Fwelcome")).toEqual({});
    expect(inviteResponseHeaders("/sign-in", "?next=%2Fauthor%2Fworkspace")).toEqual({});
    expect(inviteResponseHeaders("/sign-in", `?other=%2Fw%2F${TOKEN}`)).toEqual({});
    // A value that cannot be decoded is not an invitation path, and is not an error.
    expect(inviteResponseHeaders("/sign-in", "?next=%25E0%25A4%25A")).toEqual({});
  });
});

describe("maskEmail", () => {
  it("shows the first letters and the ending, and no length", () => {
    expect(maskEmail("ada.lovelace@school.edu")).toBe("a***@s***.edu");
    expect(maskEmail("b@x.org")).toBe("b***@x***.org");
  });

  it("never shows the whole address", () => {
    for (const email of ["ada@school.edu", "a@b.co", "someone@localhost"]) {
      expect(maskEmail(email)).not.toBe(email);
      expect(maskEmail(email)).not.toContain(email.split("@")[1]);
    }
  });

  it("shows nothing of what is not an address", () => {
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("@school.edu")).toBe("***");
    expect(maskEmail("nobody")).toBe("***");
  });
});

describe("sameAddress", () => {
  it("ignores case and surrounding space, as the database does", () => {
    expect(sameAddress(" Ada@School.edu ", "ada@school.edu")).toBe(true);
    expect(sameAddress("ada@school.edu", "ada@school.org")).toBe(false);
  });
});

describe("inviterLabel", () => {
  it("prefers the name, then the address, then says a colleague", () => {
    expect(inviterLabel({ name: "Ada Lovelace", email: "ada@school.edu" })).toBe("Ada Lovelace");
    expect(inviterLabel({ name: "  ", email: "ada@school.edu" })).toBe("ada@school.edu");
    expect(inviterLabel({ name: null, email: null })).toBe("A colleague");
  });
});

describe("what the page says", () => {
  it("has one answer for a token that is not valid, naming no cause", () => {
    expect(INVITE_NOT_VALID_HEADING).toBe("This invitation is not valid or has expired");
    for (const word of ["unknown", "malformed", "too many", "network", "limit"]) {
      expect(`${INVITE_NOT_VALID_HEADING} ${INVITE_NOT_VALID_TEXT}`.toLowerCase()).not.toContain(
        word,
      );
    }
  });

  it("says each refusal plainly, with no emoji and no markup", () => {
    expect(INVITE_REFUSED.student).toMatch(/student account/);
    expect(INVITE_REFUSED.student).toMatch(/another email address/);
    expect(INVITE_REFUSED.already_teaches).toMatch(/already teaches in a workspace/);
    expect(INVITE_REFUSED.already_teaches).toMatch(/not available yet/);
    const all = [
      ...Object.values(INVITE_REFUSED),
      ...Object.values(INVITE_CLOSED),
      INVITE_UNAVAILABLE,
      INVITE_NOT_VALID_TEXT,
    ].join(" ");
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(all).not.toMatch(/[<>]/);
  });
});

describe("sessionStartedAt", () => {
  it("is the latest proof the session lists", () => {
    const claims = {
      amr: [
        { method: "password", timestamp: 1_700_000_000 },
        { method: "otp", timestamp: 1_700_000_500 },
      ],
    };
    expect(sessionStartedAt(claims)).toBe(1_700_000_500_000);
  });

  it.each([
    [null],
    [{}],
    [{ amr: [] }],
    [{ amr: "password" }],
    [{ amr: ["password"] }],
    [{ amr: [{ method: "password" }] }],
    [{ amr: [{ method: "password", timestamp: "1700000000" }] }],
    [{ amr: [{ method: "password", timestamp: 1_700_000_000 }, null] }],
  ])("is null when the token does not say: %j", (claims) => {
    expect(sessionStartedAt(claims)).toBeNull();
  });
});

describe("mustEndEarlierAccess", () => {
  const EXPIRES = "2026-10-16T12:00:00.000Z";
  const issuedAt = Date.parse(EXPIRES) - ORG_INVITE_LIFETIME_MS;
  const sessionAt = (ms: number) => ({ amr: [{ method: "password", timestamp: ms / 1000 }] });

  it("is yes for an account nobody had confirmed, however old the session", () => {
    expect(
      mustEndEarlierAccess({
        wasUnconfirmed: true,
        claims: sessionAt(issuedAt - 86_400_000),
        inviteExpiresAt: EXPIRES,
      }),
    ).toBe(true);
  });

  it("is no for a confirmed account signed in before the invitation existed", () => {
    expect(
      mustEndEarlierAccess({
        wasUnconfirmed: false,
        claims: sessionAt(issuedAt - 1000),
        inviteExpiresAt: EXPIRES,
      }),
    ).toBe(false);
  });

  it("is yes for a session made once the invitation existed", () => {
    for (const startedAt of [issuedAt, issuedAt + 1000, Date.parse(EXPIRES)]) {
      expect(
        mustEndEarlierAccess({
          wasUnconfirmed: false,
          claims: sessionAt(startedAt),
          inviteExpiresAt: EXPIRES,
        }),
      ).toBe(true);
    }
  });

  it("is yes whenever the answer cannot be read", () => {
    expect(
      mustEndEarlierAccess({ wasUnconfirmed: false, claims: null, inviteExpiresAt: EXPIRES }),
    ).toBe(true);
    expect(
      mustEndEarlierAccess({
        wasUnconfirmed: false,
        claims: sessionAt(issuedAt - 1000),
        inviteExpiresAt: "not a date",
      }),
    ).toBe(true);
  });

  it("counts the same seven days the database gives an invitation", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20261009010000_workspace_invites.sql"),
      "utf8",
    );
    expect(migration).toContain(
      "expires_at timestamptz not null default (now() + interval '7 days')",
    );
    expect(ORG_INVITE_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
