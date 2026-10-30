import type { Metadata } from "next";
import { LegalDocument, LegalList, type LegalSection } from "@/components/site/LegalDocument";
import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import { SUPPORT_EMAIL, SUPPORT_MAILTO, TERMS_PATH } from "@/lib/site/links";
import { PROVIDERS } from "@/lib/site/providers";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What LeaRN collects, why, who it is shared with, how long it is kept, and how to ask for it " +
    "to be deleted.",
};

const MAIL = (
  <a href={SUPPORT_MAILTO} className={textLinkClasses({ kind: "inline" })}>
    {SUPPORT_EMAIL}
  </a>
);

const SECTIONS: readonly LegalSection[] = [
  {
    id: "what-we-collect",
    heading: "What we collect",
    body: (
      <LegalList>
        <li>
          <strong className="font-semibold">Account details:</strong> your name, email address, a
          scrambled form of your password, whether you teach or study, and when you sign in.
        </li>
        <li>
          <strong className="font-semibold">Workspace and class data:</strong> workspace names, the
          teachers in a workspace, classes and who is in them, and invitations, which include the
          invited email address.
        </li>
        <li>
          <strong className="font-semibold">Quizzes:</strong> the quizzes, questions and case
          studies teachers write, and documents uploaded for AI import.
        </li>
        <li>
          <strong className="font-semibold">Answers and scores:</strong> what students answer in
          assignments, practice and live sessions, with their scores and times.
        </li>
        <li>
          <strong className="font-semibold">Live session names:</strong> the display name someone
          types to join a live session with a join code. No account is needed for that.
        </li>
        <li>
          <strong className="font-semibold">Billing details:</strong> for a workspace that
          subscribes, Stripe&apos;s customer and subscription references, the billing email, the
          subscription&apos;s status and dates. Stripe holds the card itself.
        </li>
        <li>
          <strong className="font-semibold">Technical data:</strong> IP addresses, used to limit
          repeated sign-in attempts and wrong codes, and error reports when something breaks.
        </li>
      </LegalList>
    ),
  },
  {
    id: "how-we-use-it",
    heading: "How we use it",
    body: (
      <>
        <p>
          Only to provide LeaRN: to sign you in, show teachers their quizzes and their
          students&apos; results, show students their own results, send the emails LeaRN sends, take
          payment, keep the service secure and fix what breaks.
        </p>
        <p>
          We do not sell personal data, we do not show advertising, and we do not use your data to
          train AI models. LeaRN uses no analytics or advertising trackers.
        </p>
      </>
    ),
  },
  {
    id: "who-sees-it",
    heading: "Who can see your data in LeaRN",
    body: (
      <>
        <p>
          Teachers in a workspace can see its classes, the names and email addresses of the students
          in them, and those students&apos; answers and scores, and can download them as a
          spreadsheet. A student&apos;s results are visible to every teacher in that workspace, not
          only the one who made the class.
        </p>
        <p>
          Teachers in a workspace can see each other&apos;s names and email addresses. Students see
          their own results and never another student&apos;s.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    heading: "Who we share it with",
    body: (
      <>
        <p>
          We share data only with the service providers that run LeaRN for us, only what each one
          needs, and under their own terms and privacy commitments:
        </p>
        <dl className="flex flex-col divide-y divide-line border-y border-line">
          {PROVIDERS.map((provider) => (
            <div key={provider.name} className="py-3">
              <dt className="font-semibold">{provider.name}</dt>
              <dd className="mt-1 text-ink-2">{provider.does}</dd>
            </div>
          ))}
        </dl>
        <p>
          We may also share data if the law requires it, or to protect someone&apos;s safety. If
          LeaRN is ever sold or transferred, this policy would continue to apply to your data.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies and storage in your browser",
    body: (
      <>
        <p>LeaRN uses only what it needs to work:</p>
        <LegalList>
          <li>Sign-in cookies from Supabase, which keep you signed in.</li>
          <li>A cookie that remembers you in a live session you joined, for 12 hours.</li>
          <li>A cookie that remembers a teacher hid the Get started list.</li>
          <li>
            Browser storage for your theme, which results a teacher hid on screen, and a
            phone&apos;s answers during a live session.
          </li>
        </LegalList>
        <p>There are no advertising, analytics or tracking cookies.</p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "How long we keep it, and deleting it",
    body: (
      <>
        <p>
          We keep account, workspace and class data, answers and scores while the account or
          workspace exists, so teachers can see results over a course. Live session names and
          answers are kept with the workspace. A workspace whose subscription ends is kept,
          read-only, and nothing in it is deleted for that reason.
        </p>
        <p>
          To delete your account or your data, email {MAIL} from the address on the account. There
          is no delete button yet. We will confirm and do it within 30 days. Some records stay after
          that: payment records we must keep for tax and accounting, and the email address used for
          a free trial, kept so the trial is not taken twice.
        </p>
        <p>
          When a workspace is deleted, its quizzes, classes, live sessions, assignments and practice
          go with it, including the answers and scores students gave in them. Students&apos;
          accounts themselves are kept, and a student can ask us to delete theirs.
        </p>
        <p>
          Documents uploaded for AI import are removed once the import is finished or discarded, or
          after 7 days unused. Encrypted backups are kept for 14 days. IP addresses recorded for
          limits are used for nothing else and are cleared out automatically over time.
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "Security",
    body: (
      <p>
        Data is sent over encrypted connections. Each workspace&apos;s data is walled off from every
        other in the database itself, passwords are stored only in scrambled form, and backups are
        encrypted. No system is perfectly secure; if a breach affects your data, we will tell you as
        the law requires.
      </p>
    ),
  },
  {
    id: "adults-only",
    heading: "Adults only",
    body: (
      <p>
        LeaRN is for people 18 and older, teachers and students alike. We do not knowingly collect
        data from anyone under 18. If you believe a child has an account, email {MAIL} and we will
        delete it.
      </p>
    ),
  },
  {
    id: "no-patient-data",
    heading: "No real patient data",
    body: (
      <p>
        Every patient in LeaRN is fictional. Do not enter real patient information or protected
        health information (PHI) anywhere in LeaRN, including in documents for AI import. LeaRN is
        not built or offered as a system for health information, and does not claim HIPAA
        compliance.
      </p>
    ),
  },
  {
    id: "schools",
    heading: "For schools",
    body: (
      <>
        <p>
          Students&apos; answers and scores may be education records for your school. We treat them
          that way:
        </p>
        <LegalList>
          <li>Teachers decide which students are in their classes and can remove them.</li>
          <li>We use student data only to provide LeaRN to the school, and for nothing else.</li>
          <li>We do not sell it, advertise with it, or build profiles from it.</li>
          <li>We delete it when the school asks, as described above.</li>
        </LegalList>
        <p>We will sign a data privacy agreement with a school on request. Email {MAIL}.</p>
      </>
    ),
  },
  {
    id: "accessibility",
    heading: "Accessibility",
    body: (
      <p>
        LeaRN is designed to meet WCAG 2.1 AA: it works with a keyboard and a screen reader, at
        phone width, and with reduced motion. If something gets in your way, email {MAIL} and we
        will fix it.
      </p>
    ),
  },
  {
    id: "your-choices",
    heading: "Your choices",
    body: (
      <p>
        You can change your name and password on your account page. To get a copy of your data,
        correct it or delete it, email {MAIL}. We answer every request, whatever state or country
        you live in.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        We change the date at the top when we update this policy. For a change that matters, we
        email account holders before it applies.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: <p>Questions about privacy: email {MAIL}.</p>,
  },
];

/**
 * The Privacy Policy (#522). Every claim is checked against the code; see `PROVIDERS` for where.
 * A draft the owner reviews with counsel before billing goes live.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <p>
          This policy says what LeaRN collects when you use it, why, and what you can do about it.
          It goes with the{" "}
          <TextLink href={TERMS_PATH} kind="inline">
            Terms of Service
          </TextLink>
          .
        </p>
      }
      sections={SECTIONS}
    />
  );
}
