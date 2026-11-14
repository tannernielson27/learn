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

const visit = (searchParams: Record<string, string | string[]>) =>
  JoinPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) });

// #563: `/join?code=` is where the landing page's join field lands without JavaScript.
describe("/join", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("is the plain join page with no code in the address", async () => {
    render(await visit({}));
    expect(screen.getByRole("textbox", { name: "Join code" })).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a code typed on the landing page on to the join page for it, normalized", async () => {
    await expect(visit({ code: "7kq 2mz" })).rejects.toThrow("redirect /join/7KQ2MZ");
    await expect(visit({ code: "7KQ-2MZ", guest: "1" })).rejects.toThrow(
      "redirect /join/7KQ2MZ?guest=1",
    );
  });

  it("stays here and says what a join code is, for an empty or impossible code", async () => {
    for (const code of ["", "ABC", "OI1OI1"]) {
      const { unmount } = render(await visit({ code }));
      expect(screen.getByRole("alert")).toHaveTextContent(JOIN_CODE_ERROR);
      const field = screen.getByRole("textbox", { name: "Join code" });
      expect(field).toHaveValue("");
      expect(field).toHaveAttribute("aria-invalid", "true");
      unmount();
    }
    expect(redirect).not.toHaveBeenCalled();
  });
});
