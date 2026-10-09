import type { WorkspaceMember } from "@/lib/supabase/workspace";
import { formatWorkspaceDate, memberRoleLabel } from "@/lib/workspace/workspace";

export interface MemberListProps {
  members: readonly WorkspaceMember[];
  /** The signed-in teacher's own id, to mark their row. */
  viewerId: string;
}

/**
 * The teachers of a workspace. Names and addresses are other people's words: they are drawn as
 * text and never as markup. There is no removing a colleague in this version, so no row has a
 * button.
 */
export function MemberList({ members, viewerId }: MemberListProps) {
  return (
    <ul aria-label="Members" className="flex flex-col divide-y divide-line border-y border-line">
      {members.map((member) => {
        const joined = formatWorkspaceDate(member.joinedAt);
        return (
          <li
            key={member.profileId}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="break-words text-ink-1">
                {member.displayName ?? member.email}
                {member.profileId === viewerId ? <span className="text-ink-2"> (you)</span> : null}
              </span>
              {member.displayName ? (
                <span className="text-sm break-all text-ink-2">{member.email}</span>
              ) : null}
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{memberRoleLabel(member.role)}</span>
              {joined ? <span className="font-mono">Joined {joined}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
