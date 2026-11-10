# ADR 0017 — Staging is main on the old project, behind a passkey gate; production moves only by a release

- **Status:** Accepted, 2026-11-10. Changes docs/05 §6 (production was every merge to `main`) and ADR 0006's two-environment picture (preview and production) into three.
- **Deciders:** product owner (the four answers below), Claude (the rest).

## Context

Since the production split (#515, 2026-11-05) production runs on `learn-prod` (`xptnbfrrqpzsdhuxilcr`) and the old project, `learn` (`vauokqoyvewtzubqajgh`), serves previews only. But a merge to `main` still went straight to www.learnursing.app, and its migrations had to be pushed by hand. There was no place to try a merged change on real hosting before teachers saw it.

The owner asked for a staging site at staging.learnursing.app that only their devices can open, on `learn`, with an easy step from staging to production. Their answers on 2026-11-10: only the owner needs staging for now, but build for more people later; a passkey gate rather than Vercel's login; the release step applies production's migrations; scrub `learn` of real people now.

What the platform offers, checked on 2026-11-10:

- **Vercel Authentication** (free on Pro) asks every visitor to sign in to a Vercel account on the team. Fine on a laptop, awkward on a student's phone, and each regular viewer needs a team seat.
- **Password Protection** needs the Advanced Deployment Protection add-on (about $150 a month). **Trusted IPs** need Enterprise.
- **Client certificates** (the "RSA key" idea) need a proxy in front of Vercel, such as Cloudflare Access. The domain's DNS is on Vercel, so that would be a second moving part.
- **A Next 16 proxy matcher can match on the host** (`has: [{ type: "host" }]`), so a gate can cover every path on one host while the production host's requests reach the proxy exactly as before.

## Decision

1. **Three environments.** A pull request gets a preview on its own vercel.app address, on `learn`. A merge to `main` deploys to **staging.learnursing.app**, on `learn`, and `.github/workflows/staging-migrate.yml` applies its migrations there. **Production** is the `production` branch, on `learn-prod`.
2. **Production moves only by a release.** `.github/workflows/release.yml` takes a commit that is on `main`, passed CI's `check` job, and is what staging runs. It applies production's migrations, fast-forwards `production` to that commit (Vercel builds it) and waits until www.learnursing.app reports it. The `release` GitHub environment makes the owner approve each run. Rolling back is still Vercel's "Promote to Production" on the previous deployment.
3. **Staging is behind a device gate of our own** (`src/lib/deviceGate/`). A device gets in by registering a passkey, with the enrollment code (`DEVICE_GATE_ENROLL_CODE`) for the first one, or a one-time invite link made on a device already in. After that it unlocks with the passkey, and it holds a signed session cookie for 30 days. The proxy checks that the device is still registered on every request, so revoking one in `/device-gate/devices` locks it out at once. The gate covers pages and `/api` alike, except the gate itself, `/api/health`, Stripe's signed webhook and the cron routes, which check their own secrets.
4. **The gate is keyed to the host, not to a variable.** On staging.learnursing.app with no `DEVICE_GATE_SECRET`, every request gets a 503; on any other host the gate does nothing. A missing variable can lock staging, never open it. Production's tables for it stay empty.
5. **No Vercel Authentication** (changed on 2026-11-10, the day this was accepted). Its Standard Protection exempts only production's custom domains. It covered staging.learnursing.app as well, so a phone had to sign in to Vercel before it ever reached the passkey gate. Exempting that one domain needs the paid add-on. The owner chose the passkey gate alone. A passkey belongs to one host, so the gate cannot cover the per-PR vercel.app addresses: those are unlisted but public, as they were before 2026-11-10, and they reach only `learn`.

## Consequences

- A merged change is live for teachers only after someone presses Release. Hotfixes go the same way: merge, check staging, release.
- Migrations now run from CI on both projects. A migration must still work with the app already deployed (docs/05 §7), because the release applies it before the new app is live.
- The `learn` project holds only the owner's own accounts and test content. Sandbox Stripe keys may go on staging; live keys are refused off production by `src/lib/billing/stripeConfig.ts`.
- Adding a tester later is an invite link from the devices page. No Vercel seat, no new code.
- Sign-up on staging asks for no CAPTCHA (`captchaSetup` is `skipped` off production), so the `learn` project's Auth settings must not require one.

## Risks accepted

- **Previews, and the staging deployment's own vercel.app addresses, are public to anyone who has the address.** The gate does nothing there. They reach `learn`, which holds only the owner's accounts and test content. Each address is unguessable and is shown only in the pull request and in Vercel. Never put live keys or real people's data on `learn`.
- **A challenge cookie can be replayed for its five minutes.** Doing that takes the cookie (HttpOnly, sent only over TLS) and the matching passkey answer together. Anyone who has both already controls the device.
- **No per-IP limit on the gate's API.** The enrollment code is 128 random bits (`openssl rand -hex 16`), and an unlock needs a registered passkey. Guessing is not a plan.
- **Invite tokens are in the query string**, so Vercel's request logs see them. Only the owner reads those logs, a token works once and for a day, and the page sends no Referer.
