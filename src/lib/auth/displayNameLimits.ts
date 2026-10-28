/**
 * The account name's limit and its two messages (#358), apart from the zod rule that enforces
 * them on the server (`displayName.ts`). The name field in the browser reads the limit for its
 * `maxlength`; importing it from `displayName.ts` would put all of zod on the sign-up and class
 * invite pages for one number (`components/auth/noClientZod.test.ts`).
 */

export const ACCOUNT_NAME_MAX_LENGTH = 80;
export const ACCOUNT_NAME_EMPTY = "Enter your name.";
export const ACCOUNT_NAME_TOO_LONG = `Use ${ACCOUNT_NAME_MAX_LENGTH} characters or fewer for your name.`;
