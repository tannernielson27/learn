import { Folder } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { countLabel } from "@/lib/authoring/folders";
import type { LibraryFolderRow } from "@/lib/authoring/libraryFolders";
import { LIBRARY_PATH } from "@/lib/authoring/teacherNav";

export interface LibraryFolderListProps {
  /** The folders at this level of the library, already in name order. */
  folders: readonly LibraryFolderRow[];
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
            <Icon icon={Folder} className="text-ink-2" />
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
