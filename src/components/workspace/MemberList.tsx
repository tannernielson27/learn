import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import type { WorkspaceMember } from "@/lib/supabase/workspace";
import { formatWorkspaceDate, memberRoleLabel } from "@/lib/workspace/workspace";
import { RemoveMemberButton } from "./RemoveMemberButton";

export interface MemberListProps {
  members: readonly WorkspaceMember[];
  /** The signed-in teacher's own id, to mark their row. */
  viewerId: string;
  /**
   * `orgs.founder_id`: who started the workspace. Their row says so. Null when there is none, or
   * when it could not be read; nobody is marked then and nobody can be removed.
   */
  founderId?: string | null;
  /**
   * The remove Server Function bound to one colleague. The page passes it only to the founder,
   * and even then no button is drawn on the founder's own row: `remove_org_member` would refuse.
   */
  removeActionFor?: (memberId: string) => () => Promise<ConfirmOutcome | void>;
  /** The id of the focusable heading above the list, for focus after a row is removed. */
  focusAfterRemove?: string;
}

/**
 * The teachers of a workspace. Names and addresses are other people's words: they are drawn as
 * text and never as markup. Only the founder is given a way to remove a colleague (ADR 0011);
 * for everybody else, and in the shared workspace, no row has a button.
 */
export function MemberList({
  members,
  viewerId,
  founderId = null,
  removeActionFor,
  focusAfterRemove,
}: MemberListProps) {
  const viewerIsFounder = founderId !== null && founderId === viewerId;
  return (
    <ul aria-label="Members" className="flex flex-col divide-y divide-line border-y border-line">
      {members.map((member) => {
        const joined = formatWorkspaceDate(member.joinedAt);
        const isFounder = founderId !== null && member.profileId === founderId;
        const removable = viewerIsFounder && !isFounder && removeActionFor !== undefined;
        return (
          <li
            key={member.profileId}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="break-words text-ink-1">
                {member.displayName ?? member.email}
                {member.profileId === viewerId ? <span className="text-ink-2"> (you)</span> : null}
              </span>
              {member.displayName ? (
                <span className="text-sm break-all text-ink-2">{member.email}</span>
              ) : null}
              <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
                <span>{memberRoleLabel(member.role)}</span>
                {isFounder ? <span>Started this workspace</span> : null}
                {joined ? <span className="font-mono">Joined {joined}</span> : null}
              </span>
            </span>
            {removable ? (
              <RemoveMemberButton
                action={removeActionFor(member.profileId)}
                name={member.displayName ?? member.email}
                focusOnSuccess={focusAfterRemove}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
