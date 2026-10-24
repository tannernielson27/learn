# UI overhaul: the approved design and how to build it

Owner-approved on 2026-10-22 (Checkpoint 2). Build the screens **as shown** in `mockups/`. Where a mockup and this page disagree, the mockup wins on look and this page wins on behaviour. Where either disagrees with `docs/glossary.md` on a word, the glossary wins.

- `PLAN.md`: the diagnosis, frameworks, responsive strategy, tokens, libraries and roadmap. Read §0, §6, §7, §9, §10 and §11 before building.
- `RESEARCH.md`: the sourced research behind it.
- `mockups/*.dc.html`: one file per screen, plain HTML with inline styles plus `mockups/lr.css` (the token and component sketch). Open a file in a browser to see it; the `{{…}}` holes and `<sc-for>` loops are filled by the small script at the bottom of each file, so read that script for the sample data. Sizes: phone 375×812, phone landscape 844×390, laptop 1280×800, desktop 1440×900, projector 1920×1080.

## Owner decisions that bind every builder

1. Clinical, responsive. No confetti, sound, streaks or leaderboards. The one podium is the top 5 on the projector when a live session ends (owner request, 2026-10-24; `docs/04-DESIGN-DIRECTION.md` §5). Motion: transform/opacity only, 120 to 320 ms, nothing loops, reduced motion = 80 ms fade.
2. Every question type keeps its NCLEX layout. No colour+shape answer tiles.
3. Live session: one route, two views. A **control view** for the teacher (names, controls, private live counts) and a **projector view** (stage) that shows no controls, opens in a second window or full screen on the same one. The stage is always light.
4. Names show on the stage in the lobby only; counts after Start. Exception (2026-10-24): the top 5 names, with their points, on the end-of-session podium.
5. No "Close answers" step: the reveal goes collecting → answer showing, as today.
6. "Review what I missed" and "Practise the N I missed" on practice and assignment results. The second needs a migration: build it, but the hosted push waits for the owner.
7. The last 10 seconds of a timer: bar turns `--flag` amber and "10 seconds left" appears as text. No pulse.
8. `lucide-react` is approved (match the `^` style in package.json).
9. Theme menu (System / Light / Dark) in the account menu; stored per browser.
10. Import JSON is gone from the quiz page (PR #478). Do not bring it back in any screen.

## Screen map

| Mockup                                                                                                                      | Route                                                                            | Today's main component(s)                                                                    | Phase |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| `Main.dc.html` (join, phone), `JoinDesktop.dc.html`                                                                         | `/join`, `/join/[code]`                                                          | `live/JoinForm`, `app/join/*`                                                                | A     |
| `LobbyStage.dc.html`                                                                                                        | `/live/[sessionId]` projector view (new)                                         | new `live/stage/*`                                                                           | A     |
| `LobbyControl.dc.html`, `LobbyControlPhone.dc.html`                                                                         | `/live/[sessionId]` control view, lobby                                          | `live/HostLobby` (558 lines: split it)                                                       | A     |
| `PhoneWaiting.dc.html`                                                                                                      | `/play/[sessionId]` waiting                                                      | `live/StudentRoom`, `lib/live/waiting.ts`                                                    | A     |
| `QuestionStage.dc.html`, `CaseStage.dc.html`                                                                                | projector view, running                                                          | new `live/stage/*`                                                                           | B     |
| `QuestionControl.dc.html`                                                                                                   | control view, running                                                            | `HostLobby`, `TimerControls`, `Countdown`, `HostResults`, `ItemStrip`, `Roster`              | B     |
| `PhoneQuestion.dc.html`, `PhoneQuestionLand.dc.html`, `PhoneSent.dc.html`, `PhoneReconnecting.dc.html`, `PhoneCase.dc.html` | `/play/[sessionId]`                                                              | `StudentRoom` (453 lines: split it), `StudentPacedRoom`, `AnswerSentLine`, `CaseStudyLayout` | B     |
| `RevealStage.dc.html`, `PhoneRevealed.dc.html`                                                                              | both views, answer showing                                                       | `live/results/*`, `StudentRoom` revealed                                                     | B     |
| `EndStage.dc.html`, `PhoneEnded.dc.html`                                                                                    | both views, ended                                                                | `HostLobby` ended, waiting copy                                                              | B     |
| `StudentHome.dc.html`                                                                                                       | `/learn`                                                                         | `app/learn/page.tsx` and its sections                                                        | E     |
| `PracticeCase.dc.html`                                                                                                      | `/learn/assignments/[id]`, `/learn/practice/[bankId]`, `/author/items/[id]/play` | `RecordLayout`, `EhrPanel`, `AttemptPlayer`, `PracticePlayer`, `QuestionShell`               | C     |
| `PracticePhone.dc.html`                                                                                                     | practice on a phone                                                              | `PracticePlayer`, `QuestionShell`, `feedbackMarks`                                           | C     |
| `ResultsDesktop.dc.html`, `ResultsPhone.dc.html`                                                                            | `/learn/assignments/[id]/results`, end of practice                               | `assignments/results/*`, `PracticePlayer`                                                    | C     |
| `LibraryDesktop.dc.html`, `LibraryPhone.dc.html`                                                                            | `/author`                                                                        | `app/author/page.tsx`, `BankList`, `LibraryFolderList`, `TeacherNav`                         | D     |
| `QuizDesktop.dc.html`                                                                                                       | `/author/banks/[bankId]`                                                         | quiz page (411 lines: split it), `ItemList`, `CaseStudyList`                                 | D     |
| `EditorDesktop.dc.html`                                                                                                     | `/author/items/[itemId]`                                                         | `EditorShell` (520 lines: split it), the editors                                             | D     |
| `Foundation.dc.html`                                                                                                        | `/gallery/primitives`, `/gallery/tokens`                                         | `components/ui/*`, `styles/tokens.css`                                                       | F0    |

Screens with no mockup (classes, workspace, sessions list, reports, AI import, case study builder, auth, account, help, landing, error and not-found pages) take the new AppShell, tokens and components with their current structure, widened per PLAN.md §6. No new layouts there without a mockup.

## Rules for builders

- Read `CLAUDE.md`, `AGENTS.md` (this Next.js differs from your training data: read `node_modules/next/dist/docs/` before Next code), `docs/03-AGENT-WORKFLOW.md`, `docs/04-DESIGN-DIRECTION.md`, `docs/glossary.md`.
- Tests first. Keep `src/lib/ngn/**` pure and its 90% gate. Keys never reach a phone before reveal: no projector or control-view change may move a key into a student path.
- Files 200 to 400 lines, 800 max. No colours or sizes outside the tokens. Every async action has an explicit error state.
- Copy changes move the tests that match visible text (`exact: true` in Playwright). Screenshot baselines are regenerated once at the end, from CI (docs/05), not per branch.
- Branch from the commit you are told to; never from main. Never push to main, never touch hosted Supabase.
