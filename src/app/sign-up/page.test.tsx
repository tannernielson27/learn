import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => ({ status: "signed_out" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("./actions", () => ({ createAccount: vi.fn(async () => ({ status: "idle" })) }));

import SignUpPage from "./page";

const TRIAL =
  "Teachers get a 7-day free trial, then $39.99 a month per workspace. Free for students.";

async function renderPage(searchParams: Record<string, string>) {
  const page = await SignUpPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  } satisfies PageProps<"/sign-up">);
  render(page);
}

describe("sign-up page (#563)", () => {
  it("is headed in the site's display type under the wordmark", async () => {
    await renderPage({});

    expect(within(screen.getByRole("main")).getByRole("link", { name: "LeaRN" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toHaveClass(
      "display-section",
    );
  });

  it("names the free trial for someone arriving from Start your free trial", async () => {
    await renderPage({});

    expect(screen.getByText(TRIAL)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
  });

  it("names it on a teacher's link too", async () => {
    await renderPage({ role: "teacher" });

    expect(screen.getByText(TRIAL)).toBeInTheDocument();
  });

  it("says nothing of a price on a student's link", async () => {
    await renderPage({ role: "student" });
    expect(screen.queryByText(TRIAL)).not.toBeInTheDocument();
  });

  it("says nothing of a price on a link that carries a class code", async () => {
    await renderPage({ code: "ABCD-EFGH" });
    expect(screen.queryByText(TRIAL)).not.toBeInTheDocument();
  });
});
