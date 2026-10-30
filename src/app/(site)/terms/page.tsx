import type { Metadata } from "next";
import { LegalDocument, LegalList, type LegalSection } from "@/components/site/LegalDocument";
import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import { PRICING_PATH, PRIVACY_PATH, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using LeaRN: accounts, workspaces, the subscription, refunds, acceptable use " +
    "and your content.",
};

const MAIL = (
  <a href={SUPPORT_MAILTO} className={textLinkClasses({ kind: "inline" })}>
    {SUPPORT_EMAIL}
  </a>
);

/**
 * The Terms of Service (#522). A draft in plain English that the owner reviews with counsel
 * before billing goes live; the assumptions behind it are listed on the pull request. Stripe's
 * account review looks for a section headed "Refunds", so it has one of its own.
 */
const SECTIONS: readonly LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: (
      <p>
        LeaRN is a website for nursing teachers and students to practise for the Next Generation
        NCLEX, at learnursing.app. In these terms, &ldquo;LeaRN&rdquo;, &ldquo;we&rdquo; and
        &ldquo;us&rdquo; mean Tanner Nielson, a sole proprietor doing business as LeaRN in Utah,
        USA. &ldquo;You&rdquo; means the person using LeaRN.
      </p>
    ),
  },
  {
    id: "eligibility",
    heading: "Who can use LeaRN",
    body: (
      <p>
        You must be 18 or older to use LeaRN, whether you are a teacher or a student. By using LeaRN
        you confirm that you are. LeaRN is not meant for children, and we do not knowingly collect
        information from anyone under 18.
      </p>
    ),
  },
  {
    id: "accounts",
    heading: "Your account",
    body: (
      <>
        <p>
          Give your real name and an email address you use. Keep your password to yourself and do
          not share your account. You are responsible for what happens while you are signed in.
        </p>
        <p>If you think someone else has used your account, change your password and email us.</p>
      </>
    ),
  },
  {
    id: "workspaces",
    heading: "Workspaces",
    body: (
      <>
        <p>
          A teacher&apos;s quizzes, classes and results live in a workspace, which up to 10 teachers
          can share. The teacher who started a workspace manages its subscription and billing, and
          agrees to these terms on its behalf as well as their own.
        </p>
        <p>
          Teachers in a workspace can see its quizzes, classes, and their students&apos; answers and
          scores. Students can see their own results, not each other&apos;s.
        </p>
      </>
    ),
  },
  {
    id: "subscription",
    heading: "Subscription and free trial",
    body: (
      <>
        <p>
          A workspace costs $39.99 a month for up to 10 teachers, plus any tax that applies.
          Students never pay. See{" "}
          <TextLink href={PRICING_PATH} kind="inline">
            Pricing
          </TextLink>{" "}
          for the details.
        </p>
        <p>
          A new subscription starts with a 7-day free trial. You enter a card at checkout. When the
          trial ends, the subscription starts on its own and your card is charged, unless you cancel
          before then. There is one free trial per person and per workspace.
        </p>
        <p>
          The subscription renews every month, and your card is charged at the start of each month,
          until you cancel. Payments are processed by Stripe; we never see or store your full card
          number.
        </p>
        <p>
          If a payment fails and is not fixed, or the subscription ends, the workspace becomes
          read-only for teachers. Its content is kept, and assignments that are already open run to
          their close. Subscribing again restores everything.
        </p>
      </>
    ),
  },
  {
    id: "cancellation",
    heading: "Cancellation",
    body: (
      <p>
        The teacher who started the workspace can cancel at any time from Manage billing, in the
        Billing section of the workspace page. The workspace keeps full access until the end of the
        month already paid for, and is not charged again.
      </p>
    ),
  },
  {
    id: "refunds",
    heading: "Refunds",
    body: (
      <>
        <p>
          Payments are not refundable, and we do not give refunds or credits for part of a month,
          for a month in which LeaRN was not used, or for teachers a workspace did not add. When you
          cancel, you keep access until the end of the period you paid for.
        </p>
        <p>
          If you think you were charged by mistake, email {MAIL} within 30 days and we will look
          into it. Nothing in this section limits a right to a refund that the law gives you.
        </p>
      </>
    ),
  },
  {
    id: "price-changes",
    heading: "Price changes",
    body: (
      <p>
        We may change the price. We will email the teacher who manages billing at least 30 days
        before a new price applies, and it applies from the next renewal after that. If you do not
        want to pay the new price, cancel before it applies.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>When you use LeaRN, do not:</p>
        <LegalList>
          <li>
            Enter real patient information or protected health information (PHI). Every patient in
            LeaRN must be fictional.
          </li>
          <li>
            Use LeaRN, or any tool, to cheat: on a licensing exam, on a school&apos;s assessment, or
            by sharing answers to a live session or an assignment while it is open.
          </li>
          <li>
            Copy LeaRN or its content in bulk, scrape it, or reach it with bots or automated scripts
            other than an ordinary web browser.
          </li>
          <li>
            Harass anyone, upload anything unlawful, infringing or harmful, or use a display name
            that impersonates someone else or is offensive.
          </li>
          <li>
            Try to get around limits or security, reach data that is not yours, or put an unfair
            load on the service.
          </li>
        </LegalList>
        <p>We may remove content or suspend an account that breaks these rules.</p>
      </>
    ),
  },
  {
    id: "your-content",
    heading: "Your content",
    body: (
      <>
        <p>
          Teachers own the quizzes, questions, case studies and other material they write or upload.
          Students own their answers. You give us a limited licence to store, copy, process and show
          that content only as needed to run LeaRN for you and the people you share it with. The
          licence ends when the content is removed, except for copies kept in backups for a short
          time.
        </p>
        <p>
          Only upload material you have the right to use. LeaRN itself, its software, design and
          sample content, belongs to us.
        </p>
      </>
    ),
  },
  {
    id: "ai-import",
    heading: "AI import",
    body: (
      <p>
        AI import turns a document you upload into draft questions using an AI model. Its output can
        be wrong, incomplete or worded badly. Teachers must review and correct every imported
        question before using it, and are responsible for what they publish to students. See the{" "}
        <TextLink href={PRIVACY_PATH} kind="inline">
          Privacy Policy
        </TextLink>{" "}
        for what is sent to the AI provider.
      </p>
    ),
  },
  {
    id: "education-only",
    heading: "Educational use only",
    body: (
      <>
        <p>
          LeaRN is a study and teaching tool. It is not medical advice and must not be used to make
          decisions about the care of a real patient. Every patient shown in LeaRN is fictional.
        </p>
        <p>
          LeaRN is not affiliated with, endorsed by or sponsored by the National Council of State
          Boards of Nursing (NCSBN). NCLEX and NCLEX-RN are registered trademarks of NCSBN. Using
          LeaRN does not promise any result on the NCLEX.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    heading: "Availability and warranties",
    body: (
      <p>
        We work to keep LeaRN running and correct, but we provide it &ldquo;as is&rdquo; and
        &ldquo;as available&rdquo;. To the extent the law allows, we disclaim all warranties,
        express or implied, including merchantability, fitness for a particular purpose and
        non-infringement. We do not promise that LeaRN will always be available, free of errors, or
        that questions and rationales are free of mistakes.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <>
        <p>
          To the extent the law allows, we are not liable for indirect, incidental, special,
          consequential or punitive damages, or for lost profits, data or goodwill.
        </p>
        <p>
          Our total liability for any claim about LeaRN is limited to the amount you paid us in the
          12 months before the claim arose. If you paid nothing, it is limited to $50.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    heading: "Ending your use",
    body: (
      <>
        <p>
          You can stop using LeaRN at any time. To close your account, email {MAIL} from the address
          on the account.
        </p>
        <p>
          We may suspend or close an account that breaks these terms, or if we stop offering LeaRN.
          Unless the account broke these terms, we will give notice by email first and a chance to
          export a workspace&apos;s content.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We change the date at the top when we do, and for a change that
        matters we email account holders at least 30 days before it applies. If you keep using LeaRN
        after that, you accept the new terms.
      </p>
    ),
  },
  {
    id: "law",
    heading: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the State of Utah, USA, without regard to its
        conflict-of-law rules. Any dispute about them or about LeaRN will be heard in the courts
        located in Utah County, Utah, and you and we agree to those courts&apos; jurisdiction.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact",
    body: <p>Questions about these terms: email {MAIL}.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between you and LeaRN. By creating an account or using
          LeaRN, you agree to them. Please read them with the{" "}
          <TextLink href={PRIVACY_PATH} kind="inline">
            Privacy Policy
          </TextLink>
          .
        </p>
      }
      sections={SECTIONS}
    />
  );
}
