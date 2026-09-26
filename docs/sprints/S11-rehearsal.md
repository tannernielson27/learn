# Sprint 11: the Demo 12 rehearsal

**Demo 12:** an outside instructor onboards cold and runs a class without help.

`e2e/coldOnboarding.spec.ts` (#274) walks these steps on the local stack in every CI run, at 375, 768 and 1280 px. This page is the same walk for a person, step for step, with what to expect at each. The spec saves a screenshot of each step to `test-results/screenshots/<project>/demo12-*.png`; the file names are given below.

It is a live session, not a take-home assignment, so nothing waits for a window to close.

**You need:** three browsers, or one browser and two private windows: the instructor, a student with a class invite, and a phone joining the live session. On the local stack, emails arrive in Mailpit at http://127.0.0.1:55324.

**Cold, on hosted:** `private.make_instructor` puts every instructor in the one org, which already holds the demo banks and classes. There, Get started reads its steps as done and may not show at all. To see it from nothing, run the steps on the local stack, where the spec gives the instructor an org of their own, or show the spec's screenshots or trace.

## Steps

1. **The operator adds the instructor.** Follow docs/05 §7.6: Authentication, Users, **Add user** with Auto Confirm on, then `select private.make_instructor('<address>');`. Tell the instructor the address of the site. Nothing else.
2. **The instructor signs in from the landing page.** Open `/`. The heading reads "Live learning for the Next Generation NCLEX." (`demo12-1-landing`). Follow **Sign in**, enter the address and choose **Email me a sign-in link**. The page says "Check your email" (`demo12-2-check-email`). The link in the email opens the author home.
3. **Get started, the sample and a class.**
   - The author home shows **Get started** with three steps and "0 of 3 done" (`demo12-3-get-started`).
   - Choose **Import the sample bank**. The **Sample bank** opens, published and ready to run (`demo12-4-sample-bank`).
   - Back on the author home, Get started reads "1 of 3 done". Follow **Go to your classes**, name a class and choose **Create class**.
   - On the class page, choose **Copy invite link**. It says "Copied.", and the link on the clipboard is the one in the **Invite link** box (`demo12-5-class-invite`).
4. **A student joins the class.** In a second browser, open the invite link, enter the student's address and choose **Email me a link to join**. After "Check your email", the emailed link opens the student home, and **Your classes** lists the class (`demo12-6-student-home`). Back on the class page, the **Roster** lists the student's address.
5. **A live session from the sample.**
   - Open the Sample bank and choose **Start a live session**. The console shows a six-character code like `ABC DEF` under **Join code**, and "Nobody has joined yet."
   - On a phone (a third browser), open `/`, follow **Join a live session**, type the code as shown, a display name, and choose **Join**. The phone says "You are in."
   - The name and "1 phone connected" appear on the console without a reload (`demo12-7-lobby`).
   - Choose **Start session**. The phone shows the first item. The spec moves to the sample's multiple-choice item with the **Go to item** buttons, because the sample's order is not fixed; by hand, any item will do.
   - The console reads "0 of 1 answered". On the phone, choose an answer and **Submit**. The phone says "Answer sent. Your instructor will show the answer at the front." (`demo12-8-phone-answered`).
   - The console count moves to "1 of 1 answered", and **Options** shows how the room answered, "1 of 1 · 100%" beside the chosen option (`demo12-9-console-result`).
   - Choose **Show answer**. The phone shows its own score, "1 / 1" for a right answer (`demo12-10-phone-score`). Choose **End session**; the phone says "This session has ended."
6. **Done.** Every Get started step is now done, so the author home shows **Item banks** without the checklist (`demo12-11-author-home-done`).

## Running the spec

With the local stack running (see CONTRIBUTING.md), and the four variables the auth e2e job sets:

```
E2E_AUTH=1 pnpm e2e e2e/coldOnboarding.spec.ts
```

A failed run keeps its trace under `test-results/`; `pnpm exec playwright show-trace <trace.zip>` replays it step by step.
