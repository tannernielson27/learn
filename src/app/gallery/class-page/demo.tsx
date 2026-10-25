"use client";

import { useHydrated } from "@/components/assignments/useHydrated";
import { ClassPageView, type ClassPageActions } from "@/components/classes/ClassPageView";
import { inviteUrl } from "@/lib/classes/classes";
import {
  CLASS_PAGE_FIXTURE_ASSIGNMENTS,
  CLASS_PAGE_FIXTURE_BANKS,
  CLASS_PAGE_FIXTURE_CLASS,
  CLASS_PAGE_FIXTURE_NOW,
  CLASS_PAGE_FIXTURE_ORIGIN,
  CLASS_PAGE_FIXTURE_ROSTER,
  CLASS_PAGE_FIXTURE_SHARES,
} from "@/lib/classes/classPageFixture";
import {
  PROGRESS_FIXTURE,
  PROGRESS_FIXTURE_SESSION_LIST,
} from "@/lib/classes/classProgressFixture";
import type { ClassTab } from "@/lib/classes/classTabs";
import { buildClassProgress, type ProgressSort } from "@/lib/classes/progress";

const NOT_HERE = "Not in the gallery.";

/** Gallery-only: every action answers that it is not available, and nothing is sent anywhere. */
const ACTIONS: ClassPageActions = {
  rename: async () => ({ status: "error", error: NOT_HERE }),
  setTimeZone: async () => ({ status: "error", error: NOT_HERE }),
  rotateInvite: async () => ({ ok: false, message: NOT_HERE }),
  removeStudentFor: () => async () => ({ ok: false, message: NOT_HERE }),
  editAssignmentFor: () => async () => ({ status: "error", error: NOT_HERE }),
  deleteAssignmentFor: () => async () => {},
  share: async () => ({ status: "error", error: NOT_HERE }),
  stopSharingFor: () => async () => ({ ok: false, message: NOT_HERE }),
};

const PROGRESS = buildClassProgress(PROGRESS_FIXTURE);

export function ClassPageDemo({
  tab,
  zones,
  sort = "name",
}: {
  tab: ClassTab;
  zones: readonly string[];
  sort?: ProgressSort;
}) {
  // e2e waits for this before a screenshot: local times are rewritten once hydrated.
  const hydrated = useHydrated();
  return (
    <div data-hydrated={hydrated} data-testid="class-page-demo">
      <ClassPageView
        detail={CLASS_PAGE_FIXTURE_CLASS}
        url={inviteUrl(CLASS_PAGE_FIXTURE_ORIGIN, CLASS_PAGE_FIXTURE_CLASS.inviteToken)}
        roster={CLASS_PAGE_FIXTURE_ROSTER}
        assignments={CLASS_PAGE_FIXTURE_ASSIGNMENTS}
        shares={CLASS_PAGE_FIXTURE_SHARES}
        banks={CLASS_PAGE_FIXTURE_BANKS}
        progress={PROGRESS}
        progressSort={sort}
        sessions={PROGRESS_FIXTURE_SESSION_LIST}
        zones={zones}
        now={CLASS_PAGE_FIXTURE_NOW}
        tab={tab}
        actions={ACTIONS}
      />
    </div>
  );
}
