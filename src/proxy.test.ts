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
    updateSession.mockResolvedValue({ response: NextResponse.next(), signedIn: true });
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
});
