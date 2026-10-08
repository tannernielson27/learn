import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { confirmSignIn, redirect, verifyOtp } = vi.hoisted(() => ({
  confirmSignIn: vi.fn(async () => undefined),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
  verifyOtp: vi.fn(),
}));
vi.mock("./actions", () => ({ confirmSignIn }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp } }),
}));

import ConfirmPage from "./page";

async function renderPage(searchParams: Record<string, string>) {
  const page = await ConfirmPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  } satisfies PageProps<"/auth/confirm">);
  render(page);
}

describe("/auth/confirm (#305)", () => {
  it("does not use the link on page load: a mail scanner's visit spends nothing", async () => {
    await renderPage({ token_hash: "abc", type: "email", next: "/learn" });

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(confirmSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Finish signing in" })).toBeVisible();
  });

  it("puts the link in a form that posts it, with only the safe next", async () => {
    await renderPage({ token_hash: "abc", type: "email", next: "//evil.example" });

    const button = screen.getByRole("button", { name: "Continue to LeaRN" });
    const form = button.closest("form");
    expect(form).not.toBeNull();
    const fields = new FormData(form!);
    expect(fields.get("token_hash")).toBe("abc");
    expect(fields.get("type")).toBe("email");
    expect(fields.get("next")).toBe("/author");
  });

  it("says which device will be signed in", async () => {
    await renderPage({ token_hash: "abc", type: "email", next: "/learn" });

    expect(screen.getByText(/signs you in on this device/i)).toBeInTheDocument();
  });

  it("sends a link that cannot be read straight to sign-in, without a button", async () => {
    await expect(renderPage({ type: "email", next: "/learn" })).rejects.toThrow(
      "redirect:/sign-in?error=link&next=%2Flearn",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
