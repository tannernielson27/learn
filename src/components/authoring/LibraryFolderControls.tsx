import { DeleteFolderForm } from "./DeleteFolderForm";
import { FolderNameForm, type FolderFormState } from "./FolderNameForm";

type FolderAction = (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;

export interface LibraryFolderControlsProps {
  /** The open folder, or null at the top of the library and in All quizzes. */
  folder: { id: string; name: string } | null;
  /** Creates a folder inside the open one (or at the top); absent where folders go no deeper. */
  createFolder?: FolderAction;
  renameFolder?: FolderAction;
  deleteFolder?: FolderAction;
}

const SUMMARY_CLASS =
  "tap-target flex cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-accent-ink hover:bg-accent-soft";

/**
 * New folder, and Rename and Delete for the open one (#411), under the folder rail from 1024px
 * (Library mockup) and under the chips on a phone. Each is a disclosure, so the rail stays a list.
 */
export function LibraryFolderControls({
  folder,
  createFolder,
  renameFolder,
  deleteFolder,
}: LibraryFolderControlsProps) {
  const key = folder?.id ?? "top";
  return (
    <div className="flex flex-col gap-1 lg:border-t lg:border-line lg:pt-3">
      {createFolder ? (
        <details key={`new-folder-details-${key}`}>
          <summary className={SUMMARY_CLASS}>New folder</summary>
          <div className="mt-3 px-1 sm:max-w-md">
            <FolderNameForm
              // Keyed by the open folder, so a half-typed name never carries into another one.
              key={`new-folder-${key}`}
              action={createFolder}
              label="Folder name"
              submitLabel="Create folder"
            />
          </div>
        </details>
      ) : null}
      {folder && renameFolder ? (
        <details key={`rename-details-${folder.id}`}>
          <summary className={SUMMARY_CLASS}>Rename folder</summary>
          <div className="mt-3 px-1 sm:max-w-md">
            <FolderNameForm
              key={`rename-${folder.id}`}
              action={renameFolder}
              label="New name"
              submitLabel="Rename folder"
              initialName={folder.name}
            />
          </div>
        </details>
      ) : null}
      {folder && deleteFolder ? (
        <div className="px-1 pt-2">
          <DeleteFolderForm key={`delete-${folder.id}`} action={deleteFolder} />
        </div>
      ) : null}
    </div>
  );
}
