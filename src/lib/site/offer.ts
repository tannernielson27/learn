/**
 * The subscription's facts as the public pages say them (#563, ADR 0016): the landing page,
 * /pricing and its metadata. One place, so a price or a cap is never written twice by hand.
 *
 * Each number is read from where the product keeps it: the price and the trial length from the
 * billing copy (`BILLING_PRICE`, `BILLING_TRIAL_DAYS`, which checkout also reads), the teacher cap
 * from the workspace's limits (`WORKSPACE_MEMBER_CAP`). Nothing here decides anything; it only
 * words what billing and the database already do.
 *
 * The terms of service state the same facts in their own approved words and are not built from
 * this module, so a change to the offer cannot change the terms without a new date. The site's
 * tests check that the terms still agree with it.
 */
import { BILLING_PRICE, BILLING_TRIAL_DAYS } from "@/lib/billing/billingCopy";
import { WORKSPACE_MEMBER_CAP } from "@/lib/workspace/workspace";

const PRICE = /^\$\d+\.\d{2}(?= a month$)/.exec(BILLING_PRICE)?.[0];
if (!PRICE) {
  throw new Error(`BILLING_PRICE should read "$N.NN a month", got "${BILLING_PRICE}"`);
}

/** "$39.99": the amount alone, set at display size. */
export const OFFER_PRICE: string = PRICE;

/** "a month per workspace": the line under the amount. */
export const OFFER_PERIOD = "a month per workspace";

/** 7. */
export const OFFER_TRIAL_DAYS = BILLING_TRIAL_DAYS;

/** 10. */
export const OFFER_TEACHERS = WORKSPACE_MEMBER_CAP;

/** "7-day free trial" (glossary: Free trial). */
export const OFFER_TRIAL = `${OFFER_TRIAL_DAYS}-day free trial`;

/** "Up to 10 teachers in one workspace". */
export const OFFER_TEACHER_CAP = `Up to ${OFFER_TEACHERS} teachers in one workspace`;

/** "Free for students". */
export const OFFER_STUDENTS_FREE = "Free for students";

/** The one line beside a free trial button: what happens next. */
export const OFFER_TRIAL_TERMS =
  "You enter a card at checkout, and the subscription starts on its own when the trial ends " +
  "unless you cancel first.";

/** The landing hero's small print: "7-day free trial, then $39.99 a month per workspace. ..." */
export const OFFER_SUMMARY = `${OFFER_TRIAL}, then ${OFFER_PRICE} ${OFFER_PERIOD}. ${OFFER_STUDENTS_FREE}.`;

/** The three facts the landing page's price section lists. */
export const OFFER_FACTS = [
  OFFER_TEACHER_CAP,
  `A ${OFFER_TRIAL}`,
  `${OFFER_STUDENTS_FREE}, who are never asked for a card`,
] as const;

/** /pricing's meta description. */
export const OFFER_DESCRIPTION =
  `One subscription per workspace: ${OFFER_PRICE} a month for up to ${OFFER_TEACHERS} teachers, ` +
  `with a ${OFFER_TRIAL}. ${OFFER_STUDENTS_FREE}.`;
