import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  requestSignInLink: vi.fn(async () => ({ status: "idle" })),
  signInAsDemo: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("@/lib/auth/demoAccount", () => ({ readDemoAccount: () => null }));

import SignInPage from "./page";

async function renderPage(searchParams: Record<string, string>) {
  const page = await SignInPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  } as PageProps<"/sign-in">);
  render(page);
}

describe("sign-in page", () => {
  it("is headed Sign in, and leaves focus alone, on an ordinary visit", async () => {
    await renderPage({});

    const heading = screen.getByRole("heading", { level: 1, name: "Sign in" });
    expect(heading).not.toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("after a failed link, says so under a focused heading with the form ready (#267)", async () => {
    await renderPage({ error: "link" });

    expect(screen.getByRole("heading", { level: 1, name: "Get a new sign-in link" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That sign-in link has expired or was already used.",
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  });

  it("ignores any other error value", async () => {
    await renderPage({ error: "<script>" });

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
