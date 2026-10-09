/**
 * What a student's lists say about each of their classes. Pure: no React, no Next, no Supabase.
 *
 * One account can be in classes of more than one teacher's workspace, and two of those classes may
 * share a name. `my_classes()` returns each class's workspace name; a row that names a class shows
 * that workspace beside it, but only for a student whose classes span more than one workspace, so
 * everybody else reads what they always have.
 *
 * Workspaces are told apart by name, which is all `my_classes()` gives: two workspaces with the
 * same name count as one.
 */

/** One of the student's own classes, as `myClasses` returns it. */
export interface StudentClassEntry {
  id: string;
  name: string;
  timeZone: string;
  workspaceName: string | null;
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

/** Whether the classes belong to more than one workspace, counting only workspaces that are named. */
export function spansWorkspaces(
  classes: readonly Pick<StudentClassEntry, "workspaceName">[] | null,
): boolean {
  const names = new Set<string>();
  for (const entry of classes ?? []) {
    const name = known(entry.workspaceName);
    if (name) names.add(name);
  }
  return names.size > 1;
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

/** "NUR 301", or "NUR 301, Ada's workspace" when the workspace is carried. Plain text. */
export function classLabel(
  info: Pick<StudentClassInfo, "name" | "workspaceName"> | undefined,
  fallback = "Your class",
): string {
  if (!info) return fallback;
  const workspace = known(info.workspaceName);
  return workspace ? `${info.name}, ${workspace}` : info.name;
}
