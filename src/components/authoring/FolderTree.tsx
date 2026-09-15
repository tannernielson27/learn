import Link from "next/link";
import type { ReactNode } from "react";
import {
  buildFolderTree,
  UNFILED,
  type FolderNode,
  type FolderRow,
  type FolderView,
} from "@/lib/authoring/folders";

export interface FolderTreeProps {
  bankId: string;
  folders: readonly FolderRow[];
  view: FolderView;
}

const linkClass =
  "tap-target flex min-w-0 items-center rounded-sm px-2 text-sm break-words text-ink-1 transition-colors duration-fast hover:bg-surface-2 aria-[current=page]:font-medium aria-[current=page]:text-accent-ink";

function TreeLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={linkClass}>
      {children}
    </Link>
  );
}

function Branch({
  nodes,
  base,
  currentId,
  nested,
}: {
  nodes: FolderNode[];
  base: string;
  currentId: string | null;
  nested: boolean;
}) {
  return (
    <ul className={nested ? "ml-3 flex flex-col border-l border-line pl-2" : "flex flex-col"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <TreeLink href={`${base}?folder=${node.id}`} current={node.id === currentId}>
            {node.name}
          </TreeLink>
          {node.children.length > 0 ? (
            <Branch nodes={node.children} base={base} currentId={currentId} nested />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * A bank's folders as nested lists of links: every link is reachable with Tab and opens with
 * Enter, and the open view is marked as the current page.
 */
export function FolderTree({ bankId, folders, view }: FolderTreeProps) {
  const base = `/author/banks/${bankId}`;
  const tree = buildFolderTree(folders);
  return (
    <nav aria-label="Folders" className="flex flex-col gap-2">
      <ul className="flex flex-col">
        <li>
          <TreeLink href={base} current={view.kind === "all"}>
            All content
          </TreeLink>
        </li>
        <li>
          <TreeLink href={`${base}?folder=${UNFILED}`} current={view.kind === "unfiled"}>
            Unfiled
          </TreeLink>
        </li>
      </ul>
      <div className="border-t border-line pt-2">
        {tree.length > 0 ? (
          <Branch
            nodes={tree}
            base={base}
            currentId={view.kind === "folder" ? view.id : null}
            nested={false}
          />
        ) : (
          <p className="px-2 text-sm text-ink-2">No folders yet.</p>
        )}
      </div>
    </nav>
  );
}
