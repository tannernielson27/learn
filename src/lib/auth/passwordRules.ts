// The password rule's numbers and words, apart from `password.ts` so a form in the browser can
// show them without bundling the server's parsing.

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt, which Supabase Auth hashes with, reads 72 bytes and no more. */
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters.`;
export const PASSWORD_TOO_SHORT = `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
export const PASSWORD_TOO_LONG = "That password is too long. Use 72 characters or fewer.";
