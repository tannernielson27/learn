/**
 * What a student's lists say about each of their classes. Pure: no React, no Next, no Supabase.
 *
 * One account can be in classes of more than one teacher's workspace, and two of those classes may
 * share a name. `my_classes()` returns each class's workspace name; a row that names a class shows
 * that workspace beside it, but only for a student whose classes span more than one workspace, so
 * everybody else reads what they always have.
 *
 * Workspaces are told apart by the number `my_classes()` gives each of the student's own (1, 2,
 * 3 ..., never the workspace's id), so two workspaces with the same name still count as two and
 * both are named. A database that has not got 20261011010000 yet sends no number; such a class is
 * told apart by its workspace's name, as before, where two of one name count as one.
 */

/** One of the student's own classes, as `myClasses` returns it. */
export interface StudentClassEntry {
  id: string;
  name: string;
  timeZone: string;
  workspaceName: string | null;
  /** Which of the student's workspaces the class is in. Absent or null when the database sends none. */
  workspaceNumber?: number | null;
}

export interface StudentClassInfo {
  name: string;
  /** The zone its due times are shown in (#242). */
  timeZone: string;
  /** Set only when the student's classes span more than one workspace. */
  workspaceName?: string | null;
}

function known(workspaceName: string | null | undefined): string | null {
  const name = workspaceName?.trim();
  return name ? name : null;
}

/** What tells a class's workspace from another: its number, else its name, else nothing. */
function workspaceIdentity(
  entry: Pick<StudentClassEntry, "workspaceName" | "workspaceNumber">,
): string | null {
  if (typeof entry.workspaceNumber === "number") return `number:${entry.workspaceNumber}`;
  const name = known(entry.workspaceName);
  return name ? `name:${name}` : null;
}

/**
 * Whether the classes belong to more than one workspace. A class whose workspace is neither
 * numbered nor named is not counted.
 */
export function spansWorkspaces(
  classes: readonly Pick<StudentClassEntry, "workspaceName" | "workspaceNumber">[] | null,
): boolean {
  const workspaces = new Set<string>();
  for (const entry of classes ?? []) {
    const identity = workspaceIdentity(entry);
    if (identity) workspaces.add(identity);
  }
  return workspaces.size > 1;
}

/** Class id to what a row says about that class. Empty when the classes could not be read. */
export function studentClassInfo(
  classes: readonly StudentClassEntry[] | null,
): Map<string, StudentClassInfo> {
  const withWorkspace = spansWorkspaces(classes);
  return new Map(
    (classes ?? []).map((entry) => [
      entry.id,
      {
        name: entry.name,
        timeZone: entry.timeZone,
        workspaceName: withWorkspace ? known(entry.workspaceName) : null,
      },
    ]),
  );
}

/**
 * The workspace a row that names no class shows (a practice bank): its name, under the same rule
 * as a class row, so only when `acrossWorkspaces` (`spansWorkspaces` of the student's classes).
 */
export function workspaceLabel(
  workspaceName: string | null | undefined,
  acrossWorkspaces: boolean,
): string | null {
  return acrossWorkspaces ? known(workspaceName) : null;
}

/** "NUR 301", or "NUR 301, Ada's workspace" when the workspace is carried. Plain text. */
export function classLabel(
  info: Pick<StudentClassInfo, "name" | "workspaceName"> | undefined,
  fallback = "Your class",
): string {
  if (!info) return fallback;
  const workspace = known(info.workspaceName);
  return workspace ? `${info.name}, ${workspace}` : info.name;
}
