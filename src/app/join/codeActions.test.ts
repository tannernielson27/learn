import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOIN_CODE_ERROR } from "@/lib/live/joinForm";

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

import { openJoinCode } from "./codeActions";

function form(code?: string): FormData {
  const data = new FormData();
  if (code !== undefined) data.set("code", code);
  return data;
}

// #563: the landing page's code-only form. It looks nothing up: it sends the code on to the page a
// QR code opens, which fills it in and asks for a name, so the landing page probes nothing either.
describe("openJoinCode", () => {
  beforeEach(() => redirected.mockReset());

  it("sends a code, normalized, to the join page for that code", async () => {
    for (const typed of ["7kq2mz", "7KQ 2MZ", " 7kq-2mz "]) {
      await expect(openJoinCode({ status: "idle" }, form(typed))).rejects.toThrow(
        "redirect:/join/7KQ2MZ",
      );
    }
    expect(redirected).toHaveBeenCalledTimes(3);
    expect(redirected).toHaveBeenLastCalledWith("/join/7KQ2MZ");
  });

  it("refuses an empty, missing or impossible code with the join form's words, and stays put", async () => {
    for (const [data, typed] of [
      [form(""), ""],
      [form(), ""],
      [form("7KQ2M"), "7KQ2M"],
      [form("IOIOIO"), "IOIOIO"],
    ] as const) {
      await expect(openJoinCode({ status: "idle" }, data)).resolves.toEqual({
        status: "error",
        error: JOIN_CODE_ERROR,
        typed,
      });
    }
    expect(redirected).not.toHaveBeenCalled();
  });
});
