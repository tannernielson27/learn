# ADR 0016 — A workspace pays for itself, after a free trial; Stripe holds the money, the database holds the answer

- **Status:** Accepted, 2026-10-27 (S15 kickoff, issue #514). Changes ADR 0009 ("every self-registered workspace is free"), ADR 0011 (who may move away from a workspace) and ADR 0012 (which workspaces the sweep may delete). Issue #514 was filed as "ADR 0013"; 0013 to 0015 were taken by then, so this record is 0016.
- **Deciders:** product owner (seven decisions at kickoff, all final), Claude (orchestrator; the defaults marked "added" below)

## Context

Since ADR 0009 anyone can sign up as a teacher and gets a workspace of their own, free, with no end. The owner now wants the app to pay for itself: a flat monthly price per workspace, a short free trial, and free access for beta testers and for everyone who signed up before billing existed.

Six facts in the code shape the decision:

1. **The workspace is the unit everything is scoped by.** Row level security on every author table reads `private.current_org_id()` and `private.is_author()`; nothing is finer than the org (ADR 0011 fact 3). A workspace already holds up to 10 teachers (`member_cap` in `accept_org_invite`), so a teacher is not a unit of anything the database can enforce cheaply.
2. **A workspace has one person who started it** (`orgs.founder_id`, ADR 0011). The shared LeaRN workspace (`self_registered = false`) has none.
3. **Workspaces are made outside sign-up.** `register_instructor` makes one at sign-up and on a `/welcome` retry, `remove_org_member` makes a fresh one for the removed teacher, and a teacher can move into another workspace by accepting an invitation (ADR 0011). One person can therefore pass through several workspaces, and one workspace can see several founders' worth of history.
4. **There are two ways to write, and only one goes through the app.** Pages and Server Functions check `authorForRoute` and `requireAuthor` (`src/lib/authoring/session.ts`), but an author's browser also writes banks, folders, items, case studies, classes and assignments straight through PostgREST under RLS, and `start_session` is `security invoker`, so RLS is all that gates it. A check in the app alone would be a check a teacher's own client can walk around.
5. **Until the production split, previews share production's database** (ADR 0006, docs/05 §7.3 not yet done). Anything a preview writes lands in the rows production reads.
6. **The workspace sweep deletes workspaces** (ADR 0012) and knows nothing of money. Left alone it could delete a workspace a teacher is paying for, or one the owner has given free access to.

How Stripe behaves, checked on 2026-10-27 against API version `2026-09-30.endive` (`stripe@23`):

- **Checkout does not dedupe trials.** `subscription_data.trial_period_days` gives a trial to every Checkout Session that asks for one; Stripe never checks whether the customer, the card or the address has had one before.
- **Promotion codes are a bad fit for free access.** A "first-time order only" code refuses any customer who has paid or trialed before, which is every beta tester who tried the trial first. And `allow_promotion_codes` shows a code box to every buyer, which invites people to look for codes.
- **Events arrive out of order and more than once.** Stripe retries undelivered events for days, and `customer.subscription.updated` can arrive after a later `deleted`.
- **Since API 2025-03-31 `current_period_end` lives on the subscription item**, not the subscription.

## Decision

### What is billed, and who manages it

- **The workspace is billed, not the teacher**: $39.99 a month, flat, for up to 10 teachers (the cap that exists). A per-teacher price would need a seat count that every invitation, removal and move changes, and a Stripe quantity kept in step with them, for no gain at this size (fact 1). Students never pay and are never asked.
- **The person who started the workspace manages billing** (`orgs.founder_id`): Subscribe, start the trial, open the Customer Portal. Every other teacher sees the status and who to ask. The interface never says "founder", "org", "organization", "member" or "seat" (docs/glossary.md).
- **One row per workspace mirrors Stripe**: `public.workspace_billing` (#517), with the customer, the subscription, its `status`, the price's lookup key, `current_period_end` from the subscription item, `cancel_at_period_end`, the billing email and `livemode`. Only the service role writes it, and only the webhook sync (#518) does. Teachers of the workspace read it; nobody else does.

### Which states grant access

A workspace **has access** when either is true; this is `private.org_has_access(org)` and `private.current_org_has_access()` (#517), the one answer the app and the database both read:

- **An active grant**: an `access_grants` row for the workspace with `kind` in `exempt`, `grandfathered` or `beta`, `revoked_at` null, and `expires_at` null or in the future.
- **A live subscription**: `workspace_billing.status` is `trialing`, `active` or `past_due`, and its `livemode` matches the deployment's (`private.billing_config.livemode`).

Everything else has no access: `incomplete`, `incomplete_expired`, `unpaid`, `canceled`, `paused`, and no row at all. `past_due` keeps access while Stripe's Smart Retries run (8 tries over 2 weeks, then the subscription is cancelled; docs/05 §7.15 step 8), so a card that fails once does not close a class.

### Grants

- **`exempt`**: the shared LeaRN workspace (fact 2). It is the owner's own and was never self-registered.
- **`grandfathered`**: every self-registered workspace that exists when the billing tables are created, backfilled once by #517's migration. A workspace made after that has none.
- **`beta`**: a workspace whose founder redeemed a beta pass (#520).
- **Beta and grandfathered last until revoked.** `expires_at` is null for both; the owner ends one by setting `revoked_at`. A workspace whose grant is revoked has no access until it subscribes, and is offered a trial only if neither it nor its founder has had one. `expires_at` exists for a grant the owner chooses to time-limit later, by hand.

### One free trial per person and per workspace

- **The trial is 7 days, through Stripe's hosted Checkout, card required**, and converts to paid on its own (`mode: subscription`, `subscription_data.trial_period_days: 7`, `trial_settings.end_behavior.missing_payment_method: cancel`, `consent_collection.terms_of_service: required`). No `allow_promotion_codes`.
- **The app decides who may have one, before it asks Stripe**, because Stripe will not. `private.trial_uses` (#517) records a trial by person (`profile_id` and the normalised email) and by workspace. A Checkout Session is created with a trial only when neither the founder nor the workspace appears there; otherwise it is created without one.
- **Why both keys.** Per workspace alone, a teacher who is removed gets a new workspace (fact 3) and a new trial, and so does one who moves and starts again, or who retries `/welcome`. Per person alone, a workspace whose founder changed (a backfilled founder, a founder whose account was deleted by hand) could trial twice. The email is kept as well as the profile so that deleting and re-creating an account does not reset it.

### A lapsed workspace is read-only

When enforcement is on (below) and a workspace has no access:

- **Teachers can still** sign in, open every page, read every quiz, question, case study, class, roster, report and result, export (`learn.v1`, CSV), and reach Billing (the founder) or see who to ask (everyone else).
- **Teachers cannot** create, edit, archive or restore content, start a live session, assign, share for practice, invite a colleague or use AI import. Each refusal is one sentence with a link to Billing, or the name of who to ask.
- **Students are not affected and never see a billing message.** Assignments already open keep running to their close, with saves, submits and the submit at close (ADR 0007). A live session already running runs to its end. Practice already shared keeps working. Joining a class by code or link keeps working.
- **Nothing is deleted** because a workspace lapsed. Subscribing again restores everything at once.

### Beta passes

- **The owner issues them, from a script**, `scripts/beta-pass.mjs issue <email> "<note>"`, with `list` and `revoke <email>` (#520). There is no admin page and nothing in the interface outside `/b/<token>` mentions them (owner decision 4).
- **Modelled on invitations (ADR 0010).** A link `/b/<token>`, a 192-bit random token emailed to one address and stored only as a hash in `private.beta_passes`. It is redeemed only by a teacher signed in with that address (a signed-out visitor signs up there, as on `/w/<token>`), only once, and only before the unredeemed link expires. Redeeming adds a `beta` grant with no expiry to the redeemer's workspace. A wrong address, a used, expired or revoked pass all get the same neutral sentence, behind a per-IP rate limit. `revoke` on a redeemed pass also revokes its grant.
- **Why not promotion codes.** Stripe's "first-time order only" codes refuse anyone who has trialed or paid before, which would refuse exactly the testers who tried the product first; without that restriction a leaked code is free access for anyone. And a code box at Checkout is visible to every buyer. A pass bound to one address, used once and revocable by the owner, has none of these problems and needs no Stripe object at all.

### Enforced in the app and in the database

- **The app gate**: `authorForRoute` gains a read-only state, and every write action checks it (#521). This is what turns a refused write into one sentence and a link rather than an error.
- **The database gate**: the write policies on banks, folders, items, case studies, classes, assignments, practice shares and org invites, and `start_session`, add `private.current_org_has_access()` (#521). Fact 4 is why: without it a lapsed teacher's own browser could write through PostgREST, which the app never sees. The read policies do not change, so read-only is read-only in both places.
- **Students are untouched in both**: no student path, policy or function reads the access check.

### Shipping dark: `BILLING_ENFORCED`

- **Billing ships switched off.** With `BILLING_ENFORCED` unset (the default), the app reads billing state and shows it, but never refuses anything for it. The database side reads `private.billing_config.enforced` (added by #517), false by default, so the gated policies allow every write as they do today. Turning enforcement on or off needs no code change and no migration.
- **Both switches are turned on together, and only after verification**: the sandbox walk of #523 passes, the production split (#515) and the domain (#516) are done, and the live catalog and webhook are in place (docs/05 §7.15). Until then every workspace behaves as it does now, whatever its billing row says.

### Sandbox and live

- **Local development and CI use a Stripe sandbox** (`learn-dev`, test keys). CI needs no key at all: the webhook tests sign fake events with `stripe.webhooks.generateTestHeaderString` (#518).
- **Live keys exist only in Vercel Production**, and the library refuses a live key anywhere else (#518). Vercel Preview gets no Stripe key of either kind until the production split (#515): until then a preview writes to production's database (fact 5), and a sandbox subscription there would be a row production reads.
- **The production split is a precondition for live billing** (owner decision 6), and so is the domain `learnursing.app` (owner decision 7), which the Checkout return URLs, the webhook endpoint, and the Terms and Privacy links Stripe shows all name.
- **Every billing row carries `livemode`** (`workspace_billing`, `stripe_events`), and the database knows which mode it serves from `private.billing_config.livemode`, set to true on the production project after the split (docs/05 §7.15 step 10). A sandbox row in a live database, or the reverse, grants nothing.

### The catalog and the sync

- **The price is referenced by its lookup key, `learn_monthly_v1`, never by its id.** Sandbox and live have different ids for the same price; the lookup key is the same in both, and a later price change is a new key (`learn_monthly_v2`) rather than an edited id in an environment variable. `scripts/stripe-catalog.mjs` (#518) creates the product, the $39.99 monthly price and the Customer Portal configuration, idempotently, once per sandbox and once for live.
- **The webhook re-fetches rather than trusts the event.** `POST /api/stripe/webhook` verifies the signature on the raw body, records the event id in `private.stripe_events` (insert or skip: a duplicate answers 200 and writes nothing), and then re-fetches the customer's subscription from Stripe and upserts one `workspace_billing` row from what Stripe says now (`syncWorkspaceBilling`, the only writer). An event that arrives late therefore cannot roll the row back.
- **The webhook is outside the proxy and Vercel's deployment protection** (`src/proxy.ts` excludes it; #518), because Stripe has no session and no Vercel login.

### What it changes in earlier ADRs

- **ADR 0009.** "A self-registered teacher gets a new org of their own" still holds, but the org is no longer free: a workspace made after billing ships has no access until it starts a trial or subscribes (once enforcement is on). Workspaces that exist when the billing tables are created are grandfathered until revoked. Sign-up itself is unchanged and asks for no card.
- **ADR 0011.** A founder whose workspace has a live subscription (`trialing`, `active` or `past_due`) cannot move away by accepting an invitation; `accept_org_invite` refuses with `has_subscription` until they cancel in the Customer Portal (#521). Otherwise the workspace would keep billing with nobody able to manage it. Removing a colleague still gives them a new workspace, as before; that workspace starts without access, and can trial only if that person never has.
- **ADR 0012.** The sweep never deletes a workspace that has a `workspace_billing` row (any status, any mode) or an `access_grants` row (revoked or not), by either rule (#521). Billing history is a record the owner may need, and a grant is the owner's own decision about that workspace. A workspace with a row is reported skipped. Deleting a workspace by any other route cancels its Stripe subscription first (#521).

## Consequences

- **Fees.** On each $39.99 payment by card: 2.9% + 30¢ for the card, 0.7% for Stripe Billing, and 0.5% for Stripe Tax if it is turned on. About $1.74 of each payment without Tax, $1.94 with it. A trial that never converts costs nothing.
- **Tax is the owner's decision**, recorded in docs/05 §7.15 step 9. Off at first is acceptable.
- **Schools may want invoices and purchase orders.** Not built. When one asks, the owner can create a subscription with `collection_method: send_invoice` by hand in the dashboard on the workspace's customer; the same webhook and status mirror cover it, since access is read from `status` and not from how it is paid.
- **A card is asked for at the start of the trial.** Fewer people start one; more of those who do convert. That is the owner's choice (decision 2).
- **Grandfathered and beta workspaces are free with no end date** until the owner revokes them. Nothing reminds the owner they exist; `scripts/beta-pass.mjs list` and a query on `access_grants` show them.
- **The access check runs on every gated write.** It is a small indexed read in each policy that calls it, and only writes pay it; reads are not gated.
- **A lapsed workspace's content is kept indefinitely**, and the sweep never removes it. A workspace that never subscribed and never had a grant is still swept by ADR 0012's rules.
- **Turning enforcement on is the step that changes what teachers see**, and it is reversible. Everything before it (tables, webhook, billing page, banners) changes nothing a teacher cannot already do.

The parts, in milestone S15 (docs/open-issues.md):

| Issue | Part                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| #514  | This ADR, the glossary rows and the owner's Stripe steps (docs/05 §7.15).                                                    |
| #515  | The production Supabase split (docs/05 §7.3), before any live key.                                                           |
| #516  | The `learnursing.app` domain and the Stripe account's activation for live payments.                                          |
| #517  | `workspace_billing`, `access_grants`, `trial_uses`, `stripe_events`, `billing_config`, the access check and the backfill.    |
| #518  | The Stripe library, `POST /api/stripe/webhook`, the re-fetch sync and `scripts/stripe-catalog.mjs`.                          |
| #519  | Start the free trial, subscribe and manage billing in the Billing section of `/author/workspace`.                            |
| #520  | Beta passes: `private.beta_passes`, `scripts/beta-pass.mjs` and `/b/<token>`.                                                |
| #521  | Enforcement in the app and the database behind `BILLING_ENFORCED`, and the sweep, move and AI import changes.                |
| #522  | Trial and payment banners for teachers, the pricing page, and the Terms and Privacy pages.                                   |
| #523  | The end-to-end walk, the sandbox walk that must pass before enforcement is turned on, and the go-live checklist for billing. |
