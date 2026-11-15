"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  archiveSessionsAction,
  renameSessionAction,
  restoreSessionsAction,
} from "@/app/author/sessions/actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { SESSION_TITLE_MAX, type HousekeepingResult } from "@/lib/supabase/sessionHousekeeping";
import { groupId, SessionRowLink } from "./SessionList";

export interface ManagedSessionGroup {
  label: string;
  sessions: SessionSummary[];
}

export interface ManagedSessionListProps {
  groups: readonly ManagedSessionGroup[];
  /** The signed-in teacher: only their own sessions can be renamed or archived. */
  viewerId: string;
  /** The list is the Archived view, so rows offer Restore instead of Archive. */
  archivedView: boolean;
}

/** What the last archive or restore did, with the way to take it back. */
interface Done {
  message: string;
  undo: { ids: string[]; archive: boolean } | null;
}

const count = (n: number) => (n === 1 ? "1 live session" : `${n} live sessions`);

/**
 * The Live sessions list with the teacher's housekeeping (#565): rename any session they ran,
 * archive an ended one (or several at once) out of the main list, and restore it from the
 * Archived view. Archiving is undone from the line it leaves rather than confirmed first: nothing
 * is lost, so a question before every archive would only be in the way. Deleting is not offered;
 * a session is the record of a class that happened.
 */
export function ManagedSessionList({ groups, viewerId, archivedView }: ManagedSessionListProps) {
  const [pending, startTransition] = useTransition();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<SessionSummary | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = groups.flatMap((group) => group.sessions);
  const mine = (session: SessionSummary) => session.hostId === viewerId;
  const archivable = (session: SessionSummary) => mine(session) && session.status === "ended";
  const selectable = all.filter(archivable);

  const run = (task: () => Promise<HousekeepingResult>, after: (count: number) => void) => {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.ok) after(result.count);
      else setError(result.error);
    });
  };

  /** Archive in the main list, restore in the Archived view; Undo does the other. */
  const changeArchive = (ids: string[], archive: boolean, offerUndo = true) =>
    run(
      () => (archive ? archiveSessionsAction(ids) : restoreSessionsAction(ids)),
      (n) => {
        setSelected(new Set());
        setSelecting(false);
        setDone({
          message: `${archive ? "Archived" : "Restored"} ${count(n)}.`,
          undo: offerUndo && n > 0 ? { ids, archive: !archive } : null,
        });
      },
    );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      {selectable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {selecting ? (
            <>
              <span className="text-sm text-ink-2" role="status">
                {selected.size === 0 ? "None selected" : `${selected.size} selected`}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={selected.size === 0}
                busy={pending}
                onClick={() => changeArchive([...selected], !archivedView)}
              >
                {archivedView ? "Restore selected" : "Archive selected"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set(selectable.map((session) => session.id)))}
              >
                Select all {selectable.length}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setSelecting(true)}>
              {archivedView ? "Select to restore" : "Select to archive"}
            </Button>
          )}
        </div>
      ) : null}

      {error !== null ? <Notice role="alert">{error}</Notice> : null}
      {done !== null ? (
        <div className="flex flex-wrap items-center gap-x-4 rounded-sm border border-line bg-surface-1 px-3 py-2">
          <p role="status" className="text-ink-1">
            {done.message}
          </p>
          {done.undo !== null ? (
            <Button
              size="sm"
              variant="ghost"
              busy={pending}
              onClick={() => {
                const { ids, archive } = done.undo!;
                changeArchive(ids, archive, false);
              }}
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={groupId(group.label)}>
            <h2
              id={groupId(group.label)}
              className="mb-2 text-sm font-medium tracking-wide text-ink-2 uppercase"
            >
              {group.label}
            </h2>
            <ul
              aria-label={group.label}
              className="flex flex-col divide-y divide-line border-y border-line"
            >
              {group.sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-1">
                  {selecting ? (
                    archivable(session) ? (
                      <label className="tap-target flex shrink-0 items-center justify-center px-2">
                        <span className="sr-only">Select {session.title}</span>
                        <input
                          type="checkbox"
                          className="size-5 accent-accent"
                          checked={selected.has(session.id)}
                          onChange={() => toggle(session.id)}
                        />
                      </label>
                    ) : (
                      // Keeps the titles lined up beside rows that can be selected.
                      <span aria-hidden="true" className="w-11 shrink-0" />
                    )
                  ) : null}
                  <SessionRowLink session={session} className="flex-1" />
                  {!selecting && mine(session) ? (
                    <RowMenu
                      title={session.title}
                      canArchive={archivable(session)}
                      archivedView={archivedView}
                      onRename={() => setRenaming(session)}
                      onArchive={() => changeArchive([session.id], !archivedView)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <RenameDialog
        session={renaming}
        onClose={() => setRenaming(null)}
        onSaved={(title) => {
          setRenaming(null);
          setDone({ message: `Renamed to “${title}”.`, undo: null });
        }}
      />
    </div>
  );
}

/**
 * A row's own actions behind a "More actions" button: a small disclosure, not an ARIA menu, so
 * Tab moves through it as through any two buttons. Escape or a click elsewhere closes it.
 */
function RowMenu({
  title,
  canArchive,
  archivedView,
  onRename,
  onArchive,
}: {
  title: string;
  canArchive: boolean;
  archivedView: boolean;
  onRename: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div
      ref={box}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={`More actions for ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((was) => !was)}
        className="tap-target inline-flex items-center justify-center rounded-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1"
      >
        <Icon icon={MoreHorizontal} />
      </button>
      <div
        id={id}
        hidden={!open}
        className="absolute top-full right-0 z-10 mt-1 flex min-w-40 flex-col rounded-sm border border-line bg-surface-1 py-1 shadow-md"
      >
        <button
          type="button"
          onClick={() => choose(onRename)}
          className="tap-target px-3 text-left text-sm text-ink-1 hover:bg-surface-2"
        >
          Rename
        </button>
        {canArchive ? (
          <button
            type="button"
            onClick={() => choose(onArchive)}
            className="tap-target px-3 text-left text-sm text-ink-1 hover:bg-surface-2"
          >
            {archivedView ? "Restore" : "Archive"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Renames one session; shared by the list's row menu and the report page. */
export function RenameDialog({
  session,
  onClose,
  onSaved,
}: {
  session: Pick<SessionSummary, "id" | "title"> | null;
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  return (
    <Dialog
      open={session !== null}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Rename live session"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" busy={pending}>
            Save
          </Button>
        </>
      }
    >
      {session !== null ? (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            const title = String(new FormData(event.currentTarget).get("title") ?? "");
            setError(null);
            startTransition(async () => {
              const result = await renameSessionAction(session.id, title);
              if (result.ok) onSaved(title.trim().replace(/\s+/g, " "));
              else setError(result.error);
            });
          }}
        >
          <Field
            key={session.id}
            label="Name"
            name="title"
            defaultValue={session.title}
            maxLength={SESSION_TITLE_MAX}
            required
            autoComplete="off"
            error={error ?? undefined}
          />
        </form>
      ) : null}
    </Dialog>
  );
}
