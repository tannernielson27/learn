import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READ_ONLY_FOR_COLLEAGUE,
  READ_ONLY_FOR_FOUNDER,
  READ_ONLY_HEADING,
} from "@/lib/billing/billingCopy";

/**
 * The read-only page (#521), where a refused write lands: one sentence, Billing for the person
 * who started the workspace, "ask" for everyone else, and the way back. A workspace that may
 * write is sent straight back.
 */

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const state = vi.hoisted(() => ({
  readOnly: null as null | { readOnly: true; canManage: boolean },
}));
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: async () => ({
    supabase: {},
    userId: "u",
    email: "",
    orgId: "o",
    readOnly: state.readOnly,
  }),
}));

const { default: ReadOnlyPage } = await import("./page");

function props(next?: string) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(next === undefined ? {} : { next }),
  } as Parameters<typeof ReadOnlyPage>[0];
}

afterEach(cleanup);

describe("the read-only page", () => {
  it("tells the person who started the workspace why, and links to Billing and back", async () => {
    state.readOnly = { readOnly: true, canManage: true };
    render(await ReadOnlyPage(props("/author/banks/b1")));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(READ_ONLY_HEADING);
    expect(screen.getByRole("alert").textContent).toBe(READ_ONLY_FOR_FOUNDER);
    expect(screen.getByRole("link", { name: "Go to Billing" }).getAttribute("href")).toBe(
      "/author/workspace",
    );
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe(
      "/author/banks/b1",
    );
  });

  it("tells another teacher to ask, with no link to Billing", async () => {
    state.readOnly = { readOnly: true, canManage: false };
    render(await ReadOnlyPage(props()));
    expect(screen.getByRole("alert").textContent).toBe(READ_ONLY_FOR_COLLEAGUE);
    expect(screen.queryByRole("link", { name: "Go to Billing" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/author");
  });

  it("never links back off the site", async () => {
    state.readOnly = { readOnly: true, canManage: false };
    render(await ReadOnlyPage(props("//evil.example/x")));
    expect(screen.getByRole("link", { name: "Go back" }).getAttribute("href")).toBe("/author");
  });

  it("sends a workspace that may write straight back", async () => {
    state.readOnly = null;
    await expect(ReadOnlyPage(props("/author/classes"))).rejects.toThrow(
      "redirect:/author/classes",
    );
  });

  it("words it the glossary's way", () => {
    for (const sentence of [READ_ONLY_FOR_FOUNDER, READ_ONLY_FOR_COLLEAGUE, READ_ONLY_HEADING]) {
      expect(sentence).not.toMatch(
        /\b(org|organization|founder|member|seat|paywall|upgrade|plan)\b/i,
      );
    }
  });
});
