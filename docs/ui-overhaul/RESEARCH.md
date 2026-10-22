# LeaRN UI/UX overhaul: design research notes

Researched 2026-10-22. Scope: structural lessons from live-quiz / classroom-response tools, self-paced qbanks, and
platform frameworks, for a serious "clinical editorial" NCLEX app (no podium, confetti, sound, streaks, leaderboards).

Confidence legend:

- **[V]** verified on an official vendor/standards page I fetched or whose snippet came from the official domain.
- **[S]** secondary source (university IT guide, press, credible third party). Probably right; not vendor-confirmed.
- **[U]** could not verify. Recorded so nobody re-researches it, but do not build on it as fact.

Access notes: support.kahoot.com and help.blooket.com return HTTP 403 to fetches, so Kahoot/Blooket facts below come
from search snippets of their official pages (marked [V] only where the snippet came from the official URL).
Wayground (formerly Quizizz) has almost no indexable help content (help.wayground.com only lists categories);
its third-party "guides" are SEO spam on look-alike domains (wayground.it.com, joinmyquiz.it.com), which I ignored.
mobbin.com needs a login; I could not reach any Mobbin screen pages. No Mobbin claims are made here.

---

## 1. Host / projector screens

### 1.1 Join information (code + URL + QR)

- Kahoot: lobby shows a large game PIN (6-10 digits) at the top; players go to kahoot.it or the app, no account
  needed; join by PIN, shared link or QR. [V] https://support.kahoot.com/hc/en-us/articles/360000109048 ,
  https://support.kahoot.com/hc/articles/360039890713
- Kahoot: host can click the PIN in the lobby to copy a direct join link. [V-snippet] same article.
- Kahoot: a PIN is valid only while that game is running. [V-snippet] https://support.kahoot.com/hc/en-us/articles/360000109048
- Kahoot "2-Step Join": after the PIN, the player taps a 4-tile pattern matching the host screen; pattern refreshes
  ~every 10 s; PIN + pattern stay visible during the game so latecomers and disconnected players can still get in.
  [V-snippet] https://support.kahoot.com/hc/en-us/articles/35342050693789
  (2017 blog said 7 s and Classic-only; outdated) https://kahoot.com/blog/2017/02/08/use-2-step-join-option-secure-game/
- Kahoot live settings (gear icon, bottom-right of host screen): Remove players, Nickname generator, 2-Step Join,
  Lock game joining; some can be changed between questions. [V-snippet] https://support.kahoot.com/hc/articles/115016055107
- Mentimeter: three ways in: participation link, QR code (camera scan), temporary join code entered at menti.com.
  The join code sits **below the QR code or in the bottom-right corner of the slide** depending on options.
  Join code is temporary; QR and link are permanent. [V] https://help.mentimeter.com/en/articles/410537-how-to-vote
  (A "4 hours" lifetime for the code is a third-party claim, [U]: https://ahaslides.com/blog/ — not confirmed by Menti.)
- Pear Deck: students go to joinpd.com and type a **six-letter** Join Code; codes expire after one week, the session
  link is permanent; in Instructor-Paced mode the Projector View **automatically opens on the Join Instructions**;
  teacher reopens them by clicking the join code (top right of Dashboard). [V]
  https://docs.goguardian.com/products/pear-deck/present-a-session
  (Older Pear Deck pages say five letters — codes changed over time.) [S] https://help.peardeck.com/en/migrated/how-to-present-a-pear-deck
- Socrative: students join at gosocrative.com with the teacher's **room name**, or scan a QR the teacher shares after
  launching; may be asked for name or Student ID (rostered rooms require the ID). [V]
  https://help.socrative.com/en/articles/15195950-the-student-experience-in-socrative
- Poll Everywhere: the slide shows pollev.com/<presenter-username>; also SMS (text the username to a short code, then
  just A/B/C/D) and an app that remembers recent presenters. [V] https://support.polleverywhere.com/hc/en-us/articles/1260801556349-Responding-to-questions
- Gimkit: students join with QR, join link or game code; host hovers the game code to show a QR; a button copies the
  link; students logged into a Gimkit class join automatically. [S, low-quality mirrors only] — official help article
  not reachable. Treat as [U] for specifics.
- Blooket: join at blooket.com/play with a "Game ID"; late joining is a host checkbox ("Allow Late Joining", on by
  default). [V-snippet] https://help.blooket.com/hc/en-us/articles/15985153979415 ,
  https://help.blooket.com/hc/en-us/articles/16179035670167
- Wayground: students join at wayground.com/join with a numeric code, no account needed. [S] only; no official page
  reachable. Code length "usually 6 digits" is [U].
- Jackbox: players join at jackbox.tv with a room code shown on the shared screen. Official streamer guide offers a
  **"room code hiding" toggle** so the lobby stays visible but nobody can join until the host is ready; audience
  mode up to 10,000; "extended timers" toggle for stream delay. [V] https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/
  ("Four-letter room code" is from third-party guides, [S].)
- QR sizing rule of thumb: scan distance ≈ 10 × code width (1 m away → 10 cm code). Vendor guidance, not a
  standard. [S] https://delivr.com/faq/1539/what-ate-the-qr-code-guidelines-for-social-distancing ,
  https://scanova.io/blog/minimum-qr-code-size/ . At 10 m that means a ~1 m-wide QR, impossible on a normal
  projector, so the QR is for the front rows and the **typed code + short URL must carry the back of the room**.

**Lesson:** every product shows code + URL together; QR is a bonus, never the only path. Menti and Pear Deck tie a
permanent link to a temporary short code. Kahoot/Jackbox keep join info visible (or re-showable) after start for
late joiners; Jackbox lets the host hide it.

### 1.2 Joined count / roster

- Mentimeter: during a question, bottom-right counter "responses/active participants"; **when the QR is showing the
  counter is larger and reads "X out of Y responded"**; hidden QR → small corner counter. [V]
  https://help.mentimeter.com/en/articles/4542951-how-many-responses-have-i-received
- Mentimeter: while results are hidden, the presenter still sees how many joined and responded; "H" toggles results.
  [V] https://help.mentimeter.com/en/articles/422266-hide-results
- Pear Deck: Projector View responses are **anonymous by default**; names only on the private Teacher Dashboard
  (Premium). Recommended setup: project the Projector View, keep Dashboard in a private window. [V]
  https://docs.goguardian.com/products/pear-deck/present-a-session ,
  https://help.peardeck.com/use-the-projector-view-and-teacher-dashboard-at-the-same-time
- Gimkit: host removes a player in the lobby by hovering the name and clicking it; mid-game via leaderboard
  "Remove from Game" (not in Team Mode). [V] https://help.gimkit.com/en/article/remove-a-player-183fqmz
- Socrative: teachers can clear students from a room. [V] help.socrative.com (link above).
- Kahoot lobby name list + "Remove players" setting [V-snippet, see 1.1]. Exact roster layout not documented. [U]

**Lesson:** separate the _public_ screen (count, anonymous) from the _private_ teacher view (names, kick).
Mentimeter's "X out of Y responded" is the cleanest live-answer-count pattern and needs no names.

### 1.3 Question text, scaling, countdown

- Kahoot can show questions and answers on players' devices ("Show questions & answers on players' devices"),
  pitched as more accessible for students with visual impairments and for single-device remote play. [V-snippet]
  https://support.kahoot.com/hc/articles/115003197928 ; [V] https://kahoot.com/blog/2021/03/04/questions-answers-on-students-devices/
  Implication: by default the phone shows less than the projector (Kahoot's classic phone = coloured shapes only;
  this default is widely known but **not stated** on the pages I could read → [U]).
- Kahoot accessibility page: aims for WCAG 2.2 AA; high-contrast theme; read-aloud in apps; text scales to 200% via
  zoom; keyboard (Alt/Enter/Space); educators can **remove timers or extend time per question**; "Accuracy" mode
  rewards correctness over speed. [V] https://kahoot.com/accessibility/
- Mentimeter quiz: per-question "Time to respond"; speed scoring 1000→500 or fixed 1000. [V]
  https://help.mentimeter.com/en/articles/410463-mentimeter-quiz-competition
- Mentimeter accessibility statement: **time-based quizzes are harder for screen-reader users**; on desktop voting,
  text can't be enlarged because slides have a fixed aspect ratio. [V-snippet] https://www.mentimeter.com/accessibility
- Pear Deck: "Lock Screens" freezes student screens; click-and-hold starts a countdown timer. [V] goguardian link above.
- HQ Trivia (Big Human case study): during the countdown the host video **shrinks into the timer circle**; phone
  vibrates once per remaining second; host returns with results when time ends. [V] https://www.bighuman.com/work/hq-trivia
  "10-second" timer is from a PubNub tutorial, [S] https://www.pubnub.com/blog/build-your-own-hq-trivia-app-for-android/
- Server-deadline countdown (ring drains toward a server timestamp, not a local 10 s timer) — vendor blog, [S]
  https://vp0.com/blogs/live-trivia-game-ui-clone-hq-trivia . Sound engineering point regardless of source.
- Jackbox exposes "extended timers" as a first-class host option. [V] Jackbox guide above.

**Lesson:** timers should be optional and extendable (Kahoot, Jackbox); WCAG 2.2.1 (see §4) requires it unless the
time limit is essential. Drive the countdown from a server deadline.

### 1.4 Reveal / answer distribution

- Kahoot host screen after each question: correct answer + bar graph of how many chose each answer. [S]
  https://instruction.uh.edu/?p=10728 ; Kahoot community: correct answer and leaderboard show **only on the host
  screen**, not on devices. [V-snippet] https://support.kahoot.com/hc/en-us/community/posts/34484931017629
- Socrative teacher-paced: "How'd We Do" shows/hides results; correct answer highlighted green; each option shows
  % of students. [S] (older official user guide PDF mirror) https://sms-bse-bgb.discip.ac-caen.fr/IMG/pdf/socrativeuserguide_officiel.pdf
- Socrative: teacher can hide/unhide live results. [S] https://lthtreducationcentres.freshservice.com/support/solutions/articles/1000032112-how-to-deliver-a-quiz-on-socrative
- Poll Everywhere "activity flow": separate **instructions view** (options, no results) → **results view** → **correctness
  view** ("Show correct"); the results slide locks responses when displayed. [V] https://blog.polleverywhere.com/activity-flows-available ,
  [S] https://guides.himmelfarb.gwu.edu/polleverywhere/activities
- Poll Everywhere: lock before revealing so students can't change after seeing the key; "Allow changes" setting. [S]
  https://support.csuchico.edu/TDClient/1984/Portal/KB/ArticleDet?ID=113294
- Poll Everywhere: participant can be shown correctness Never / Immediately / after delay. [V]
  https://support.polleverywhere.com/hc/en-us/articles/1260801547050-Hide-correct-response-history
- Mentimeter: hide results while collecting; University of York found students preferred knowledge-check answers
  hidden while responses come in. [V] help.mentimeter.com 422266 ; [S] https://vle-support.york.ac.uk/other-tools/mentimeter/results/
- Pear Deck responses: Grid, List, Overlaid layouts; Show/Hide Responses toggle. [V] goguardian link.

**Lesson:** the reveal is a three-state sequence: _collecting (no distribution)_ → _closed + distribution_ →
_key marked_. Lock before marking. Keep distribution hidden while collecting to avoid herding.

### 1.5 Consistent answer positions host ↔ phone

- Kahoot answer randomization is a **single host-level setting** ("randomize order of answers" in Hosting settings),
  applied to the game, not per device; teachers have asked for per-device shuffling and there's no sign it exists.
  [V-snippet] https://support.kahoot.com/hc/en-us/articles/27877912748051-How-to-randomize-questions-for-Kahoot-games ,
  https://support.kahoot.com/hc/en-us/community/posts/22085595873939-Randomize-colours-for-correct-answer-on-single-devices
- Quizizz/Wayground "Shuffle answers" randomizes per student (they play self-paced on their own screen). [S]
  https://www.tsc.edu/assets/documents/academics/educational_technology/canvas/softwareandtechnologyresources/quizizz_free_quizzes_for_every_student.pdf

**Lesson:** if the projector shows options, the phone must show the same order and the same option labels
(A/B/C… or row labels), so "the class picked C" means the same thing everywhere. Shuffle once per session item,
not per device.

### 1.6 Colour-blind measures (applied to a results chart, not to answer tiles)

- Kahoot's shape+colour pairing (triangle/diamond/circle/square) is not described as a colour-blind feature on
  Kahoot's own accessibility page [V absence] https://kahoot.com/accessibility/ ; a teacher review credits shapes
  with helping colour-blind and low-vision students. [S] https://www.commonsense.org/education/reviews/kahoot/teacher-reviews/4657633
- WCAG 1.4.1 Use of Color: colour must not be the only way to convey information. [V] https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- WCAG 1.4.11: chart bars/graphical objects needed to understand content need 3:1 against adjacent colours. [V]
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- Mentimeter asks presenters to accompany charts with descriptions/summaries; themes keep 4.5:1. [V-snippet]
  https://help.mentimeter.com/en/articles/4280075-accessibility-in-mentimeter

**Lesson for LeaRN's distribution chart:** label every bar with its option letter _and_ count/percent directly on
the bar; mark the key with a glyph + text ("Correct") and a pattern or outline, not only green; keep bars in one
neutral hue and highlight only the key. Redundant encoding is the structural lesson of Kahoot's shapes.

---

## 2. Player phone screens

- Socrative is the best-documented state machine. Room states: **Waiting** (no activity launched), **Paused**,
  **Answer Submitted** (teacher-paced; wait for next question), **Completed**, **Ended** (teacher closed). [V]
  https://help.socrative.com/en/articles/15195950-the-student-experience-in-socrative
- Socrative: instant feedback (if on) shows correct choice, student's choice and the teacher's explanation; skipped
  questions listed before submit; confirm-submit step; completion message. [V] same.
- Socrative reconnect: if the connection drops or the tab closes, students **rejoin with the same name/ID and resume
  where they left off**. [V] same.
- Socrative: leave room from gear menu; rejoin for another attempt only if teacher allows; Hand Raise to request the
  teacher's attention. [V] same.
- Kahoot reconnect: if the screen says it is trying to reconnect, let it — points are kept; pressing back/refresh
  exits the game and a manual rejoin **starts at 0**. [V-snippet] https://support.kahoot.com/hc/articles/115003198708
  Community request confirms same-nickname rejoin still resets score. [V-snippet]
  https://support.kahoot.com/hc/en-us/community/posts/115000985067-Allow-disconnected-players-to-rejoin-with-their-prior-score
- Kahoot: rejoining players must pick a new nickname. [S] https://elearnzone.imu.edu.my/eticketing/kb/faq.php?id=143
- Gimkit: refreshing during the lobby risks being dropped; common errors "Game Not Found" / "Invalid Code" /
  locked or full. [S, low-quality] — wording [U].
- Poll Everywhere: "Clear last response" icon appears only when "Change answer" is enabled and the participant has
  responded; open-ended answers changeable for 60 s; with changes disabled, responses are final. [V]
  https://support.polleverywhere.com/hc/en-us/articles/9708482324507-Change-answer ,
  https://blog.polleverywhere.com/undo-your-response-to-a-multiple-choice-poll-no-more-accidents
- Kahoot 2-Step Join keeps late join possible while blocking bots (see 1.1). Blooket: late join default on. [V-snippet]
- Jackbox: the host's VIP can scrub offensive content from their own device; censored content is scribbled out for
  others. [V] Jackbox guide. (Relevant to name moderation.)
- Kicked / name-taken messaging: no vendor documents what the removed player sees (Gimkit, Socrative, Kahoot all
  silent). [U] — LeaRN must design this itself.
- Exact "You're in! See your nickname on screen?" Kahoot copy: [U], not found in official sources.
- Doherty Threshold: keep system response under ~400 ms so neither side waits. [V] https://lawsofux.com/doherty-threshold/
  → the "answer received" acknowledgement should be optimistic and immediate, then confirmed.

**Lesson:** model the phone as explicit named states (Waiting, Answering, Answer received, Paused, Closed/Reveal,
Ended, Reconnecting, Removed), each with one sentence of copy and one action. Socrative proves reconnect-by-identity
is expected; Kahoot shows the cost of not having it (score reset). Tell students "Don't refresh — we're
reconnecting" is a workaround, not a design.

---

## 3. Self-paced practice

- UWorld NCLEX QBank: **Tutor mode** (on by default) shows correct answer + rationale immediately after each
  question; **Timed** (off by default) for exam-pressure days; with Tutor off, answers and rationales appear at the
  end. Question modes on Create Test: unused, **incorrect**, **marked**, custom. Mark any question for later.
  Flashcards with spaced repetition from the question screen. [V]
  https://nursing.uworld.com/blog/7-tips-for-using-the-uworld-nclex-qbank/
- WSU guide to UWorld: tutor vs timed; filter by previously incorrect / marked / omitted / correct; Performance and
  Previous Tests in the left menu. [S] https://tech.medicine.wsu.edu/technology/medical-education/uworld/question-bank-students/
- Archer Review: Tutor Mode with immediate feedback; rationales for correct and incorrect options; CAT readiness
  assessments giving a pass-probability band (low → very high). Vendor marketing. [S]
  https://nurses.archerreview.com/nclex-rn/qbank-cat , https://archerreview.com/nclex-rn-qbank
- NCLEX itself: NGN case studies = six items in an unfolding scenario with exhibit tabs (Nurses' Notes, Vital Signs,
  Diagnostic Results); candidates **cannot go back** to earlier answers within a case. [S]
  https://wtcs.pressbooks.pub/nursingmpc/chapter/11-2-preparing-for-the-nclex/ ; item types [S]
  https://evolve.elsevier.com/education/next-generation-nclex/ngn-item-types ; NCSBN FAQ https://nclex.com/faqs.htm
- Wayground: "Mastery Mode" geared to async assignments and student-paced practice/review; "Redemption Questions"
  and a "Redemption Quiz" give another shot at missed questions; "Review and Submit" lets students choose section
  order. [V] https://wayground.com/blog/get-ready-for-back-to-school-with-the-hottest-22-23-quizizz-hits
  Exact mechanics [U].
- Quizizz (older): "Show answers after questions" and "Show Quiz Review on student devices at the end" are separate
  toggles; homework can be resumed later and ends at the deadline. [S] https://www.slideshare.net/Quizizz/quizizz-presentation-49737217
- Quizlet Learn: misses are re-asked at the end of each round; mode ends when each term is right twice in a row;
  afterwards study only missed terms or restart. [S] https://www.slideshare.net/slideshow/using-quizlet/15162607 ;
  Spell mode "spell each word correctly twice" to finish a round [V] https://help.quizlet.com/hc/articles/360030645752
- Duolingo: in-lesson progress bar shows how many exercises remain; Check/Continue in a fixed bottom-right position.
  [S] https://ixd.prattsi.org/2021/09/design-critique-duolingo-web-app/ , https://uxdesign.cc/duolingos-usability-analyzed-6bb44b0f2366
- Duolingo Practice Hub "Mistakes: review previous mistakes". [V] https://blog.duolingo.com/ways-to-practice-in-duolingo ,
  https://blog.duolingo.com/guide-to-duolingo-practice-hub/ . Whether a lesson auto-repeats missed items before
  completion: [U] from official sources.
- Goal-gradient effect: people speed up as they near a goal → visible progress ("Question 7 of 12") helps.
  [V] https://lawsofux.com/goal-gradient-effect/
- Zeigarnik effect: unfinished tasks are remembered → "Resume assignment (5 left)" on the home screen.
  [V] https://lawsofux.com/zeigarnik-effect/

**Lesson:** the qbank pattern nursing students already know is: choose Tutor (immediate rationale) vs exam-style
(rationale at end) → stable bottom action → progress "n of N" → results by item with rationale → "Practise only the
ones I missed" / "Marked". That is Jakob's Law in this domain (they use UWorld/Archer daily).

---

## 4. Frameworks and concrete numbers

### Apple HIG (fetched from the HIG JSON source)

- Control size table: iOS/iPadOS **default 44×44 pt, minimum 28×28 pt**; watchOS 44/28; visionOS 60/28; tvOS 66/56;
  macOS 28/20. Spacing: ~12 pt padding around bezelled elements, ~24 pt around borderless ones. [V]
  https://developer.apple.com/design/human-interface-guidelines/accessibility
- Type: iOS default 17 pt, minimum 11 pt; let people enlarge text at least 200%. [V] same.
- Contrast (Accessibility Inspector, WCAG AA): ≤17 pt text 4.5:1; ≥18 pt or bold 3:1. [V] same.
- Reduce Motion: reduce automatic/repetitive animation incl. zoom, scale, peripheral motion; replace x/y/z transitions
  with fades; avoid animating blur and depth. [V] same.
- Layout: use system layout guides and safe areas; "determine layout based on size classes, not device type or
  orientation." The HIG layout page gives **no numeric iPhone margin**; 16 pt (older iPhones) / 20 pt (iPad) are
  developer-blog observations, Apple says read `layoutMarginsGuide` instead of hard-coding. [V] https://developer.apple.com/design/human-interface-guidelines/layout ,
  https://developer.apple.com/documentation/uikit/uiview/layoutmarginsguide ; 16 pt figure [S] https://useyourloaf.com/blog/readable-content-guides/
- tvOS safe area (closest Apple analogue to a projected 10-foot UI): inset 60 pt top/bottom, 80 pt sides for overscan.
  [V] HIG layout page.

### Material 3 / Android

- Touch target ≥ **48×48 dp** (~9 mm), targets separated by ≥ 8 dp; visual icon can be 24 dp inside a 48 dp target.
  [V] https://support.google.com/accessibility/android/answer/7101858 ,
  https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/minimum-interactive-component-size.html
- Window size classes (width): **Compact < 600 dp; Medium 600–839; Expanded 840–1199; Large 1200–1599;
  Extra-large ≥ 1600**. Height: Compact < 480, Medium 480–899, Expanded ≥ 900. Width matters more; height class
  is for landscape phones. [V] https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
  (m3.material.io window-size-classes URL returned 404 on fetch.)

### WCAG 2.2 AA (and two AAA items that matter)

- 1.4.3 Contrast (Minimum): 4.5:1 text, 3:1 large text (≥18 pt / 14 pt bold ≈ 24 px / 18.66 px). [V]
  https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- 1.4.11 Non-text Contrast: 3:1 for UI component boundaries/states and meaningful graphics (chart bars, radio rings,
  focus indicators). [V] https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- 1.4.10 Reflow: no 2-D scrolling at **320 CSS px wide** (= 1280 px at 400% zoom) or 256 px tall for horizontal
  content; exception for content needing 2-D layout, e.g. **data tables (the table, not its cells)**, diagrams.
  [V] https://www.w3.org/WAI/WCAG22/Understanding/reflow.html → matrix/grid items and EHR tables may scroll inside
  themselves; the page around them may not.
- 1.4.4 Resize Text: 200% without loss. Failure **F94: viewport-unit-only font sizes can't be zoomed**; author text-size
  controls are an alternative way to pass. [V] https://www.w3.org/WAI/WCAG22/Techniques/failures/F94
- 1.4.1 Use of Color: colour not the sole cue. [V] link in 1.6.
- 2.4.7 Focus Visible (AA). [V] https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
- 2.4.11 Focus Not Obscured (Minimum) (AA): a focused component is not _entirely_ hidden by author content; sticky
  headers/footers and non-modal overlays are the usual failures; `scroll-padding` is a fix. [V]
  https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html → relevant to a sticky "Submit" bar
  and a sticky timer header on the phone.
- 2.5.8 Target Size (Minimum) (AA): **24×24 CSS px**, or undersized targets spaced so 24 px circles don't intersect;
  exceptions equivalent / inline / user-agent / essential. [V] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
  (2.5.5 AAA = 44×44.) 24 px is a floor; Apple 44 pt / Material 48 dp are the design targets.
- 2.2.1 Timing Adjustable (**Level A**): for any time limit, allow turn off, adjust ≥10×, or warn and allow ≥20 s
  extension with a simple action; exceptions: real-time event, essential, >20 h. [V]
  https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html → a teacher-run live question arguably is a
  "real-time event", but self-paced/assignment timers are not; give accommodations (extended time) anyway.
- 2.3.3 Animation from Interactions is **AAA**; sufficient techniques C39/SCR40 use `prefers-reduced-motion`. [V]
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html ;
  MDN https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

### Laws of UX (lawsofux.com)

- Fitts's Law: time to a target grows with distance, shrinks with size → big full-width answer rows, primary action
  in the thumb zone at the bottom. [V] https://lawsofux.com/fittss-law/
- Hick's Law: decision time grows with number/complexity of choices → one primary action per state; hide teacher
  controls behind the presenter's private view. [V] https://lawsofux.com/hicks-law/
- Jakob's Law: users expect your product to work like the ones they already use → mirror the NCLEX/UWorld item layout,
  and the Kahoot/Menti "code on the big screen, type it on your phone" flow. [V] https://lawsofux.com/jakobs-law/
- Peak-End Rule: experiences are judged by the peak and the end → design the reveal moment and the session-end
  summary deliberately (calm, informative), not the middle chrome. [V] https://lawsofux.com/peak-end-rule/
- Also relevant: Doherty Threshold (~400 ms), Goal-Gradient, Zeigarnik, Von Restorff (one thing stands out = the key
  on reveal), Miller's Law, Cognitive Load. [V] https://lawsofux.com/

---

## 5. Projector / distance legibility

Sources and rules:

- "1 inch of letter height per 10 feet" is a **sign-industry rule of thumb**, assuming good contrast, clean
  sans-serif, decent lighting; vendors label it an estimate. [S] https://banners.com/c/how-far-away-can-someone-read-a-banner-complete-banner-font-size-guide ,
  https://signsny.com/resources/distance-visibility/ . Highway (MUTCD) guidance is far more conservative
  (1 in per 30–40 ft) because it is about glance reading at speed. [S] https://www.fhwa.dot.gov/publications/research/safety/15027/004.cfm
- AVIXA / InfoComm DISCAS (ANSI/INFOCOMM V202.01:2016, now ANSI/AVIXA V202.01): two viewing categories,
  **Basic Decision Making (BDM, acuity factor 200)** and **Analytical Decision Making (ADM, acuity factor 3438)**;
  BDM works from "%Element Height" = element (e.g. a character) height ÷ screen height. [V]
  https://api.avixa.org/standards/discas-calculators/discas/learn-more-about-display-size ,
  https://avixa.org/standards/discas-calculators/discas/bdm . The exact BDM formula and recommended % range are behind
  the paid standard: [U]. ADM formula (secondary): image height = vertical resolution × farthest viewer ÷ 3438,
  i.e. one pixel subtends ~1 arcminute. [S] https://www.commercialintegrator.com/news/digital-display-size/98044/
- Legacy AV "4/6/8 rule": farthest viewer ≤ 4× (critical detail), 6× (presentations), 8× (video) image height.
  [S] https://blog.draperinc.com/2022/04/how-big-should-my-screen-be/
- DIN 1450: sizes by **x-height from visual angle**, M = 2D·tan(α/2) × correction; assumes visual acuity ≥ 0.7;
  ×1.4 (acuity ≥ 0.5) to ×1.75 (≥ 0.4) for low-vision audiences; the per-text-type angles are not published on the
  calculator page: [U]. [V] https://www.leserlich.info/werkzeuge/schriftgroessenrechner/index-en.php . ISO 24509:2019
  covers minimum legible font size by age, distance, luminance. [S] https://online.standard.no/en/iso-24509-2019
- Presentation-slide guidance from universities: ≥ 24 pt common (UW DO-IT, CU Boulder), 28 pt standard / 32 pt
  widescreen (Leeds), 18 pt absolute minimum (Cambridge). [V] https://www.washington.edu/doit/how-can-you-make-your-presentation-accessible ,
  https://hazards.colorado.edu/workshop/accessible-presentation-slides-posters ,
  https://digitalaccessibility.leeds.ac.uk/how-to-create-accessible-content/documents-presentations/create-accessible-powerpoint-presentations ,
  https://www.cctl.cam.ac.uk/slide-accessibility-guidance

My arithmetic (derived, not sourced — check before quoting):

- A 16:9 PowerPoint slide is 7.5 in = 540 pt tall. 24 pt ≈ **4.4% of screen height ≈ 48 px at 1080p**;
  32 pt ≈ 5.9% ≈ 64 px; 18 pt ≈ 3.3% ≈ 36 px. These are the "slides people can read" numbers in CSS px on a
  1920×1080 canvas.
- 1 in / 10 ft on a 100-inch-diagonal 16:9 screen (image height ≈ 49 in):
  3 m (≈10 ft) → 1 in letters ≈ 2.0% of height ≈ 22 px cap height ≈ **~31 px font-size**;
  6 m (≈20 ft) → 2 in ≈ 4.1% ≈ 44 px cap ≈ **~63 px font**;
  10 m (≈33 ft) → 3.3 in ≈ 6.7% ≈ 72 px cap ≈ **~100 px font** (cap height ≈ 0.7 em assumed; varies by face).
  Smaller screens scale these up proportionally, so express projector type as a **fraction of the stage height**,
  not fixed px.
- 4/6/8: a 49-in-tall image supports a farthest viewer of ~6 × 49 in ≈ 7.5 m for presentation content. A 10 m
  classroom with a 100" screen is beyond that; LeaRN's host view must use larger-than-slide type for the
  question stem and option labels, and fewer words.
- ADM implies a 1080p image 1.25 m tall seen from 10 m puts one pixel well under 1 arcminute → 1 px rules,
  hairline borders and thin chart gridlines vanish at the back. Use ≥ 3–4 px strokes on the host view.
- Practical host-view ladder at 1080p (proposal): question stem 56–72 px, option text 44–56 px, join code
  ≥ 160 px monospace with letter-spacing, counts/labels ≥ 36 px, nothing that must be read below ~32 px.

---

## 6. Fluid type and container queries

- MDN `clamp()`: `font-size: clamp(1rem, 2.5vw, 2rem)` grows with viewport between a floor and ceiling; MDN's
  accessibility note: **max should be a relative unit at least 2× the min** so text can reach 200% on zoom. [V]
  https://developer.mozilla.org/en-US/docs/Web/CSS/clamp
- WCAG F94: vw-only font sizes fail 1.4.4 because they don't respond to zoom; mix in rem (`calc(1rem + 1vw)` or a
  clamp with rem bounds). [V] https://www.w3.org/WAI/WCAG22/Techniques/failures/F94
- Smashing (Maxwell Barvian, 2023): clamped fluid type passes 1.4.4 in modern browsers if **max ≤ 2.5 × min**;
  e.g. `clamp(16px, 15.33px + 0.208vw, 18px)` passes, `clamp(16px, 5.33px + 3.33vw, 48px)` (3×) fails (only
  1.67× at some widths); test at the 500% browser zoom limit across widths (failure appeared ~1050–2100 px);
  use rem not px; checker at fluid.style/type. [V] https://www.smashingmagazine.com/2023/11/addressing-accessibility-concerns-fluid-type/
  Related: https://www.smashingmagazine.com/2022/12/fluid-typography-predict-problem-users-zoom-in/
- Container queries: `container-type: inline-size` + `@container (width > 700px)`; container units cqw/cqh/cqi/
  cqb/cqmin/cqmax (fall back to small-viewport units if no container). [V]
  https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries
- Support: size container queries ~95.9% global; Chrome/Edge 106, Firefox 110, Safari 16.0 (iOS 16.0),
  Samsung 20. [V] https://caniuse.com/css-container-queries . Baseline Newly available Feb 2023, **Widely
  available Aug 2025**. [V] https://web.dev/blog/baseline-digest-aug-2025
- Implication for the projector view: size the host "stage" with `container-type: size` and set stem/option/code
  sizes in `cqb`/`cqi` with a rem floor, e.g. `font-size: max(2rem, 6cqb)`. The projector isn't zoomed, but the
  same component on a teacher laptop is, so keep a rem term and offer a host "Text size" control (F94 says
  author-provided controls also satisfy 1.4.4).

---

## Top 15 lessons for LeaRN

1. **Join panel = typed code + short URL first, QR second.** QR only works from the front rows (~10:1 scan rule);
   the code must be readable at the back (≥160 px monospace at 1080p). Mentimeter/Pear Deck/Kahoot all pair them.
2. **Keep join info re-showable after start** (Kahoot keeps PIN visible under 2-Step Join; Pear Deck reopens on
   click) and let the teacher hide it (Jackbox room-code hiding) or lock joining (Kahoot).
3. **Public count, private names.** Projector shows "18 of 24 answered" (Mentimeter pattern); names, kick and
   per-student answers live only on the teacher's private view (Pear Deck anonymous projector + private dashboard).
4. **Reveal is three states:** collecting (no distribution) → closed with distribution → key marked. Lock before
   marking (Poll Everywhere). Hide the distribution while collecting (Mentimeter/York).
5. **Distribution chart uses redundant encoding:** option letter + count + % printed on each bar, key marked by a
   check glyph + "Correct" text + outline, one neutral hue otherwise (WCAG 1.4.1, 1.4.11; Kahoot's shapes lesson).
6. **One option order per session item, identical on projector and phone,** with the same A/B/C or row labels;
   never per-device shuffling during live play.
7. **Phone = explicit named states** with one sentence and at most one action each: Waiting, Answering, Answer
   received, Paused, Closed/Reveal, Ended, Reconnecting, Removed (Socrative's state list is the model).
8. **Reconnect by identity and resume** (Socrative) — never Kahoot's "refresh = score reset". Show "Reconnecting…"
   in place, keep the last answer visible, and never require the join code again within a session.
9. **"Answer received" must be immediate (<400 ms, Doherty) and unambiguous**, show what was submitted, and say
   whether it can still be changed (Poll Everywhere "Allow changes").
10. **Timers are optional and extendable** (Kahoot remove/extend, Jackbox extended timers); WCAG 2.2.1 is Level A.
    Drive countdowns from a server deadline; give a text "0:12 left", not only a ring.
11. **Self-paced follows the qbank pattern students already use** (Jakob): Tutor mode (rationale after each item)
    vs exam-style (rationale at end), "n of N" progress, mark/flag, and a results screen with "Practise the ones I
    missed" and "Marked" (UWorld, Quizlet, Wayground redemption).
12. **Design the end, not just the middle** (Peak-End): a calm session-end/practice-end summary with per-item
    outcome and rationale links, instead of podium/leaderboard.
13. **Targets: 44–48 px design target, 24 px hard floor** (Apple 44 pt, Material 48 dp, WCAG 2.5.8 24 px). Full-width
    option rows; sticky submit bar must not cover focused items (2.4.11; use scroll-padding).
14. **Reflow at 320 px:** page never scrolls in 2-D; matrix grids and EHR tables may scroll _inside_ their own
    region (1.4.10 data-table exception) with sticky row labels.
15. **Projector typography scales to the stage, not the viewport:** container units on a `container-type: size`
    stage with rem floors (`max(2rem, 6cqb)`), max ≤ 2.5× min for any clamp, ≥ 3 px strokes, stem ≥ ~56 px and
    nothing essential below ~32 px at 1080p; offer a host text-size control. Container queries are Baseline Widely
    available (Aug 2025).
