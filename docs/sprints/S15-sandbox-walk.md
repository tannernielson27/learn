# S15 billing: sandbox walk (#523)

Walked 2026-11-24 by Claude on the owner's machine, against the local Supabase stack (70 migrations) and the `learn-dev` Stripe sandbox (`acct_1UXTsYLsFG5XY4oL`), with `stripe listen` forwarding the ten events of docs/05 §7.15 step 6 to `localhost:3000/api/stripe/webhook`. No hosted project and no live key were touched. An earlier walk on 2026-11-02 (PR #551) already covered resending events, event order, the portal and `cancel_at`; this one covers what #523 adds.

## Setup

- `.env.local`: the local stack's keys, the sandbox's `sk_test_…`, the `whsec_…` that `stripe listen --print-secret` printed, `STRIPE_PRICE_LOOKUP_KEY=learn_monthly_v1`.
- Two teachers signed up through `/sign-up` with fresh addresses: A (`walk523a@learn.test`) and B (`walk523b@learn.test`). Neither had a grant.
- For A, a test clock (`clock_1UfPg5LsFG5XY4oLStvPx8sU`, frozen at the walk's start) and a customer on it (`cus_VgnGESOMu9EU0h`, metadata `org_id` and `profile_id` as Checkout sets them), written into `workspace_billing` before Checkout, so the app's own Checkout reused it.

## Results

| #   | Step                                                                                                 | Expected                                   | Seen                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Unsigned `POST /api/stripe/webhook`                                                                  | `400 invalid_signature`                    | `400 {"error":"invalid_signature"}`                                                                                                                                                  |
| 2   | A: Billing → **Start your free trial**                                                               | Checkout: 7 days free, then $39.99 a month | "7 days free · Then $39.99 per month starting December 1, 2026"                                                                                                                      |
| 3   | Decline card `4000 0000 0000 0002`                                                                   | Refused in Checkout, nothing written       | "Your card was declined." Row unchanged                                                                                                                                              |
| 4   | 3-D Secure card `4000 0025 0000 3155` → **Complete**                                                 | Trial starts after authentication          | Back on `/author/workspace?billing=started`; row `trialing`, trial end 2026-12-01, `learn_monthly_v1`, `livemode` false                                                              |
| 5   | Advance the clock 8 days                                                                             | Trial converts, invoice paid               | Row `active`, period end 2027-01-01. Events `checkout.session.completed`, `customer.subscription.created`, `trial_will_end`, `updated`, `invoice.paid` ×2: six deliveries, all `200` |
| 6   | Enforcement on locally (`BILLING_ENFORCED=true`, `billing_config.enforced = true`); A creates a quiz | Allowed                                    | Quiz "Walk 523 paid quiz" created                                                                                                                                                    |
| 7   | Cancel A's subscription in Stripe                                                                    | Row `canceled`; A read-only                | `200`; row `canceled`. **Create quiz** → "Your workspace is read-only", one sentence, **Go to Billing**                                                                              |
| 8   | B (never subscribed): **Import the sample quiz**                                                     | Read-only                                  | Same read-only page                                                                                                                                                                  |
| 9   | `pnpm beta-pass issue` for B, open the link, **Accept**                                              | Free access; B can write                   | Sample quiz imported (15 questions)                                                                                                                                                  |
| 10  | `pnpm beta-pass revoke` for B                                                                        | Read-only again, with a banner             | Library banner "Your free access has ended. Start a free trial or subscribe"                                                                                                         |
| 11  | Direct insert into `item_banks` as A and as B (role `authenticated`), bypassing the app              | Refused by the database                    | Both: `new row violates row-level security policy "billing: insert needs access"`                                                                                                    |
| 12  | Control: the same insert as B with B's grant restored inside a rolled-back transaction               | Allowed                                    | Allowed                                                                                                                                                                              |

## Not covered here

- A student finishing an open assignment in a lapsed workspace: covered by the e2e spec from #521, not walked by hand.
- Grandfathered workspaces: production has none to grandfather (one workspace, the shared LeaRN one, with its `exempt` grant; checked 2026-11-24). The local database lacked that `exempt` grant, so locally the shared workspace has no access with enforcement on; this is local data only.
- `golive:check`'s Stripe row, and the mocked e2e walk: the other acceptance items of #523.

## Notes for the owner

- A workspace whose subscription has ended (case 7) gets no banner; the teacher finds out only when they try to change something. `billingBanner` shows one only for a trial ending, a failed payment, a subscription set to end, and free access that ended. Whether a lapsed subscription should get one too is a product call.
- A new teacher under enforcement sees the full Get started checklist and is refused at the first click until they start the trial (case 8). This is the "card at trial" decision; mentioned because it is the first thing every new teacher will meet.
- Checkout also offers Cash App Pay, Amazon Pay, Klarna and bank payment, from the account's payment method settings. Turn off any you do not want in the live dashboard (Settings → Payment methods).

## Clean-up

The sandbox's test clock (with its customer and subscription) is deleted after the walk; the local stack is stopped.
