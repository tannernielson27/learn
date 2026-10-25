import type { BankSummary } from "@/lib/authoring/banks";
import type { AssignmentSummary } from "@/lib/supabase/assignments";
import type { ClassDetail, RosterEntry } from "@/lib/supabase/classes";
import type { ShareEntry } from "@/lib/supabase/practiceShares";

/**
 * One class as its page reads it, small enough to check by hand. It drives the overview's unit
 * tests, the class page's component tests and the gallery's class page, whose screenshots cover
 * the layout. Every name is fictional.
 *
 * At `CLASS_PAGE_FIXTURE_NOW`: four students (Priya joined last, Sam has not signed in yet), one
 * assignment closed, one open until Thursday, one not yet open, and one quiz shared for practice.
 */
export const CLASS_PAGE_FIXTURE_NOW = new Date("2026-10-27T15:00:00Z");

export const CLASS_PAGE_FIXTURE_CLASS: ClassDetail = {
  id: "00000000-0000-4000-8000-00000000c1a5",
  name: "NUR 310 Adult Health, Fall",
  inviteToken: "Gx7_q2LmVb9TzR4wKc1NpHs8YdQe3UaJ",
  joinCode: "HK7M2QPW",
  timeZone: "America/Denver",
};

export const CLASS_PAGE_FIXTURE_ORIGIN = "https://learn.example";

export const CLASS_PAGE_FIXTURE_ROSTER: RosterEntry[] = [
  {
    profileId: "00000000-0000-4000-8000-0000000000a1",
    email: "ana.reyes@example.test",
    displayName: "Ana Reyes",
    joinedAt: "2026-09-02T16:05:00Z",
    signedIn: true,
  },
  {
    profileId: "00000000-0000-4000-8000-0000000000a2",
    email: "kai.ortiz@example.test",
    displayName: "Kai Ortiz",
    joinedAt: "2026-09-02T16:07:00Z",
    signedIn: true,
  },
  {
    profileId: "00000000-0000-4000-8000-0000000000a3",
    email: "priya.shah@example.test",
    displayName: "Priya Shah",
    joinedAt: "2026-10-20T14:30:00Z",
    signedIn: true,
  },
  {
    profileId: "00000000-0000-4000-8000-0000000000a4",
    email: "sam.lee@example.test",
    displayName: null,
    joinedAt: "2026-10-01T09:12:00Z",
    signedIn: false,
  },
];

const CLASS_ID = CLASS_PAGE_FIXTURE_CLASS.id;

export const CLASS_PAGE_FIXTURE_ASSIGNMENTS: AssignmentSummary[] = [
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    classId: CLASS_ID,
    title: "Week 6: Fluid and electrolytes",
    opensAt: "2026-10-12T15:00:00Z",
    closesAt: "2026-10-19T23:59:00Z",
    maxAttempts: 1,
    shuffleOptions: false,
  },
  {
    id: "00000000-0000-4000-8000-0000000000b2",
    classId: CLASS_ID,
    title: "Week 8: Heart failure case study",
    opensAt: "2026-10-26T15:00:00Z",
    closesAt: "2026-10-29T23:59:00Z",
    maxAttempts: 2,
    shuffleOptions: true,
  },
  {
    id: "00000000-0000-4000-8000-0000000000b3",
    classId: CLASS_ID,
    title: "Week 9: Respiratory",
    opensAt: "2026-11-02T15:00:00Z",
    closesAt: "2026-11-05T23:59:00Z",
    maxAttempts: 1,
    shuffleOptions: false,
  },
];

export const CLASS_PAGE_FIXTURE_SHARES: ShareEntry[] = [
  {
    id: "00000000-0000-4000-8000-0000000000d1",
    name: "Cardiac week",
    sharedAt: "2026-10-05T18:00:00Z",
  },
];

export const CLASS_PAGE_FIXTURE_BANKS: BankSummary[] = [
  {
    id: "00000000-0000-4000-8000-0000000000d1",
    name: "Cardiac week",
    itemCount: 12,
    updatedAt: "2026-10-04T18:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-0000000000d2",
    name: "Respiratory review",
    itemCount: 9,
    updatedAt: "2026-10-21T18:00:00Z",
  },
];
