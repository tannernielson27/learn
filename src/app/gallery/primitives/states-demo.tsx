"use client";

import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { ContentsNav } from "@/components/ui/ContentsNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonPage } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { TextLink } from "@/components/ui/TextLink";

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost"];
const SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];

/**
 * Hover, pressed and focus-visible held still for the eye and the screenshot: the classes each
 * state adds when it is real (`Button`'s variants, the `press` sink, the global focus ring). The
 * rest, disabled and busy rows are the real thing.
 */
const HELD: Record<"hover" | "pressed" | "focus-visible", Record<ButtonVariant, string>> = {
  hover: { primary: "bg-accent-ink", secondary: "bg-surface-2", ghost: "bg-accent-soft" },
  pressed: {
    primary: "bg-accent-ink scale-(--press-scale)",
    secondary: "bg-surface-2 scale-(--press-scale)",
    ghost: "bg-accent-soft scale-(--press-scale)",
  },
  "focus-visible": {
    primary: "outline-2 outline-offset-2 outline-accent",
    secondary: "outline-2 outline-offset-2 outline-accent",
    ghost: "outline-2 outline-offset-2 outline-accent",
  },
};

const STATES = ["rest", "hover", "pressed", "focus-visible", "disabled", "busy"] as const;

const LABELS: Record<ButtonVariant, string> = {
  primary: "Save",
  secondary: "Add 15 seconds",
  ghost: "Skip",
};

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-sm font-semibold text-ink-2">{label}</h3>
      {children}
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={`gallery-${title.toLowerCase().replace(/\s+/g, "-")}`} className="mt-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      {lead ? <p className="mt-1 max-w-prose text-sm text-ink-2">{lead}</p> : null}
      <div className="mt-4 grid gap-8">{children}</div>
    </section>
  );
}

/** A frame that stands for a page, so a whole-page state reads as one. */
function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-line bg-surface-0 p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ButtonLadder() {
  return (
    <Section
      title="Button"
      lead="Primary, secondary and ghost at every size, then every state. Busy keeps its label and its width; its mark fills once and holds."
    >
      <Example label="Sizes: sm, md, lg">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {LABELS[variant]}
              </Button>
            ))}
          </div>
        ))}
      </Example>
      {STATES.map((state) => (
        <Example
          key={state}
          label={state === "rest" ? "Rest" : state[0]!.toUpperCase() + state.slice(1)}
        >
          <div className="flex flex-wrap items-center gap-3">
            {VARIANTS.map((variant) => (
              <Button
                key={variant}
                variant={variant}
                disabled={state === "disabled"}
                busy={state === "busy"}
                className={state in HELD ? HELD[state as keyof typeof HELD][variant] : ""}
              >
                {LABELS[variant]}
              </Button>
            ))}
          </div>
        </Example>
      ))}
    </Section>
  );
}

export function FieldStates() {
  return (
    <Section
      title="Field"
      lead="An error is the strong ink edge, an alert mark and the words under the field, linked to it. Never feedback red: red only ever marks an answer."
    >
      <div className="grid max-w-xl gap-6">
        <Field label="Empty" />
        <Field label="Filled" defaultValue="Ada Brennan" />
        <Field
          label="Focus-visible"
          defaultValue="Ada"
          inputClassName="border-accent outline-2 outline-offset-2 outline-accent"
        />
        <Field label="Disabled" disabled defaultValue="Ada Brennan" />
        <Field label="Read-only" readOnly defaultValue="V96RN8" appearance="code" />
        <Field label="Your name" hint="Your teacher sees this on the class roster." />
        <Field
          label="Email address"
          type="email"
          defaultValue="ada@"
          hint="Your school address."
          error="Enter an email address, like name@school.edu."
        />
        <Field label="Join code" appearance="code" defaultValue="V96RN" error="Check the code." />
      </div>
    </Section>
  );
}

/** #568: the box for a few lines of writing, on the same field states as `Field`. */
export function TextareaStates() {
  return (
    <Section
      title="Textarea"
      lead="A few lines of writing, with the same edges, focus and error as a field. It grows taller when dragged, never wider."
    >
      <div className="grid max-w-xl gap-6">
        <Textarea label="Empty" rows={3} />
        <Textarea
          label="Filled"
          rows={3}
          defaultValue={"The live session froze on question 3.\nI pressed Next twice."}
        />
        <Textarea
          label="Focus-visible"
          rows={3}
          textareaClassName="border-accent outline-2 outline-offset-2 outline-accent"
        />
        <Textarea label="Disabled" rows={3} disabled defaultValue="Sent." />
        <Textarea
          label="What happened?"
          rows={3}
          hint="We will include the reference 1234567890."
          defaultValue="broken"
          error="Tell us a little more: at least 10 characters."
        />
      </div>
    </Section>
  );
}

export function NoticeStates() {
  return (
    <Section
      title="Notice"
      lead="Both neutral. A status is a quiet panel; an alert adds the strong rule and an alert mark, so it never reads as calm."
    >
      <div className="grid max-w-xl gap-4">
        <Notice>Your answers are saved as you go.</Notice>
        <Notice title="Reconnecting">Stay on this page. Your answer is kept.</Notice>
        <Notice role="alert">Your changes were not saved.</Notice>
        <Notice
          role="alert"
          title="Payment failed"
          action={<TextLink href="/gallery/primitives">Update your card</TextLink>}
        >
          Your card was declined. Live sessions stay open until the end of the week.
        </Notice>
        <Notice
          title="Students are still joining"
          action={
            <Button size="sm" variant="secondary">
              Start anyway
            </Button>
          }
        >
          18 of 24 are in.
        </Notice>
      </div>
    </Section>
  );
}

export function PageHeaderStates() {
  return (
    <Section
      title="Page header"
      lead="The title in the display serif. A long title wraps anywhere it must, so a 320px phone never scrolls sideways."
    >
      <Example label="Title only">
        <Frame>
          <PageHeader level={2} title="Library" />
        </Frame>
      </Example>
      <Example label="With a lead">
        <Frame>
          <PageHeader
            level={2}
            title="Reports"
            lead="Every live session and assignment, newest first."
          />
        </Frame>
      </Example>
      <Example label="With a main action">
        <Frame>
          <PageHeader
            level={2}
            title="Library"
            lead="Every quiz you have made."
            action={<Button variant="primary">New quiz</Button>}
          />
        </Frame>
      </Example>
      <Example label="With a back link">
        <Frame>
          <PageHeader
            level={2}
            title="Week 3 cardiac"
            back={{ href: "/gallery/primitives", label: "Back to the library" }}
            action={<Button variant="primary">Start a live session</Button>}
          />
        </Frame>
      </Example>
      <Example label="Long title at 320px">
        <Frame className="max-w-80">
          <PageHeader
            level={2}
            title="Postoperativehipreplacementcomplications and fluid balance, week 11"
            back={{ href: "/gallery/primitives", label: "Back to the library" }}
            action={<Button variant="primary">Start a live session</Button>}
          />
        </Frame>
      </Example>
      <Example label="Back link on its own">
        <BackLink href="/gallery/primitives">Back to live sessions</BackLink>
      </Example>
    </Section>
  );
}

export function EmptyStates() {
  return (
    <Section
      title="Empty state"
      lead="First use: nothing has been made yet, so say what goes here and offer the next step. No results: a filter or a search hid everything, so say so and offer to clear it."
    >
      <Example label="First use">
        <EmptyState
          level={4}
          heading="No quizzes yet"
          body="A quiz holds the questions you run live or assign."
          action={{ href: "/gallery/primitives", label: "Create a quiz" }}
        />
      </Example>
      <Example label="No results, from a search">
        <EmptyState
          variant="no-results"
          heading="No quizzes match “cardiac”."
          action={{ href: "/gallery/primitives", label: "Clear search" }}
        />
      </Example>
      <Example label="No results, from a filter">
        <EmptyState
          variant="no-results"
          heading="No students match these filters."
          onClear={() => {}}
        />
      </Example>
    </Section>
  );
}

export function LoadingStates() {
  return (
    <Section
      title="Loading"
      lead="A skeleton in the shape of the page, labelled for screen readers by one status line. Nothing pulses."
    >
      <Example label="Header and a list">
        <Frame>
          <SkeletonPage label="Loading the library" shape="list" action rows={4} />
        </Frame>
      </Example>
      <Example label="Header and a table">
        <Frame>
          <SkeletonPage label="Loading the report" shape="table" rows={4} />
        </Frame>
      </Example>
    </Section>
  );
}

export function ErrorStates() {
  return (
    <Section
      title="Error"
      lead="In place of a page that could not be shown. Neutral notice colours, never feedback red. On a real page the heading is the h1 and takes focus."
    >
      <Example label="Could not load">
        <Frame>
          <ErrorState
            kind="load"
            level={3}
            headline="The report could not be shown."
            detail="The answers are saved."
            onRetry={() => {}}
            digest="2861533018"
          >
            <TextLink href="/gallery/primitives">Back to live sessions</TextLink>
          </ErrorState>
        </Frame>
      </Example>
      <Example label="Not found">
        <Frame>
          <ErrorState kind="not-found" level={3}>
            <TextLink href="/gallery/primitives">Go to the home page</TextLink>
          </ErrorState>
        </Frame>
      </Example>
      <Example label="No access">
        <Frame>
          <ErrorState kind="no-access" level={3}>
            <TextLink href="/gallery/primitives">Back to the library</TextLink>
          </ErrorState>
        </Frame>
      </Example>
    </Section>
  );
}

export function ContentsStates() {
  return (
    <Section
      title="Contents"
      lead="The legal pages and the help guides share one list: numbered, ink rather than blue, sticky beside the text from 1024px."
    >
      <div className="max-w-xs">
        <ContentsNav
          label="On this page"
          labelId="gallery-contents-label"
          entries={[
            {
              id: "gallery-button",
              title: "Button",
              children: [
                { id: "gallery-field", title: "Field" },
                { id: "gallery-notice", title: "Notice" },
              ],
            },
            { id: "gallery-page-header", title: "Page header" },
            { id: "gallery-empty-state", title: "Empty state" },
            { id: "gallery-error", title: "Error" },
          ]}
        />
      </div>
    </Section>
  );
}
