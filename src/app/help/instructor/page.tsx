import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpFigure } from "@/components/help/HelpFigure";
import { HELP_FIGURES } from "@/lib/help/itemGuide";

export const metadata: Metadata = { title: "Instructor guide" };

function Step({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-ink-1">
        {title}
      </h2>
      <div className="measure mt-3 flex flex-col gap-3 text-ink-1">{children}</div>
    </section>
  );
}

/** A control's name as it appears on screen. */
function Ui({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

export default function InstructorGuide() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl">
          Instructor guide
        </h1>
        <p className="measure mt-3 text-lg text-ink-2">
          Running a class on LeaRN, in the order you will need it. For how each item format works
          and is scored, see the{" "}
          <Link href="/help/items" className="text-accent-ink underline underline-offset-4">
            item guide
          </Link>
          .
        </p>
      </header>

      <Step id="sign-in" title="Sign in">
        <p>
          Open <Ui>Sign in</Ui>, type your email address and press <Ui>Email me a sign-in link</Ui>.
          Open the link in that email. There is no password.
        </p>
        <p>
          Accounts are by invitation. Whoever runs your LeaRN adds you as an instructor; an account
          without that role sees “No access yet”. The form answers the same way whether or not an
          address has an account, so if no email arrives, check the spelling with them.
        </p>
      </Step>

      <Step id="banks" title="Make or import a bank">
        <p>
          A bank holds your items and case studies. On the author home, type a <Ui>Bank name</Ui>{" "}
          and press <Ui>Create bank</Ui>.
        </p>
        <List>
          <li>Sort a large bank into folders, tag items, and search by text or tag.</li>
          <li>
            To bring items in, choose one or more LeaRN JSON files, or paste JSON, pick a folder
            under <Ui>Import into</Ui>, and press <Ui>Import</Ui>. Imported items arrive as drafts,
            and a file that fails is reported without stopping the others.
          </li>
        </List>
      </Step>

      <Step id="items" title="Write items">
        <p>
          In a bank, press <Ui>New item</Ui> and pick a format. Write the question stem, the choices
          and the answer, then the rationale: why the answer is right.
        </p>
        <List>
          <li>
            <Ui>Save draft</Ui> keeps your work. Only published items go into live sessions,
            assignments and practice, so press <Ui>Publish</Ui> when an item is ready. Publishing
            needs a general rationale; the editor lists anything missing under{" "}
            <Ui>Problems to fix</Ui>.
          </li>
          <li>
            Quality warnings, such as a select-all-that-apply item with every option correct, are
            advice and never block you.
          </li>
          <li>
            Every item keeps its version history, and can be duplicated, archived and restored.
          </li>
          <li>
            For a six-step case study, press <Ui>New case study</Ui>, write the patient record, and
            add one item for each clinical judgment step.
          </li>
        </List>
      </Step>

      <Step id="classes" title="Make a class and invite students">
        <p>
          From the author home, open <Ui>Classes</Ui>, type a <Ui>Class name</Ui> and press{" "}
          <Ui>Create class</Ui>. The class page shows an invite link and its QR code.
        </p>
        <List>
          <li>
            Share the link. A student opens it, types an email address and opens the sign-in link
            that arrives. They then appear on the roster.
          </li>
          <li>
            Set the class’s time zone on the class page, so open and close times show in your local
            time.
          </li>
          <li>
            A student you remove cannot rejoin with the link they have. To stop the link working for
            everyone, replace it.
          </li>
        </List>
      </Step>

      <Step id="assign" title="Assign take-home work">
        <p>
          In a bank or a case study, press <Ui>Assign</Ui>. Choose the class, when it opens and
          closes, and how many attempts each student has: 1 by default, up to 3, and the best
          attempt counts. <Ui>Shuffle answer options</Ui> reorders options per student where the
          format allows it.
        </p>
        <List>
          <li>
            Students see it under <Ui>Open assignments</Ui> on their home. Answers save as they go,
            and they can resume on any device.
          </li>
          <li>
            Scores, answers and rationales stay hidden from students until the assignment closes. An
            attempt still open at the close is submitted with what it saved.
          </li>
          <li>Once an assignment has closed, its close time cannot move.</li>
          <li>
            When email is set up for your site, students get a reminder when it opens and a day
            before it closes. Anyone who has already submitted is skipped.
          </li>
        </List>
      </Step>

      <Step id="live" title="Run a live session">
        <p>
          In a bank or a case study, choose <Ui>Instructor-paced</Ui> or <Ui>Student-paced</Ui> and
          press <Ui>Start a live session</Ui>. Put the lobby on the projector: students open{" "}
          <Ui>Join</Ui>, type the six-character code or scan the QR code, and give a display name.
          They need no account. Set <Ui>Time per item</Ui> if you want a timer, then press{" "}
          <Ui>Start session</Ui>.
        </p>
        <List>
          <li>
            <Ui>Instructor-paced:</Ui> you move the room. Results build as students answer, with
            nothing marked correct, so the screen is safe to project. <Ui>Hide results</Ui> takes
            them off the screen. <Ui>Show answer</Ui> sends the key and rationale to every phone.
            Press <Ui>Next item</Ui>, or pick any item on the strip to skip ahead or go back.
          </li>
          <li>
            <Ui>Student-paced:</Ui> each phone moves through the set alone, and you watch a progress
            board. <Ui>Show answers</Ui> opens every item’s key at once.
          </li>
          <li>When the timer runs out the item stops taking answers; the room does not move on.</li>
          <li>
            Press <Ui>End session</Ui> when you are done.
          </li>
        </List>
        <HelpFigure
          figure={HELP_FIGURES.liveResults}
          caption="Live results before the answer is shown: counts and percentages, with nothing marked correct."
        />
      </Step>

      <Step id="reports" title="Read the reports">
        <List>
          <li>
            <Ui>Live sessions:</Ui> press <Ui>Open the report</Ui> after ending a session. Past
            sessions are listed under <Ui>Live sessions and reports</Ui> on the author home.
          </li>
          <li>
            <Ui>Assignments:</Ui> <Ui>View progress</Ui> shows who has started and submitted while
            the assignment is open, with no scores. <Ui>View report</Ui> has the scores after it
            closes.
          </li>
          <li>
            Each report can be read by <Ui>Students</Ui>, <Ui>Items</Ui> and <Ui>CJMM steps</Ui>,
            and <Ui>Download CSV</Ui> exports it.
          </li>
        </List>
      </Step>

      <Step id="practice" title="Share a bank for practice">
        <p>
          Practice lets students answer a bank on their own, seeing the answer and rationale right
          after each item. Open the bank’s <Ui>Practice</Ui> section, choose{" "}
          <Ui>Share for practice</Ui> and pick a class. Students find it under <Ui>Practice</Ui> on
          their home.
        </p>
        <List>
          <li>
            <Ui>Stop sharing</Ui> closes practice at once, including runs already started.
          </li>
          <li>
            Students in that class can see the answers to a shared bank’s items, so do not grade
            them on those items. If you assign from a shared bank, the form warns you how many of
            its items the class can see the answers to in practice.
          </li>
        </List>
      </Step>
    </article>
  );
}
