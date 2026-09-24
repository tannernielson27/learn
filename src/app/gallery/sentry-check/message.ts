/**
 * The error the Sentry check throws (#235). It carries a fake email, a fake invite link and a fake
 * join code on purpose: in Sentry the owner should see `[email]`, `/c/[redacted]` and `[code]` in
 * their place, which proves the scrub ran on this deployment. None of it is real.
 */
export const SENTRY_CHECK_MESSAGE = (where: "server" | "browser") =>
  `Sentry check (${where}): fake student check.student@example.test ` +
  `opened /c/FakeInviteToken0123456789abcdefXY with code 7KQ2MP`;
