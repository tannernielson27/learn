"use client";

import type { ReactNode } from "react";
import { SignedInAs } from "@/components/auth/SignedInAs";
import { TeacherNav } from "@/components/authoring/TeacherNav";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { AccountMenu, AccountMenuPanel, MENU_ITEM_CLASSES } from "@/components/ui/AccountMenu";
import { AppShell } from "@/components/ui/AppShell";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { bannerFixture } from "@/lib/billing/bannerFixtures";
import { accountInitials } from "@/lib/ui/initials";

/** Who is signed in, for the specimens: fictional people, never a session. */
const TEACHER = { displayName: "Chidinma Okonkwo", email: "c.okonkwo@nursing.example" };
const STUDENT = { displayName: null, email: "mia.chen@student.example" };

const PHONE = "w-full max-w-[375px]";

function noSignOut() {}

function MenuLinks() {
  return (
    <>
      <a href="#account" className={MENU_ITEM_CLASSES}>
        Account
      </a>
      <a href="#help" className={MENU_ITEM_CLASSES}>
        Help
      </a>
    </>
  );
}

function Menu({ who }: { who: typeof TEACHER | typeof STUDENT }) {
  const name = who.displayName ?? who.email;
  return (
    <AccountMenu
      name={name}
      initials={accountInitials(name)}
      identity={<SignedInAs displayName={who.displayName} email={who.email} />}
      signOut={noSignOut}
      links={<MenuLinks />}
    />
  );
}

/** One specimen: a caption, and the shell in a frame of the width it is shown at. */
function Specimen({
  caption,
  frame,
  children,
  id,
}: {
  caption: string;
  frame: "phone" | "desktop";
  children: ReactNode;
  id: string;
}) {
  const shell = (
    <div
      data-testid={id}
      className={`relative flex flex-col overflow-hidden rounded-md border border-line bg-surface-0 ${
        frame === "phone" ? PHONE : "min-w-[64rem]"
      }`}
    >
      {children}
    </div>
  );
  return (
    <figure className="grid min-w-0 gap-2">
      <figcaption className="text-sm font-semibold text-ink-2">{caption}</figcaption>
      {/* The desktop frame is 1024px whatever the window, so a phone scrolls it, not the page. */}
      {frame === "desktop" ? <div className="min-w-0 overflow-x-auto pb-1">{shell}</div> : shell}
    </figure>
  );
}

function TeacherPage() {
  return (
    <PageHeader
      level={2}
      title="Library"
      lead="Your quizzes and folders."
      action={<Button>New quiz</Button>}
    />
  );
}

function StudentPage() {
  return <PageHeader level={2} title="Your classes" lead="Join a class with its join code." />;
}

/**
 * The app's frame in each state docs/04 §11 asks for, drawn from fixtures: teacher and student,
 * the account menu closed and open, the phone navigation (scrolled to the current link) and the
 * desktop one, and with and without the billing notice. Each specimen is the real `AppShell`
 * without its landmarks; it follows its frame's width, as a page follows the window's.
 */
export function AppShellSpecimens() {
  return (
    <div className="mt-8 grid gap-12">
      <section aria-labelledby="shell-phone" className="grid gap-6">
        <h2 id="shell-phone" className="text-lg font-semibold">
          Phone, 375px
        </h2>
        <p className="max-w-prose text-sm text-ink-2">
          One 64px bar of the wordmark and the account button, then the navigation as one 44px row
          that scrolls sideways. The row fades at its right edge when there is more.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <Specimen caption="Teacher, library current" frame="phone" id="shell-teacher-phone">
            <AppShell
              landmarks={false}
              homeHref="#library"
              width="wide"
              nav={<TeacherNav currentPath="/author" label="Main, teacher on a phone" />}
              account={<Menu who={TEACHER} />}
            >
              <TeacherPage />
            </AppShell>
          </Specimen>
          <Specimen
            caption="Teacher, scrolled to Workspace, the current link"
            frame="phone"
            id="shell-teacher-phone-scrolled"
          >
            <AppShell
              landmarks={false}
              homeHref="#library"
              width="wide"
              nav={
                <TeacherNav
                  currentPath="/author/workspace"
                  label="Main, teacher on a phone, scrolled"
                />
              }
              account={<Menu who={TEACHER} />}
            >
              <PageHeader level={2} title="Workspace" />
            </AppShell>
          </Specimen>
          <Specimen caption="Teacher, account menu open" frame="phone" id="shell-menu-open">
            <AppShell
              landmarks={false}
              homeHref="#library"
              width="wide"
              nav={<TeacherNav currentPath="/author" label="Main, teacher with the menu open" />}
              account={<Menu who={TEACHER} />}
            >
              <TeacherPage />
              {/* The panel as it opens under the bar; on a page it is the popover's top layer. */}
              <div className="h-72" />
            </AppShell>
            <div className="absolute top-16 right-4 z-10 max-w-[calc(100%-2rem)]">
              <AccountMenuPanel
                name={TEACHER.displayName}
                identity={<SignedInAs {...TEACHER} />}
                signOut={noSignOut}
                links={<MenuLinks />}
              />
            </div>
          </Specimen>
          <Specimen caption="Student, account menu closed" frame="phone" id="shell-student-phone">
            <AppShell
              landmarks={false}
              homeHref="#classes"
              width="full"
              account={<Menu who={STUDENT} />}
            >
              <StudentPage />
            </AppShell>
          </Specimen>
          <Specimen
            caption="Teacher, with the billing notice"
            frame="phone"
            id="shell-notice-phone"
          >
            <AppShell
              landmarks={false}
              homeHref="#library"
              width="wide"
              nav={<TeacherNav currentPath="/author" label="Main, teacher with a notice" />}
              notice={<BillingBanner banner={bannerFixture("trial-ending")} />}
              account={<Menu who={TEACHER} />}
            >
              <TeacherPage />
            </AppShell>
          </Specimen>
        </div>
      </section>

      <section aria-labelledby="shell-desktop" className="grid gap-6">
        <h2 id="shell-desktop" className="text-lg font-semibold">
          Desktop, 1024px and wider
        </h2>
        <p className="max-w-prose text-sm text-ink-2">
          The navigation sits beside the wordmark on the bar&apos;s one row. The content column is
          centred with the same gutters, whatever width the page asks for.
        </p>
        <Specimen caption="Teacher, without a notice" frame="desktop" id="shell-teacher-desktop">
          <AppShell
            landmarks={false}
            homeHref="#library"
            width="wide"
            nav={<TeacherNav currentPath="/author/classes" label="Main, teacher on a desktop" />}
            account={<Menu who={TEACHER} />}
          >
            <PageHeader level={2} title="Classes" action={<Button>New class</Button>} />
          </AppShell>
        </Specimen>
        <Specimen
          caption="Teacher, with the billing notice"
          frame="desktop"
          id="shell-notice-desktop"
        >
          <AppShell
            landmarks={false}
            homeHref="#library"
            width="wide"
            nav={
              <TeacherNav currentPath="/author" label="Main, teacher on a desktop with a notice" />
            }
            notice={<BillingBanner banner={bannerFixture("payment-failed")} />}
            account={<Menu who={TEACHER} />}
          >
            <TeacherPage />
          </AppShell>
        </Specimen>
        <Specimen caption="Student" frame="desktop" id="shell-student-desktop">
          <AppShell
            landmarks={false}
            homeHref="#classes"
            width="reading"
            account={<Menu who={STUDENT} />}
          >
            <StudentPage />
          </AppShell>
        </Specimen>
      </section>
    </div>
  );
}
