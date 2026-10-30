import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * #522: the site footer is on the public pages (landing, pricing, terms, privacy, help, sign-in,
 * sign-up) and nowhere a teacher or student is working. The frames those working screens are
 * drawn in, the app shell and the form frame, carry none of their own, and the account page has
 * one quiet line of legal links instead.
 */

const viewer = vi.hoisted(() => ({ current: { status: "signed_out" } as unknown }));
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer.current }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  usePathname: () => "/",
}));
vi.mock("./sign-in/actions", () => ({
  requestSignInLink: vi.fn(async () => ({ status: "idle" })),
  signInAsDemo: vi.fn(async () => ({ status: "idle" })),
  signInWithEmailPassword: vi.fn(async () => ({ status: "idle" })),
  verifySignInCode: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("./sign-up/actions", () => ({ createAccount: vi.fn(async () => ({ status: "idle" })) }));
vi.mock("./account/actions", () => ({ saveDisplayName: vi.fn(async () => ({ status: "idle" })) }));
vi.mock("@/lib/auth/demoAccount", () => ({ readDemoAccount: () => null }));

import { AuthFrame } from "@/components/auth/AuthFrame";
import { AppShell } from "@/components/ui/AppShell";
import AccountPage from "./account/page";
import HelpLayout from "./help/layout";
import SignInPage from "./sign-in/page";
import SignUpPage from "./sign-up/page";

const pageProps = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };

function expectSiteFooter() {
  const footer = screen.getByRole("contentinfo");
  const nav = within(footer).getByRole("navigation", { name: "Footer" });
  expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  expect(within(nav).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
}

describe("the site footer (#522)", () => {
  it("closes the help pages", () => {
    render(
      <HelpLayout params={Promise.resolve({})}>
        <p>Help</p>
      </HelpLayout>,
    );
    expectSiteFooter();
  });

  it("closes sign-in", async () => {
    render(await SignInPage(pageProps));
    expectSiteFooter();
  });

  it("closes sign-up, which also links pricing on its own", async () => {
    render(await SignUpPage(pageProps));
    expectSiteFooter();
    expect(screen.getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
  });

  it("is not part of the frames the working screens are drawn in", () => {
    render(
      <AppShell homeHref="/author" nav={<nav aria-label="Primary" />}>
        <p>Library</p>
      </AppShell>,
    );
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.queryByRole("link", { name: "Pricing" })).toBeNull();
  });

  it("is not on the account page, which has the legal links alone", async () => {
    viewer.current = {
      status: "signed_in",
      userId: "u1",
      email: "ada@school.edu",
      displayName: "Ada",
      role: "student",
    };
    render(await AccountPage());
    expect(screen.queryByRole("contentinfo")).toBeNull();
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(legal)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Terms", "Privacy", "Contact"]);
    render(
      <AuthFrame>
        <p>Form</p>
      </AuthFrame>,
    );
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
