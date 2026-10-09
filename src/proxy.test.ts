/**
 * ADR 0003 / #146: the proxy is where the gallery is closed on production, because it runs
 * before anything renders. `scripts/gallery-closed.mjs` is the check that settles the guarantee,
 * since it reads a real response off a real build; this is the fast version of the same
 * questions, plus the two properties that script cannot see: that no session work happens on the
 * way, and that the matcher still covers the gallery at all.
 */
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/proxy", () => ({ updateSession }));

import { config, proxy } from "./proxy";

const FORBIDDEN = ["answerKey", "correctOptionId", "rationale", "scoring", "maxPoints"];

const request = (pathname: string) => new NextRequest(new URL(pathname, "https://learn.test"));

describe("the proxy closes the gallery on production", () => {
  const saved = process.env.VERCEL_ENV;

  beforeEach(() => {
    updateSession.mockReset();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved;
  });

  const GALLERY_PATHS = [
    "/gallery",
    "/gallery/live",
    "/gallery/case-study",
    "/gallery/items/multiple_choice",
    "/gallery/items/multiple_choice/",
    // A route nobody has written yet is closed by the same prefix, which is the point of gating
    // on the path rather than on a list.
    "/gallery/something-added-next-sprint",
  ];

  it.each(GALLERY_PATHS)("answers 404 for %s", async (pathname) => {
    process.env.VERCEL_ENV = "production";
    const response = await proxy(request(pathname));
    expect(response.status).toBe(404);
  });

  it("sends a body with nothing in it to leak", async () => {
    process.env.VERCEL_ENV = "production";
    const body = await (await proxy(request("/gallery/items/multiple_choice"))).text();
    for (const marker of FORBIDDEN)
      expect(body, `the 404 body names ${marker}`).not.toContain(marker);
    // Small enough that there is plainly no rendered page in it. The measured leak this replaced
    // was 21KB for this route.
    expect(body.length).toBeLessThan(100);
  });

  it("does no session work on the way, in either direction", async () => {
    process.env.VERCEL_ENV = "production";
    await proxy(request("/gallery"));
    expect(updateSession).not.toHaveBeenCalled();

    process.env.VERCEL_ENV = "preview";
    await proxy(request("/gallery"));
    expect(updateSession).not.toHaveBeenCalled();
  });

  it.each(["preview", "development"])("lets the gallery through on %s", async (vercelEnv) => {
    process.env.VERCEL_ENV = vercelEnv;
    expect((await proxy(request("/gallery/live"))).status).toBe(200);
  });

  it("lets the gallery through where the variable is absent", async () => {
    delete process.env.VERCEL_ENV;
    expect((await proxy(request("/gallery"))).status).toBe(200);
  });

  it("leaves everything outside the gallery to the session logic", async () => {
    process.env.VERCEL_ENV = "production";
    updateSession.mockResolvedValue({
      response: NextResponse.next(),
      signedIn: true,
      homeFor: async (target: string) => target,
    });
    for (const pathname of ["/", "/author", "/sign-in", "/play/abc", "/galleryish"]) {
      updateSession.mockClear();
      await proxy(request(pathname));
      expect(updateSession, `${pathname} was swallowed by the gallery gate`).toHaveBeenCalledOnce();
    }
  });
});

describe("the proxy matcher still covers the gallery", () => {
  // Next requires `matcher` to be a statically analysable constant, so this reads the value it
  // actually ships. Losing an entry here would take the gate off every gallery route silently —
  // the proxy docs call that out as the way proxy coverage disappears in a refactor.
  const matcher = config.matcher;

  it("names the gallery root and everything under it", () => {
    expect(matcher).toContain("/gallery");
    expect(matcher).toContain("/gallery/:path*");
  });

  it("still names the routes that need a session", () => {
    expect(matcher).toContain("/author/:path*");
    expect(matcher).toContain("/sign-in");
    expect(matcher).toContain("/auth/:path*");
  });

  it("refreshes the session on the student home and the class invite page (#205)", () => {
    expect(matcher).toContain("/learn");
    expect(matcher).toContain("/learn/:path*");
    expect(matcher).toContain("/c/:path*");
  });

  it("guards the account pages and refreshes their session (#358)", async () => {
    expect(matcher).toContain("/account");
    expect(matcher).toContain("/account/:path*");

    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: false });
    const away = await proxy(request("/account"));
    expect(away.headers.get("location")).toBe("https://learn.test/sign-in?next=%2Faccount");
    // The password page keeps where it was going, as the page's own check never could.
    const password = await proxy(request("/account/password?next=%2Flearn"));
    expect(password.headers.get("location")).toBe(
      "https://learn.test/sign-in?next=%2Faccount%2Fpassword%3Fnext%3D%252Flearn",
    );
    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: true });
    expect((await proxy(request("/account"))).headers.get("location")).toBeNull();
  });

  it("runs on sign-up and guards the welcome page (#361)", async () => {
    expect(matcher).toContain("/sign-up");
    expect(matcher).toContain("/welcome");

    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: false });
    expect((await proxy(request("/sign-up"))).headers.get("location")).toBeNull();
    expect((await proxy(request("/welcome"))).headers.get("location")).toBe(
      "https://learn.test/sign-in?next=%2Fwelcome",
    );
  });

  it("refreshes the session on the landing page, which reads it to pick a link (#264)", () => {
    expect(matcher).toContain("/");
  });

  it("runs on a workspace invitation and keeps its token out of every Referer", async () => {
    expect(matcher).toContain("/w/:path*");

    for (const signedIn of [false, true]) {
      updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn });
      const response = await proxy(request("/w/AbC_-0123456789abcdefghijklmnopq"));
      // Never sent to sign-in: the colleague may have no account yet.
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }

    // Nowhere else: the rest of the site keeps the browser's default.
    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: true });
    for (const pathname of ["/", "/author", "/c/AbC_-0123456789abcdefghijklmnopq", "/welcome"]) {
      expect((await proxy(request(pathname))).headers.get("referrer-policy"), pathname).toBeNull();
    }
  });
});

describe("a signed-in visit to sign-in goes to that person's own home in one redirect", () => {
  // What `updateSession` hands over: the default swapped for the role's home, anything else kept.
  const session = (home: string) => {
    const homeFor = vi.fn(async (target: string) => (target === "/author" ? home : target));
    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: true, homeFor });
    return homeFor;
  };

  beforeEach(() => {
    updateSession.mockReset();
  });

  it.each([
    ["a student", "/learn"],
    ["an account with no role", "/welcome"],
    ["an author", "/author"],
  ])("sends %s straight to %s", async (_who, home) => {
    session(home);
    const response = await proxy(request("/sign-in"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://learn.test${home}`);
  });

  it("still follows a next that was asked for", async () => {
    const homeFor = session("/learn");
    const response = await proxy(
      request("/sign-in?next=%2Faccount%2Fpassword%3Fnext%3D%252Flearn"),
    );
    expect(response.headers.get("location")).toBe(
      "https://learn.test/account/password?next=%2Flearn",
    );
    expect(homeFor).toHaveBeenCalledWith("/account/password?next=%2Flearn");
  });

  it("never follows a next that leaves the site", async () => {
    session("/learn");
    const response = await proxy(request("/sign-in?next=https%3A%2F%2Fevil.example"));
    expect(response.headers.get("location")).toBe("https://learn.test/learn");
  });

  it("asks for a home on no other request, signed in or out", async () => {
    const homeFor = session("/learn");
    for (const pathname of ["/", "/author", "/author/banks/1", "/learn", "/account", "/sign-up"]) {
      const response = await proxy(request(pathname));
      expect(response.headers.get("location"), pathname).toBeNull();
    }
    expect(homeFor).not.toHaveBeenCalled();

    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: false, homeFor });
    expect((await proxy(request("/sign-in"))).headers.get("location")).toBeNull();
    expect((await proxy(request("/learn"))).headers.get("location")).toBe(
      "https://learn.test/sign-in?next=%2Flearn",
    );
    expect(homeFor).not.toHaveBeenCalled();
  });

  it("carries refreshed session cookies onto the redirect", async () => {
    const refreshed = NextResponse.next();
    refreshed.cookies.set("sb-session", "fresh");
    updateSession.mockResolvedValue({
      response: refreshed,
      signedIn: true,
      homeFor: async () => "/learn",
    });
    const response = await proxy(request("/sign-in"));
    expect(response.cookies.get("sb-session")?.value).toBe("fresh");
  });
});
