import { Card } from "@/components/ui/Card";
import type { BankFilter } from "@/lib/authoring/bankSearch";
import { MAX_FOLDER_DEPTH, type FolderRow, type FolderView } from "@/lib/authoring/folders";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import { DeleteFolderForm } from "./DeleteFolderForm";
import { FolderNameForm, type FolderFormState } from "./FolderNameForm";
import { FolderTree } from "./FolderTree";
import { TurnFolderIntoQuizButton } from "./TurnFolderIntoQuizButton";

type FolderAction = (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;

export interface QuizFolderPanelProps {
  bankId: string;
  /** Every folder inside the quiz. */
  folders: readonly FolderRow[];
  view: FolderView;
  filter: BankFilter;
  /** The open folder, or null in All questions and Not in a folder. */
  folder: FolderRow | null;
  /** How deep the open folder is: a new folder goes no deeper than MAX_FOLDER_DEPTH. */
  depth: number;
  /** Turn into a quiz (#417), offered only when everything that stays behind is known. */
  turnInto?: {
    action: () => Promise<ConfirmOutcome | void>;
    quizName: string;
    staysBehind: readonly string[];
  };
  createFolder: FolderAction;
  renameFolder?: FolderAction;
  deleteFolder?: FolderAction;
}

/**
 * The folders inside a quiz that still has some (#411), in the quiz page's side column: the tree,
 * New folder, and the open folder's own controls. A quiz made since #411 has none, and no panel.
 */
export function QuizFolderPanel({
  bankId,
  folders,
  view,
  filter,
  folder,
  depth,
  turnInto,
  createFolder,
  renameFolder,
  deleteFolder,
}: QuizFolderPanelProps) {
  return (
    <Card padding="sm" className="flex flex-col gap-6">
      <FolderTree bankId={bankId} folders={folders} view={view} filter={filter} />
      {depth < MAX_FOLDER_DEPTH ? (
        <FolderNameForm
          // Keyed by the open folder, so a half-typed name never carries into another folder.
          key={`new-${folder?.id ?? "top"}`}
          action={createFolder}
          label="Folder name"
          hint={folder ? `Inside ${folder.name}.` : undefined}
          submitLabel="Create folder"
        />
      ) : (
        <p className="text-sm text-ink-2">Folders go at most {MAX_FOLDER_DEPTH} levels deep.</p>
      )}
      {folder ? (
        <section
          aria-labelledby="folder-heading"
          className="flex flex-col gap-4 border-t border-line pt-4"
        >
          <h2 id="folder-heading" className="text-sm font-semibold text-ink-2">
            This folder
          </h2>
          {renameFolder ? (
            <FolderNameForm
              key={`rename-${folder.id}`}
              action={renameFolder}
              label="New name"
              submitLabel="Rename folder"
              initialName={folder.name}
            />
          ) : null}
          {deleteFolder ? (
            <DeleteFolderForm key={`delete-${folder.id}`} action={deleteFolder} />
          ) : null}
          {turnInto ? (
            <TurnFolderIntoQuizButton
              key={`turn-${folder.id}`}
              action={turnInto.action}
              folderName={folder.name}
              quizName={turnInto.quizName}
              staysBehind={turnInto.staysBehind}
            />
          ) : null}
        </section>
      ) : null}
    </Card>
  );
}
