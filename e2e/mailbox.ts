// Reads the newest sign-in email for an address from the local Supabase stack's test mailbox
// (Mailpit on port 55324, see supabase/config.toml). Local and CI only: previews send real email.
import { expect, type APIRequestContext, type Page } from "@playwright/test";

const MAILBOX_URL = process.env.SUPABASE_MAILBOX_URL ?? "http://127.0.0.1:55324";
// Docker's clock and the host's can disagree by a second or two.
const CLOCK_SKEW_MS = 5_000;

interface MailpitSummary {
  ID: string;
  Created: string;
  Subject: string;
}

export interface ReceivedEmail {
  subject: string;
  /** The HTML part, or the text part if there is no HTML. */
  body: string;
  /** The plain-text part, empty when the message has none. */
  text: string;
}

/** The newest sign-in email for `email` sent since `since`, as HTML (or text, if no HTML). */
async function latestSignInEmail(
  request: APIRequestContext,
  email: string,
  since: Date,
): Promise<string> {
  return (await latestEmail(request, email, since)).body;
}

/**
 * The newest email of any kind for `email` sent since `since`, such as the welcome email (#360).
 *
 * With `subject`, only an email with exactly that subject line. An address that signed up and was
 * then invited holds two emails seconds apart, inside the clock skew allowed for below, so "the
 * newest since" alone could hand back the welcome while the invitation is still on its way.
 */
export async function latestEmail(
  request: APIRequestContext,
  email: string,
  since: Date,
  subject?: string,
): Promise<ReceivedEmail> {
  let received: ReceivedEmail | undefined;
  await expect
    .poll(
      async () => {
        const list = await request.get(`${MAILBOX_URL}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const { messages } = (await list.json()) as { messages: MailpitSummary[] };
        const fresh = messages.find(
          (message) =>
            new Date(message.Created).getTime() >= since.getTime() - CLOCK_SKEW_MS &&
            (subject === undefined || message.Subject === subject),
        );
        if (!fresh) return undefined;
        const message = await request.get(`${MAILBOX_URL}/api/v1/message/${fresh.ID}`);
        const { HTML, Text, Subject } = (await message.json()) as {
          HTML: string;
          Text: string;
          Subject: string;
        };
        received = { subject: Subject, body: HTML || Text, text: Text ?? "" };
        return received.body;
      },
      {
        timeout: 15_000,
        message: `no email${subject ? ` "${subject}"` : ""} arrived for ${email}`,
      },
    )
    .toBeTruthy();
  return received!;
}

/** The `/auth/confirm` link in an email body, with its HTML-escaped ampersands undone. */
export function confirmLinkIn(body: string, email: string): string {
  const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/)?.[0];
  expect(link, `the email for ${email} has no /auth/confirm link`).toBeTruthy();
  return link!.replace(/&amp;/g, "&");
}

export async function latestSignInLink(
  request: APIRequestContext,
  email: string,
  since: Date,
): Promise<string> {
  return confirmLinkIn(await latestSignInEmail(request, email, since), email);
}

/**
 * Follows a sign-in link the way a person does since #305: open it, press Continue, and wait to
 * be sent on. Opening it alone signs nobody in, so a test that only navigated would stop on the
 * confirm page; waiting for the page to move on keeps a following `goto` from cancelling the post.
 */
export async function openSignInLink(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await page.getByRole("button", { name: "Continue to LeaRN" }).click();
  await page.waitForURL((url) => url.pathname !== "/auth/confirm");
}

/** The one-time code in the newest sign-in email (#306): the digits in the code's own line. */
export async function latestSignInCode(
  request: APIRequestContext,
  email: string,
  since: Date,
): Promise<string> {
  const body = await latestSignInEmail(request, email, since);
  const code = body.match(/monospace[^>]*>\s*(\d{6,10})\s*</)?.[1];
  expect(code, `the sign-in email for ${email} has no code`).toBeTruthy();
  return code!;
}
