import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "@/components/landing/Landing";
import { findRetiredTerms } from "@/lib/copy/retiredTerms";
import {
  OFFER_PERIOD,
  OFFER_PRICE,
  OFFER_SUMMARY,
  OFFER_TEACHERS,
  OFFER_TRIAL,
  OFFER_TRIAL_TERMS,
} from "@/lib/site/offer";

const readLandingEntry = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/visitor", () => ({ readLandingEntry }));
// The landing page's join code form posts to a Server Action that redirects.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import SiteLayout from "./layout";
import PricingPage, { metadata as pricingMetadata } from "./pricing/page";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import TermsPage, { metadata as termsMetadata } from "./terms/page";

const VISITOR = {
  href: "/sign-up",
  label: "Start your free trial",
  also: { href: "/sign-in", label: "Sign in" },
};

/** Words the glossary keeps out of billing copy (docs/glossary.md, ADR 0016). */
const BILLING_WORDS = /\b(?:plan|plans|plan tier|paywall|seat|seats|upgrade|founder|org)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function expectGlossaryWording(html: string) {
  expect(findRetiredTerms(html)).toEqual([]);
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(BILLING_WORDS);
  expect(text).not.toMatch(EMOJI);
  // The text is a draft for the owner and counsel, but the page carries no draft banner.
  expect(html).not.toMatch(/\bdraft\b(?! questions)/i);
}

describe("the public pages' layout (#522)", () => {
  it("draws the wordmark home, Pricing and Sign in, and the site footer", () => {
    render(
      <SiteLayout>
        <p>Page</p>
      </SiteLayout>,
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/");
    const site = within(header).getByRole("navigation", { name: "Site" });
    expect(
      within(site)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Pricing", "/pricing"],
      ["Sign in", "/sign-in"],
    ]);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Every patient shown in LeaRN");
  });
});

describe("/pricing (#522)", () => {
  beforeEach(() => {
    readLandingEntry.mockReset();
    readLandingEntry.mockResolvedValue(VISITOR);
  });

  it("shows the one price, the trial, the teacher cap, and that students are free", async () => {
    render(await PricingPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "One price for the whole workspace." }),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).toContain("$39.99");
    expect(text).toContain("a month per workspace");
    expect(text).toContain("Up to 10 teachers");
    expect(text).toContain("7-day free trial");
    expect(text).toContain("Free for students");
    expect(text).toContain("Cancel any time from Manage billing");
  });

  it("offers a visitor the free trial, and a signed-in teacher their quizzes", async () => {
    const { unmount } = render(await PricingPage());
    expect(screen.getByRole("link", { name: "Start your free trial" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    unmount();

    readLandingEntry.mockResolvedValue({ href: "/author", label: "Go to your quizzes" });
    render(await PricingPage());
    expect(screen.queryByRole("link", { name: "Start your free trial" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to your quizzes" })).toHaveAttribute(
      "href",
      "/author",
    );
  });

  it("says what the free trial commits to right under its button, and only there", async () => {
    const { unmount } = render(await PricingPage());
    const button = screen.getByRole("link", { name: "Start your free trial" });
    expect(button).toHaveAccessibleDescription(OFFER_TRIAL_TERMS);
    // The terms follow the button directly, before the list of what the price covers.
    const terms = screen.getByText(OFFER_TRIAL_TERMS);
    expect(terms.previousElementSibling).toBe(button);
    expect(terms.parentElement?.nextElementSibling?.tagName).toBe("UL");
    unmount();

    readLandingEntry.mockResolvedValue({ href: "/author", label: "Go to your quizzes" });
    render(await PricingPage());
    expect(screen.getByRole("link", { name: "Go to your quizzes" })).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.queryByText(OFFER_TRIAL_TERMS)).toBeNull();
  });

  it("answers five short questions, schools among them", async () => {
    render(await PricingPage());
    const faq = screen.getByRole("region", { name: "Common questions" });
    const questions = within(faq)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(questions).toEqual([
      "Do students pay?",
      "What happens after the free trial?",
      "How do I cancel?",
      "What happens if the subscription ends?",
      "Can a school pay for a program?",
    ]);
    expect(within(faq).getByRole("link", { name: "support@learnursing.app" })).toHaveAttribute(
      "href",
      "mailto:support@learnursing.app",
    );
    expect(faq).toHaveTextContent(/no refunds for part of a month/);
    expect(faq).toHaveTextContent(/read-only for teachers/);
  });

  it("uses the glossary's words and names the tab", async () => {
    const page = await PricingPage();
    render(page);
    expectGlossaryWording(renderToStaticMarkup(page));
    expect(pricingMetadata.title).toBe("Pricing");
    expect(pricingMetadata.description).toMatch(/\$39\.99/);
  });
});

describe("the offer's facts, one source for every public page (#563)", () => {
  beforeEach(() => {
    readLandingEntry.mockReset();
    readLandingEntry.mockResolvedValue(VISITOR);
  });

  function pageText(): string {
    return (document.body.textContent ?? "").replace(/\s+/g, " ");
  }

  it("shows the same price, period, trial and teacher cap on the landing page and /pricing", async () => {
    const facts = [OFFER_PRICE, OFFER_PERIOD, OFFER_TRIAL, `Up to ${OFFER_TEACHERS} teachers`];

    const landing = render(<Landing entry={VISITOR} />);
    const landingText = pageText();
    expect(landingText).toContain(OFFER_SUMMARY);
    landing.unmount();

    render(await PricingPage());
    const pricingText = pageText();
    for (const fact of [...facts, "Free for students"]) {
      expect(landingText).toContain(fact);
      expect(pricingText).toContain(fact);
    }
    expect(pricingMetadata.description).toContain(OFFER_PRICE);
    expect(pricingMetadata.description).toContain(OFFER_TRIAL);
    expect(pricingMetadata.description).toContain(`up to ${OFFER_TEACHERS} teachers`);
  });

  it("matches the terms, whose approved words are not built from it", () => {
    render(<TermsPage />);
    const subscription = screen.getByRole("region", { name: "Subscription and free trial" });
    expect(subscription).toHaveTextContent(
      `A workspace costs ${OFFER_PRICE} a month for up to ${OFFER_TEACHERS} teachers`,
    );
    expect(subscription).toHaveTextContent(`A new subscription starts with a ${OFFER_TRIAL}.`);
    expect(subscription).toHaveTextContent(/You enter a card at checkout/);
    expect(screen.getByRole("region", { name: "Workspaces" })).toHaveTextContent(
      `up to ${OFFER_TEACHERS} teachers can share`,
    );
  });

  it("never prints a price or a cap the module does not hold", async () => {
    render(await PricingPage());
    const prices = pageText().match(/\$\d+(?:\.\d{2})?/g) ?? [];
    expect(new Set(prices)).toEqual(new Set([OFFER_PRICE]));
  });
});

describe("the legal pages' layout (#563)", () => {
  it.each([
    ["/terms", TermsPage],
    ["/privacy", PrivacyPage],
  ])("%s lists every section in its contents, numbered, linking to each", (_path, Page) => {
    render(<Page />);
    const sections = screen.getAllByRole("heading", { level: 2 });
    const contents = screen.getByRole("navigation", { name: "Contents" });
    const links = within(contents).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(
      sections.map(
        (heading, index) => `${String(index + 1).padStart(2, "0")}${heading.textContent}`,
      ),
    );
    for (const [index, link] of links.entries()) {
      const id = link.getAttribute("href")?.slice(1) ?? "";
      expect(document.getElementById(id)).toContainElement(sections[index] ?? null);
    }
    // The section numbers are drawn for the eye; a screen reader hears each heading once.
    expect(links[0]?.querySelector("[aria-hidden='true']")).toHaveTextContent("01");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("/terms (#522)", () => {
  it("has a section headed Refunds that says there are none for part of a month", () => {
    render(<TermsPage />);
    const refunds = screen.getByRole("region", { name: "Refunds" });
    expect(refunds).toHaveTextContent(/no.*refunds or credits for part of a month/i);
  });

  it("is governed by Utah law, in the courts of Utah County", () => {
    render(<TermsPage />);
    const law = screen.getByRole("region", { name: "Governing law" });
    expect(law).toHaveTextContent("governed by the laws of the State of Utah");
    expect(law).toHaveTextContent("Utah County, Utah");
    expect(document.body.textContent).not.toMatch(/arbitrat/i);
  });

  it("covers everything the issue asks for, each under its own h2", () => {
    render(<TermsPage />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Who we are",
      "Who can use LeaRN",
      "Your account",
      "Workspaces",
      "Subscription and free trial",
      "Cancellation",
      "Refunds",
      "Price changes",
      "Acceptable use",
      "Your content",
      "AI import",
      "Educational use only",
      "Availability and warranties",
      "Limitation of liability",
      "Ending your use",
      "Changes to these terms",
      "Governing law",
      "Contact",
    ]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("18 or older");
    expect(text).toContain("$39.99");
    expect(text).toContain("7-day free trial");
    expect(text).toContain("NCLEX and NCLEX-RN are registered trademarks of NCSBN");
    expect(text).toContain("12 months");
    expect(text).toMatch(/real patient information or protected health information/);
  });

  it("dates itself, names who runs LeaRN, and uses the glossary's words", () => {
    const page = <TermsPage />;
    render(page);
    expect(screen.getByText(/^Last updated/)).toHaveTextContent("Last updated 3 November 2026");
    expect(
      screen.getByText(/operated by Tanner Nielson, a sole proprietor doing business as LeaRN/),
    ).toBeInTheDocument();
    expectGlossaryWording(renderToStaticMarkup(page));
    expect(termsMetadata.title).toBe("Terms of Service");
  });
});

describe("/privacy (#522)", () => {
  it.each([
    "Supabase",
    "Vercel",
    "Stripe",
    "Resend",
    "Sentry",
    "Anthropic",
    "Cloudflare",
    "GitHub",
  ])("names %s among the service providers", (name) => {
    render(<PrivacyPage />);
    const providers = screen.getByRole("region", { name: "Who we share it with" });
    expect(
      within(providers)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toContain(name);
  });

  it("says what it does not do, and claims no certification", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("We do not sell personal data");
    expect(text).toContain("There are no advertising, analytics or tracking cookies.");
    expect(text).toContain("does not claim HIPAA compliance");
    expect(text).not.toMatch(/SOC ?2|HIPAA[- ]compliant|certified/i);
  });

  it("has the sections schools and the issue ask for", () => {
    render(<PrivacyPage />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    for (const heading of [
      "What we collect",
      "How we use it",
      "Who can see your data in LeaRN",
      "Who we share it with",
      "How long we keep it, and deleting it",
      "Security",
      "Adults only",
      "No real patient data",
      "For schools",
      "Accessibility",
      "Changes to this policy",
      "Contact",
    ]) {
      expect(headings).toContain(heading);
    }
    expect(screen.getByRole("region", { name: "For schools" })).toHaveTextContent(
      /data privacy agreement/,
    );
    expect(screen.getByRole("region", { name: "Accessibility" })).toHaveTextContent("WCAG 2.1 AA");
  });

  it("dates itself and uses the glossary's words", () => {
    const page = <PrivacyPage />;
    render(page);
    expect(screen.getByText(/^Last updated/)).toHaveTextContent("Last updated 3 November 2026");
    expectGlossaryWording(renderToStaticMarkup(page));
    expect(privacyMetadata.title).toBe("Privacy Policy");
  });
});
