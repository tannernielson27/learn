// Beta passes, for the owner (#520, ADR 0016): issue one to an address, list them, revoke one.
//
//   node --env-file=.env.local scripts/beta-pass.mjs issue <email> "<note>"
//   node --env-file=.env.local scripts/beta-pass.mjs list
//   node --env-file=.env.local scripts/beta-pass.mjs revoke <email>
//
// or the same through `pnpm beta-pass issue|list|revoke ...`.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY, as the app's server does, and talks to
// whichever project they name: it prints that project first. `issue` also needs SITE_URL for the
// link. The link is printed once and goes nowhere else; the database keeps only its digest. The
// app has no way to send it from here (its mailer is the app's own, behind a request), so send it
// to the address yourself. docs/05 §7.15 has the steps.
import { createClient } from "@supabase/supabase-js";
import { parseArgs, USAGE } from "./beta-pass/args.mjs";
import { formatPasses, issuePass, listPasses, revokePasses } from "./beta-pass/commands.mjs";
import { linkOrigin } from "./beta-pass/token.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (args.error) fail(`${args.error}\n\n${USAGE}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secret) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
if (secret.startsWith("sb_publishable_")) fail("SUPABASE_SECRET_KEY holds a publishable key.");

const client = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`Project: ${new URL(url).host}`);

if (args.command === "issue") {
  const origin = linkOrigin(process.env.SITE_URL);
  if (!origin)
    fail("SITE_URL must be the site's https address, for example https://learnursing.app.");
  const issued = await issuePass(client, { email: args.email, note: args.note, origin });
  if (issued.status === "already_issued") {
    fail(`${args.email} already has an unused pass. Revoke it first to issue another.`);
  }
  if (issued.status !== "issued") fail(`Not issued: ${issued.status}.`);
  console.log(
    `Issued a pass for ${args.email}. The link works until ${issued.expiresAt.slice(0, 10)}.`,
  );
  console.log("");
  console.log(`  ${issued.link}`);
  console.log("");
  console.log("Send it to that address yourself. It is shown this once and stored nowhere; if it");
  console.log("is lost, revoke the address and issue again.");
} else if (args.command === "list") {
  console.log(formatPasses(await listPasses(client)));
} else {
  const revoked = await revokePasses(client, args.email);
  console.log(
    `Revoked ${revoked.passes} pass(es) and ${revoked.grants} free-access grant(s) for ${args.email}.`,
  );
}
