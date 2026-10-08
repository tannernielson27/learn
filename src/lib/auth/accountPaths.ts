/** A signed-in person's own settings: their name, and the way to their password (#358). */
export const ACCOUNT_PATH = "/account";

/** Open sign-up (#361). */
export const SIGN_UP_PATH = "/sign-up";

/** Where an account with no role yet lands (#361): a student with no class, a teacher retrying. */
export const WELCOME_PATH = "/welcome";

/** Where a signed-in person chooses or changes their password. */
export const PASSWORD_PATH = "/account/password";

/** The password page, sending the person on to `next` afterwards. `next` is checked again there. */
export function choosePasswordPath(next: string): string {
  return `${PASSWORD_PATH}?next=${encodeURIComponent(next)}`;
}
