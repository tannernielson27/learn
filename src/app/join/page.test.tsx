import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./actions", () => ({ joinLiveSession: async () => ({ status: "idle" }) }));
vi.mock("./joinAccount", () => ({ readJoinAccount: async () => ({ kind: "none" }) }));

import JoinPage from "./page";

const page = (query: Record<string, string>) =>
  JoinPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never);

/**
 * #563: the landing page's join code form is a plain GET form to `/join`, so it works without
 * JavaScript. The code it sends is read the way every typed code is (`checkJoinCode`).
 */
describe("/join?code=", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("sends a code that could name a live session on to its join page, normalised", async () => {
    await expect(page({ code: "v96-rn8" })).rejects.toThrow("redirect /join/V96RN8");
    await expect(page({ code: "v96 rn8", guest: "1" })).rejects.toThrow(
      "redirect /join/V96RN8?guest=1",
    );
  });

  it("keeps an empty or impossible code here, with the join form's message", async () => {
    for (const code of ["", "abc"]) {
      const { unmount } = render(await page({ code }));
      expect(screen.getByRole("textbox", { name: "Join code" })).toHaveValue("");
      expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
      unmount();
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("is today's page when the address carries no code", async () => {
    render(await page({}));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Join code" })).toHaveValue("");
  });
});
