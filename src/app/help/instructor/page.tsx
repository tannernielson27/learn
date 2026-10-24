import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HelpFigure } from "@/components/help/HelpFigure";
import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import { HELP_FIGURES } from "@/lib/help/itemGuide";

export const metadata: Metadata = { title: "Teacher guide" };

/**
 * The guide's sections, in the order a teacher needs them. The ids are what other pages link to,
 * so they do not change when a title does: `banks` and `items` are the quiz and question sections.
 */
const SECTIONS = [
  { id: "sign-in", title: "Sign up and sign in" },
  { id: "banks", title: "Create a quiz" },
  { id: "ai-import", title: "Import questions with AI" },
  { id: "items", title: "Write questions" },
  { id: "classes", title: "Create a class and invite students" },
  { id: "assign", title: "Assign a quiz" },
  { id: "live", title: "Start a live session" },
  { id: "reports", title: "Read the reports" },
  { id: "practice", title: "Share a quiz for practice" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const titleOf = (id: SectionId): string => SECTIONS.find((section) => section.id === id)!.title;

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <h2 id={`${id}-title`} className="border-b border-line pb-2 text-xl font-semibold text-ink-1">
        {titleOf(id)}
      </h2>
      <div className="measure mt-3 flex flex-col gap-3 text-ink-1">{children}</div>
    </section>
  );
}

/**
 * One topic inside a section, with an id of its own for a screen to link to. Not a `section`:
 * nineteen more named regions would bury the eight that matter to a screen reader.
 */
function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} data-help-topic className="mt-2 flex scroll-mt-4 flex-col gap-2">
      <h3 className="font-semibold text-ink-1">{title}</h3>
      {children}
    </div>
  );
}

/** A control's name as it appears on screen. */
function Ui({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5">{children}</ol>;
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

function Contents() {
  return (
    <nav aria-label="On this page" className="rounded-md border border-line bg-surface-1 p-4">
      <p className="eyebrow">On this page</p>
      {/* Each a 44px standalone link: the list is a set of targets, not a sentence (WCAG 2.5.8). */}
      <ol className="mt-2 grid list-decimal gap-x-6 pl-5 text-sm marker:text-ink-2 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className={textLinkClasses({ size: "sm" })}>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function InstructorGuide() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 font-read text-display leading-tight text-ink-1">Teacher guide</h1>
        <p className="measure mt-3 text-lg text-ink-2">
          For how each format is scored, see the{" "}
          <TextLink href="/help/items" kind="inline">
            question guide
          </TextLink>
          .
        </p>
      </header>

      <Contents />

      <Section id="sign-in">
        <Topic id="sign-up" title="Create your account">
          <Steps>
            <li>
              Open <Ui>Create an account</Ui> and choose <Ui>I teach</Ui>.
            </li>
            <li>Type your name, your email address and a password.</li>
          </Steps>
          <p>You are signed in at once, in a workspace no other teacher can see.</p>
          <p>
            Confirm your address from the email that follows. It is what lets you back in if you
            forget your password.
          </p>
        </Topic>
        <Topic id="password" title="Sign in, or reset your password">
          <p>
            Open <Ui>Sign in</Ui> and type your email address and password.
          </p>
          <List>
            <li>
              Forgot it? Press <Ui>Forgot your password?</Ui>, then <Ui>Email me a sign-in link</Ui>
              . The link signs you in and asks for a new password.
            </li>
            <li>
              <Ui>Sign in with an emailed link instead</Ui> signs you in without a password.
            </li>
            <li>
              To change your password, open the account menu (your initials, top right), choose{" "}
              <Ui>Account</Ui> and press <Ui>Change your password</Ui>.
            </li>
            <li>
              The account menu also holds <Ui>Help</Ui>, the theme (<Ui>System</Ui>, <Ui>Light</Ui>{" "}
              or <Ui>Dark</Ui>) and <Ui>Sign out</Ui>.
            </li>
            <li>
              If no email arrives, check the spelling. The form never says whether an address has an
              account.
            </li>
          </List>
        </Topic>
        <Topic id="colleagues" title="Share a workspace with colleagues">
          <p>
            To share quizzes, classes and results, work in one workspace. Invite a colleague by
            email from <Ui>Workspace</Ui>. If you are joining theirs, ask for the invitation before
            you sign up.
          </p>
        </Topic>
      </Section>

      <Section id="banks">
        <p>A quiz holds your questions and case studies.</p>
        <Steps>
          <li>
            On your library, under <Ui>New quiz</Ui>, type a name.
          </li>
          <li>
            Press <Ui>Create quiz</Ui>.
          </li>
        </Steps>
        <Topic id="folders" title="Folders, tags and search">
          <p>Sort a large quiz into folders, tag questions, and search by text or tag.</p>
        </Topic>
      </Section>

      <Section id="ai-import">
        <p>
          Claude copies the questions in your documents into a quiz. It never writes an answer or a
          rationale. If a quiz has no <Ui>Import with AI</Ui>, it is not turned on for your
          workspace.
        </p>
        <Steps>
          <li>
            In a quiz, press <Ui>Import with AI</Ui>.
          </li>
          <li>Choose up to 5 documents: PDF, Word .docx, Markdown or text.</li>
          <li>
            Confirm you may use the content and that it has no real patient information, then press{" "}
            <Ui>Upload and read</Ui>.
          </li>
          <li>
            Wait while it reads. You can leave and come back. Then press{" "}
            <Ui>Review the questions</Ui>.
          </li>
        </Steps>
        <Topic id="ai-import-review" title="Review what it found">
          <List>
            <li>
              <Ui>Ready:</Ui> imports as it is.
            </li>
            <li>
              <Ui>Needs an answer:</Ui> the document marks no answer.
            </li>
            <li>
              <Ui>Needs a fix:</Ui> something did not read cleanly. The card says what.
            </li>
            <li>
              <Ui>Not importable:</Ui> not an NGN question, such as a discussion prompt. It is left
              out.
            </li>
          </List>
          <p>
            <Ui>Show source</Ui> puts the document&apos;s words beside the question. <Ui>Drop</Ui>{" "}
            leaves a question out. <Ui>Change type</Ui> reads it again as another format, which uses
            some of the monthly allowance.
          </p>
          <HelpFigure
            figure={HELP_FIGURES.aiImportReview}
            caption="Three questions that each need something before the import."
          />
        </Topic>
        <Topic id="ai-import-fix" title="Add a missing answer">
          <p>
            Press <Ui>Edit</Ui> on the question, mark the answer and press <Ui>Save</Ui>. It is then
            Ready. A case study cannot be edited here: import it and edit it in the quiz, or drop
            it.
          </p>
        </Topic>
        <Topic id="ai-import-finish" title="Import or discard">
          <p>
            Once nothing needs an answer or a fix, <Ui>Import</Ui> adds every kept question to the
            quiz as a draft, all at once. Write a rationale and publish each as usual.{" "}
            <Ui>Discard this import</Ui> keeps nothing. Either way the uploaded files are deleted.
            An import left for 7 days is deleted.
          </p>
        </Topic>
        <Topic id="ai-import-limits" title="Limits">
          <List>
            <li>A missing answer or rationale is flagged for you, never made up.</li>
            <li>Pictures are not imported. A question that needs one is flagged.</li>
            <li>Your workspace has a monthly allowance. The upload page shows what is left.</li>
            <li>One import holds up to 5 files, 100 PDF pages and 150 questions.</li>
          </List>
        </Topic>
      </Section>

      <Section id="items">
        <Steps>
          <li>
            In a quiz, press <Ui>New question</Ui> and pick a format.
          </li>
          <li>Write the question text, the choices and the answer.</li>
          <li>Write the rationale: why the answer is right.</li>
          <li>
            Press <Ui>Save draft</Ui> to keep your work, or <Ui>Publish</Ui> when it is ready.
          </li>
        </Steps>
        <Topic id="publish" title="Drafts and publishing">
          <List>
            <li>Only published questions go into live sessions, assignments and practice.</li>
            <li>
              Publishing needs a general rationale. The editor lists anything missing under{" "}
              <Ui>Problems to fix</Ui>.
            </li>
            <li>
              Quality warnings, such as a select-all-that-apply question with every option correct,
              are advice and never block you.
            </li>
          </List>
        </Topic>
        <Topic id="history" title="History, duplicate and archive">
          <p>
            Every question keeps its version history, and can be duplicated, archived and restored.
          </p>
        </Topic>
        <Topic id="case-studies" title="Case studies">
          <p>
            In a quiz, type a <Ui>Case study title</Ui> and press <Ui>Create case study</Ui>. Then
            write the patient record, and add one question for each of the six clinical judgment
            steps.
          </p>
        </Topic>
      </Section>

      <Section id="classes">
        <Steps>
          <li>
            Open <Ui>Classes</Ui>.
          </li>
          <li>
            Type a <Ui>Class name</Ui> and press <Ui>Create class</Ui>.
          </li>
        </Steps>
        <p>The class page shows an invite link, its QR code and an eight-character class code.</p>
        <Topic id="invite" title="Invite link and QR code">
          <p>
            A student opens the link, types their name and email address and chooses a password.
            They are on the roster at once; confirming their address can wait.
          </p>
        </Topic>
        <Topic id="class-code" title="Class code">
          <p>
            A student who has an account, or creates one first, types it under <Ui>Join a class</Ui>
            . It is two groups of four, so it is not mistaken for a live session&apos;s join code.
          </p>
        </Topic>
        <Topic id="time-zone" title="Time zone">
          <p>Set it on the class page, so open and close times show in your local time.</p>
        </Topic>
        <Topic id="remove" title="Remove a student">
          <p>
            A removed student cannot rejoin with the link or code they have. To stop both working
            for everyone, replace the link: the class code and QR code change too.
          </p>
        </Topic>
      </Section>

      <Section id="assign">
        <Steps>
          <li>
            In a quiz or a case study, press <Ui>Assign</Ui>.
          </li>
          <li>Choose the class, and when the assignment opens and closes.</li>
          <li>
            Choose how many attempts each student has: 1 by default, up to 3. The best attempt
            counts.
          </li>
        </Steps>
        <p>
          <Ui>Shuffle answer options</Ui> reorders options for each student where the format allows
          it.
        </p>
        <Topic id="assign-students" title="What students see">
          <List>
            <li>
              The assignment is under <Ui>Open assignments</Ui> on their home. Answers save as they
              go, and they can resume on any device.
            </li>
            <li>Scores, answers and rationales stay hidden until the assignment closes.</li>
            <li>An attempt still open at the close is submitted with what it saved.</li>
          </List>
        </Topic>
        <Topic id="assign-close" title="Close time">
          <p>Once an assignment has closed, its close time cannot move.</p>
        </Topic>
        <Topic id="reminders" title="Email reminders">
          <p>
            When email is set up for your site, students get a reminder when an assignment opens and
            a day before it closes. Anyone who has already submitted is skipped.
          </p>
        </Topic>
      </Section>

      <Section id="live">
        <Steps>
          <li>
            In a quiz or a case study, choose <Ui>Teacher-paced</Ui> or <Ui>Student-paced</Ui> and
            press <Ui>Start a live session</Ui>.
          </li>
          <li>
            Put the lobby on the projector. Students go to the join page, type the six-character
            join code or scan the QR code, and give a display name. They need no account.
          </li>
          <li>
            For the projector, press <Ui>Open in a new window</Ui> or{" "}
            <Ui>Present on this screen</Ui> in the lobby: that view shows no controls. On this
            screen, Space or the right arrow key takes the next step, and Esc goes back to the
            controls. No key ends the live session: end it from the controls.
          </li>
          <li>
            Set <Ui>Time per question</Ui> if you want a timer, then press <Ui>Start</Ui>.
          </li>
          <li>
            Press <Ui>End live session</Ui> when you are done.
          </li>
        </Steps>
        <Topic id="pacing" title="Teacher-paced and student-paced">
          <List>
            <li>
              <Ui>Teacher-paced:</Ui> you move the class on. Press <Ui>Next question</Ui>, or pick
              any question on the strip to skip ahead or go back.
            </li>
            <li>
              <Ui>Student-paced:</Ui> each phone moves through the quiz alone, and you watch a
              progress board.
            </li>
          </List>
        </Topic>
        <Topic id="live-results" title="Results and answers">
          <List>
            <li>
              Teacher-paced results build as students answer, with nothing marked correct, so the
              screen is safe to project. <Ui>Hide results</Ui> takes them off the screen.
            </li>
            <li>
              <Ui>Show answer</Ui> sends the answer and rationale to every phone. In a student-paced
              live session, <Ui>Show answers</Ui> opens every question&apos;s answer at once.
            </li>
          </List>
          <HelpFigure
            figure={HELP_FIGURES.liveResults}
            caption="Live results before the answer is shown."
          />
        </Topic>
        <Topic id="timer" title="Timer">
          <p>
            When the timer runs out the question stops taking answers. The live session does not
            move on.
          </p>
        </Topic>
      </Section>

      <Section id="reports">
        <List>
          <li>
            <Ui>Live sessions:</Ui> press <Ui>Open the report</Ui> after you end a live session.
            Earlier ones are under <Ui>Live sessions</Ui>.
          </li>
          <li>
            <Ui>Assignments:</Ui> <Ui>View progress</Ui> shows who has started and submitted while
            the assignment is open, with no scores. <Ui>View report</Ui> has the scores after it
            closes.
          </li>
          <li>
            Read a report by <Ui>Students</Ui>, <Ui>Questions</Ui> or{" "}
            <Ui>Clinical judgment steps</Ui>. <Ui>Download CSV</Ui> exports it.
          </li>
        </List>
      </Section>

      <Section id="practice">
        <p>
          In practice, students answer a quiz on their own and see the answer and rationale after
          each question. It is not graded.
        </p>
        <Steps>
          <li>
            In the quiz, under <Ui>Practice</Ui>, choose <Ui>Share for practice</Ui>.
          </li>
          <li>Pick a class.</li>
        </Steps>
        <p>
          Students find it under <Ui>Practice</Ui> on their home. <Ui>Stop sharing</Ui> closes it at
          once, including for students part-way through.
        </p>
        <Topic id="practice-answers" title="Practice shows the answers">
          <p>
            Students in that class can see the answers to a shared quiz, so do not grade them on its
            questions. If you assign from it, the form warns you how many answers the class can
            already see.
          </p>
        </Topic>
      </Section>
    </article>
  );
}
