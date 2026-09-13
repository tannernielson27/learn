// Reads the newest sign-in email for an address from the local Supabase stack's test mailbox
// (Mailpit on port 55324, see supabase/config.toml). Local and CI only: previews send real email.
import { expect, type APIRequestContext } from "@playwright/test";

const MAILBOX_URL = process.env.SUPABASE_MAILBOX_URL ?? "http://127.0.0.1:55324";
// Docker's clock and the host's can disagree by a second or two.
const CLOCK_SKEW_MS = 5_000;

interface MailpitSummary {
  ID: string;
  Created: string;
}

export async function latestSignInLink(
  request: APIRequestContext,
  email: string,
  since: Date,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = await request.get(`${MAILBOX_URL}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const { messages } = (await list.json()) as { messages: MailpitSummary[] };
        const fresh = messages.find(
          (message) => new Date(message.Created).getTime() >= since.getTime() - CLOCK_SKEW_MS,
        );
        if (!fresh) return undefined;
        const message = await request.get(`${MAILBOX_URL}/api/v1/message/${fresh.ID}`);
        const { HTML, Text } = (await message.json()) as { HTML: string; Text: string };
        link = (HTML || Text).match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/)?.[0];
        return link;
      },
      { timeout: 15_000, message: `no sign-in email arrived for ${email}` },
    )
    .toBeTruthy();
  return link!.replace(/&amp;/g, "&");
}
