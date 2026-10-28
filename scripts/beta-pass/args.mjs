// What `scripts/beta-pass.mjs` was asked to do (#520). Pure, so the rules are tested.

export const USAGE = [
  "Usage:",
  '  node --env-file=.env.local scripts/beta-pass.mjs issue <email> "<note>"',
  "  node --env-file=.env.local scripts/beta-pass.mjs list",
  "  node --env-file=.env.local scripts/beta-pass.mjs revoke <email>",
].join("\n");

const NOTE_MAX = 500;
// The database decides what an address is (issue_beta_pass); this only catches a slip, such as
// the note and the address swapped.
const LOOKS_LIKE_ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * - `{ command: "issue", email, note }`, `{ command: "list" }`, `{ command: "revoke", email }`
 * - `{ error }` with a sentence for anything else.
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === "list") {
    return rest.length === 0 ? { command } : { error: "list takes nothing more." };
  }
  if (command === "issue") {
    if (rest.length !== 2) return { error: "issue takes an address and a note in quotes." };
    const [email, note] = rest.map((value) => value.trim());
    if (!LOOKS_LIKE_ADDRESS.test(email)) return { error: `"${email}" is not an email address.` };
    if (!note) return { error: "Give the pass a note: who it is for and why." };
    if (note.length > NOTE_MAX) return { error: `The note is over ${NOTE_MAX} characters.` };
    return { command, email: email.toLowerCase(), note };
  }
  if (command === "revoke") {
    if (rest.length !== 1) return { error: "revoke takes one address." };
    const email = rest[0].trim();
    if (!LOOKS_LIKE_ADDRESS.test(email)) return { error: `"${email}" is not an email address.` };
    return { command, email: email.toLowerCase() };
  }
  return { error: command ? `Unknown command "${command}".` : "Name a command." };
}
