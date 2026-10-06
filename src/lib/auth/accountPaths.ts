/** Where a signed-in person chooses or changes their password. */
export const PASSWORD_PATH = "/account/password";

/** The password page, sending the person on to `next` afterwards. `next` is checked again there. */
export function choosePasswordPath(next: string): string {
  return `${PASSWORD_PATH}?next=${encodeURIComponent(next)}`;
}
