import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * #416: the pages and emails that introduce and explain LeaRN use the glossary's words, and none
 * of the words it retired. Each surface is rendered, and what a person reads or hears on it (text,
 * aria-labels, alt text, page titles, email subjects and bodies) is searched for every retired word.
 *
 * The same renders give each surface's word count. `COPY_WORD_COUNT=<file> pnpm vitest run
 * src/app/introCopy.test.tsx` writes them as a table, which is how the numbers on the PR were made.
 */

const { readViewer, action } = vi.hoisted(() => ({
  readViewer: vi.fn(),
  action: () => async () => ({ status: "idle" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/classes/viewer", () => ({ readViewer }));
vi.mock("@/lib/auth/demoAccount", () => ({
  readDemoAccount: () => ({ email: "demo@learn.example", password: "not-a-real-password" }),
}));
vi.mock("@/lib/auth/turnstile", () => ({
  captchaSiteKey: () => null,
  SIGN_UP_CAPTCHA_ACTION: "sign_up",
}));
vi.mock("./sign-in/actions", () => ({
  requestSignInLink: action(),
  signInAsDemo: action(),
  signInWithEmailPassword: action(),
  verifySignInCode: action(),
}));
vi.mock("./sign-up/actions", () => ({ createAccount: action() }));
vi.mock("./auth/confirm/actions", () => ({ confirmSignIn: action() }));
vi.mock("./welcome/actions", () => ({ setUpWorkspace: action() }));
vi.mock("./author/actions", () => ({ signOut: action() }));
vi.mock("./learn/actions", () => ({ joinClassWithCode: action() }));
// The class code form belongs to the classes pass (#412), which renames it under the same glossary.
vi.mock("@/components/classes/JoinByCodeForm", () => ({ JoinByCodeForm: () => null }));

import { ConfirmEmailBanner } from "@/components/auth/ConfirmEmailBanner";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { Landing } from "@/components/landing/Landing";
import { GetStarted } from "@/components/onboarding/GetStarted";
import { TeacherWelcome } from "@/components/onboarding/TeacherWelcome";
import { landingEntry } from "@/lib/auth/landing";
import { findRetiredTerms, readableStrings, visibleWordCount } from "@/lib/copy/retiredTerms";
import { EMAIL_PREVIEWS } from "@/lib/email/preview";
import { renderMagicLinkTemplate } from "@/lib/email/templates/magicLink";
import { renderWelcomeEmail } from "@/lib/email/templates/welcome";
import { checklistSteps, type OrgProgress } from "@/lib/onboarding/checklist";
import {
  TEACHER_WELCOME_FINISH,
  teacherWelcomeSteps,
  type WelcomeStep,
} from "@/lib/onboarding/teacherWelcome";
import ConfirmPage, { metadata as confirmMetadata } from "./auth/confirm/page";
import HelpLayout from "./help/layout";
import HelpIndex, { metadata as helpMetadata } from "./help/page";
import TeacherGuide, { metadata as teacherGuideMetadata } from "./help/instructor/page";
import QuestionGuide, { metadata as questionGuideMetadata } from "./help/items/page";
import { metadata as landingMetadata } from "./page";
import SignInPage, { metadata as signInMetadata } from "./sign-in/page";
import SignUpPage, { metadata as signUpMetadata } from "./sign-up/page";
import WelcomePage, { metadata as welcomeMetadata } from "./welcome/page";

/** Everything in a piece of HTML that a person reads or hears, as one string. */
const readText = (html: string): string => readableStrings(html).join(" \n ");

/**
 * Words this area also keeps out, beyond the shared list in src/lib/copy/retiredTerms.ts: they
 * come up in prose that explains the product, which the screens' passes rarely have (#416).
 */
const MORE_RETIRED: readonly { say: string; pattern: RegExp }[] = [
  { say: "patient record", pattern: /(?<!\bpatient )\brecords?\b/i },
  { say: "Start a live session", pattern: /\b(?:run|runs|running|ran)\b(?: \w+){0,2} live\b/i },
  {
    say: "New, then Create",
    pattern:
      /\b(?:make|makes|making|made) (?:(?:a|an|your|the|one|new) ){0,2}(?:quiz|quizzes|class|classes|question|questions|case study|case studies|folder|folders)\b/i,
  },
  { say: "assignment", pattern: /\btake-home assignments?\b|\bassign(?:ed)? work\b/i },
];

/** Every retired word in `read`, from the shared list and from this area's own. */
function retired(read: string): string[] {
  const shared = findRetiredTerms(read).map(
    (hit) => `"${hit.found}" (say: ${hit.say}) in "...${hit.context}..."`,
  );
  const more = MORE_RETIRED.flatMap(({ say, pattern }) => {
    const match = pattern.exec(read);
    return match
      ? [
          `"${match[0]}" (say: ${say}) in "...${read.slice(Math.max(0, match.index - 30), match.index + 40)}..."`,
        ]
      : [];
  });
  return [...shared, ...more];
}

/** One surface: what a person reads or hears on it, and the part of that which is counted. */
interface Surface {
  name: string;
  /** Everything read or heard: text, labels, alt text, titles, subjects. */
  read: string;
  /** What is counted: HTML or text. Empty for a surface that is checked but not counted. */
  visible: string;
}

const NO_PARAMS = Promise.resolve({});
const VISITOR = { status: "signed_out" } as const;
const NEWCOMER = {
  status: "signed_in",
  userId: "00000000-0000-4000-8000-0000000000a1",
  email: "sam@learn.example",
  role: null,
  displayName: "Sam Rivera",
} as const;

/** A page's title and description, whichever way its metadata writes the title. */
function titleOf(metadata: { title?: unknown; description?: unknown }): string {
  const { title, description } = metadata;
  const absolute = (title as { absolute?: string } | null | undefined)?.absolute;
  return [typeof title === "string" ? title : (absolute ?? ""), description ?? ""].join(" \n ");
}

/** Renders, reads the page, and takes it down again so the next surface starts clean. */
async function page(
  name: string,
  element: ReactElement,
  title = "",
  act?: () => Promise<unknown>,
): Promise<Surface> {
  const { container } = render(element);
  await act?.();
  const html = container.innerHTML;
  cleanup();
  return { name, read: [title, readText(html)].join(" \n "), visible: html };
}

const text = (name: string, parts: readonly string[]): Surface => ({
  name,
  read: parts.join(" \n "),
  visible: parts.join(" "),
});

const stepsText = (steps: readonly WelcomeStep[], finish: string): string[] => [
  ...steps.flatMap((step) => [step.title, ...step.body]),
  finish,
];

const EMPTY: OrgProgress = { banks: [], hasClass: false, hasAssignmentOrSession: false };
const QUIZ = { id: "00000000-0000-4000-8000-0000000000b1", name: "Cardiac" };
const noop = async () => {};
const idle = async () => ({ status: "idle" }) as const;

/** Fills what the form on screen requires, presses a button, and waits for what it brings up. */
const press = (name: string, then: string) => async () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("input[required]")) {
    if (input.type === "radio") continue;
    const value = input.type === "email" ? "sam@learn.example" : "Sam Rivera 2026";
    fireEvent.change(input, { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name }));
  await screen.findByText(then);
};

const search = (values: Record<string, string>) => ({
  params: NO_PARAMS,
  searchParams: Promise.resolve(values),
});

async function signInPages(): Promise<Surface[]> {
  const signIn = await SignInPage(search({}));
  const title = titleOf(signInMetadata);
  const back = "Sign in with your password instead";
  return [
    await page("Sign in", signIn, title),
    await page("Sign in, forgot password", signIn, title, press("Forgot your password?", back)),
    await page(
      "Sign in, emailed link",
      signIn,
      title,
      press("Sign in with an emailed link instead", back),
    ),
    await page("Sign in, link expired", await SignInPage(search({ error: "link" })), title),
    await page(
      "Sign in, link sent",
      <SignInForm
        action={async () => ({ status: "sent", email: "sam@learn.example" })}
        next="/learn"
        codeAction={idle}
      />,
      "",
      press("Email me a sign-in link", "Check your email"),
    ),
    await page(
      "Finish signing in",
      await ConfirmPage(search({ token_hash: "abc", type: "email", next: "/learn" })),
      titleOf(confirmMetadata),
    ),
  ];
}

async function signUpPages(): Promise<Surface[]> {
  readViewer.mockResolvedValue(VISITOR);
  const title = titleOf(signUpMetadata);
  const signUp = {
    none: await SignUpPage(search({})),
    teacher: await SignUpPage(search({ role: "teacher" })),
    student: await SignUpPage(search({ role: "student" })),
  };
  readViewer.mockResolvedValue(NEWCOMER);
  const welcome = await WelcomePage(search({}));
  const welcomeRetry = await WelcomePage(search({ teach: "1" }));
  return [
    await page("Sign up, nothing chosen", signUp.none, title),
    await page("Sign up, teacher", signUp.teacher, title),
    await page("Sign up, student", signUp.student, title),
    await page(
      "Sign up, account made but not signed in",
      <SignUpForm
        action={async () => ({ status: "created_signed_out", next: "/learn" })}
        initialRole="student"
        classCode={null}
        captchaSiteKey={null}
      />,
      "",
      press("Create account", "Your account is ready"),
    ),
    await page("Welcome", welcome, titleOf(welcomeMetadata)),
    await page("Welcome, workspace not set up", welcomeRetry, titleOf(welcomeMetadata)),
    await page(
      "Confirm your email banner",
      <ConfirmEmailBanner action={idle} email="sam@learn.example" />,
    ),
  ];
}

async function onboardingSurfaces(): Promise<Surface[]> {
  const teacher = teacherWelcomeSteps("Ada");
  return [
    await page(
      "Get started checklist, new workspace",
      <GetStarted steps={checklistSteps(EMPTY)} importSample={idle} hide={noop} />,
    ),
    await page(
      "Get started checklist, with a quiz",
      <GetStarted
        steps={checklistSteps({ ...EMPTY, banks: [QUIZ] })}
        importSample={idle}
        hide={noop}
      />,
    ),
    await page(
      "Teacher welcome, first step as drawn",
      <TeacherWelcome steps={teacher} onDone={noop} focusAfter="x" />,
    ),
    text("Teacher welcome, all steps", stepsText(teacher, TEACHER_WELCOME_FINISH)),
    text(
      "Teacher welcome, invited colleague, all steps",
      stepsText(teacherWelcomeSteps("Ada", { invited: true }), TEACHER_WELCOME_FINISH),
    ),
  ];
}

async function pages(): Promise<Surface[]> {
  return [
    await page("Landing", <Landing entry={landingEntry(VISITOR)} />, titleOf(landingMetadata)),
    ...(["instructor", "student", null] as const).map((role) =>
      text(`Landing, first link when signed in (${role ?? "no role"})`, [
        landingEntry({ status: "signed_in", role }).label,
      ]),
    ),
    ...(await signInPages()),
    ...(await signUpPages()),
    ...(await onboardingSurfaces()),
    await page("Help", <HelpIndex />, titleOf(helpMetadata)),
    await page("Help, navigation", <HelpLayout params={NO_PARAMS}>{null}</HelpLayout>),
    await page("Teacher guide", <TeacherGuide />, titleOf(teacherGuideMetadata)),
    await page("Question guide", <QuestionGuide />, titleOf(questionGuideMetadata)),
  ];
}

function emails(): Surface[] {
  const newcomer = renderWelcomeEmail(
    "newcomer",
    "https://learn.example/auth/confirm?next=%2Fwelcome&token_hash=sample-token-hash&type=email",
  );
  const newcomerBody = newcomer.html.replace(/<title>[\s\S]*?<\/title>/, "");
  const committed = readFileSync(
    path.join(process.cwd(), "supabase", "templates", "magic_link.html"),
    "utf8",
  );
  return [
    ...EMAIL_PREVIEWS.map((preview) => ({
      name: `Email: ${preview.name}`,
      read: [preview.subject, readText(preview.bodyHtml), preview.text ?? ""].join(" \n "),
      visible: `${preview.subject} ${preview.bodyHtml}`,
    })),
    {
      name: "Email: Welcome, no class yet",
      read: [newcomer.subject, readText(newcomer.html), newcomer.text].join(" \n "),
      visible: `${newcomer.subject} ${newcomerBody}`,
    },
    // The sign-in email with Supabase's placeholders in it, and the copy of it that is committed.
    {
      name: "Email: Sign-in link, template",
      read: readText(renderMagicLinkTemplate()),
      visible: "",
    },
    { name: "Email: supabase/templates/magic_link.html", read: readText(committed), visible: "" },
  ];
}

const hits = (surfaces: readonly Surface[]): string[] =>
  surfaces.flatMap((surface) => retired(surface.read).map((hit) => `${surface.name}: ${hit}`));

const counted: Surface[] = [];

afterAll(() => {
  const file = process.env.COPY_WORD_COUNT;
  if (!file) return;
  const rows = counted
    .filter((surface) => surface.visible !== "")
    .map((surface) => `| ${surface.name} | ${visibleWordCount(surface.visible)} |`);
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, ["| Surface | Words |", "| --- | ---: |", ...rows, ""].join("\n"));
});

describe("the words that introduce and explain LeaRN (#416)", () => {
  // The control: the check finds the old wording when a page still carries it, in its text and in
  // a label, so a clean result below means the words are gone and not that nothing was read.
  it("finds a retired word on a rendered page, in text and in a label", async () => {
    const old = await page(
      "control",
      <main>
        <h1>Instructor guide</h1>
        <a href="/author" aria-label="Go to your item banks">
          Home
        </a>
      </main>,
    );
    const found = hits([old]).join("\n");
    expect(found).toContain('control: "Instructor"');
    // "banks" is only in the label, so the label was read.
    expect(found).toContain('control: "banks"');
    expect(retired(readableStrings(old.visible)[0] ?? "").join("\n")).not.toContain('"banks"');
    // This area's own words are caught too.
    expect(retired("Run a quiz live, beside the record.").join("\n")).toContain('"record"');
    expect(retired("Make a class.").join("\n")).toContain('"Make a class"');
  });

  it("has no retired word on any page, label or page title", async () => {
    const all = await pages();
    counted.push(...all);
    // Each state was reached, and each page was read as far as its own words.
    const read = (name: string) => all.find((surface) => surface.name === name)?.read ?? "";
    expect(read("Landing")).toContain("Join a live session");
    expect(read("Landing")).toContain("LeaRN:");
    expect(read("Sign in")).toContain("Use the demo account");
    expect(read("Sign in, link sent")).toContain("Check your email");
    expect(read("Sign up, account made but not signed in")).toContain("Your account is ready");
    expect(read("Welcome, workspace not set up")).toContain("Set up my workspace");
    for (const surface of all) expect(surface.read.trim(), surface.name).not.toBe("");

    expect(hits(all)).toEqual([]);
  });

  it("has no retired word in any email's subject or body", () => {
    const all = emails();
    counted.push(...all);
    expect(all.length).toBeGreaterThanOrEqual(9);
    expect(hits(all)).toEqual([]);
  });
});
