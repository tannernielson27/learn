/**
 * The service providers LeaRN sends personal data to, as the code stands (#522 inventory):
 * `src/lib/supabase`, the Vercel deployment, `src/lib/billing`, `src/lib/email/resend.ts`,
 * `src/lib/observability`, `src/lib/aiImport`, `src/lib/auth/captcha.ts` and
 * `.github/workflows/db-backup.yml`. A new one is added here before it ships.
 */
export const PROVIDERS = [
  {
    name: "Supabase",
    does: "Our database, sign-in and file storage, in the United States (AWS us-east-1). It holds everything listed above.",
  },
  {
    name: "Vercel",
    does: "Serves the website and runs its server code. It sees each request, including your IP address, and keeps short-term logs.",
  },
  {
    name: "Stripe",
    does: "Takes subscription payments through its own checkout and billing pages. It holds the card and billing details; we never see the full card number.",
  },
  {
    name: "Resend",
    does: "Sends our email: sign-in links and codes, address confirmations, invitations to a workspace and assignment reminders.",
  },
  {
    name: "Sentry",
    does: "Receives error reports when something breaks. We remove names, email addresses, answers and document text before a report is sent; it includes the page, the error and your browser type.",
  },
  {
    name: "Anthropic",
    does: "Provides the AI model behind AI import. It receives the text of the documents a teacher imports, and nothing that identifies the teacher.",
  },
  {
    name: "Cloudflare",
    does: "Runs the Turnstile check on the sign-up form that tells people from bots. It receives your IP address and information from your browser.",
  },
  {
    name: "GitHub",
    does: "Stores our encrypted nightly database backups for 14 days.",
  },
] as const;
