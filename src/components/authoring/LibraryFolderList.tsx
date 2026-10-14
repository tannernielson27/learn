import Link from "next/link";
import { countLabel } from "@/lib/authoring/folders";
import type { LibraryFolderRow } from "@/lib/authoring/libraryFolders";
import { LIBRARY_PATH } from "@/lib/authoring/teacherNav";

export interface LibraryFolderListProps {
  /** The folders at this level of the library, already in name order. */
  folders: readonly LibraryFolderRow[];
}

/** Lucide's folder, at the design direction's 20px and 1.75 stroke. Decoration only. */
function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-2"
    >
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

/** One level of library folders (#411), each opening its own view. One action per row. */
export function LibraryFolderList({ folders }: LibraryFolderListProps) {
  if (folders.length === 0) return null;
  return (
    <ul aria-label="Folders" className="flex flex-col divide-y divide-line border-y border-line">
      {folders.map((folder) => (
        <li key={folder.id}>
          <Link
            href={`${LIBRARY_PATH}?folder=${folder.id}`}
            className="tap-target flex items-center gap-3 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <FolderIcon />
            <span className="min-w-0 flex-1 font-medium break-words text-ink-1">{folder.name}</span>
            <span className="shrink-0 text-sm text-ink-2">
              {countLabel(folder.quizCount, "quiz", "quizzes") ?? "No quizzes"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
