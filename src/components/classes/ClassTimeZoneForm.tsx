"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/components/assignments/useHydrated";
import { Button } from "@/components/ui/Button";
import type { ClassFormState } from "./ClassNameForm";

export interface ClassTimeZoneFormProps {
  action: (state: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  /** The class's zone now; selected until the author picks another. */
  currentZone: string;
  /** Every zone offered, computed on the server so the server render and hydration match. */
  zones: readonly string[];
}

const INITIAL: ClassFormState = { status: "idle" };

/** The zone this browser is on, or null before hydration and where Intl cannot say. */
function useBrowserZone(): string | null {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The class's time zone (#242): the zone its due times are shown in to students and in reminder
 * emails. The current zone stays selected; the browser's own zone is suggested with a button when
 * it differs and the list offers it. The database has the last word on which names are valid.
 */
export function ClassTimeZoneForm({ action, currentZone, zones }: ClassTimeZoneFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never jumps back to the old zone.
  const [zone, setZone] = useState(currentZone);
  const selectRef = useRef<HTMLSelectElement>(null);
  const id = useId();
  const browserZone = useBrowserZone();
  const error = state.status === "error" ? state.error : null;
  const suggestion =
    browserZone && browserZone !== zone && zones.includes(browserZone) ? browserZone : null;

  useEffect(() => {
    if (state.status === "error") selectRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-zone`} className="text-sm font-medium text-ink-1">
          Time zone
        </label>
        <select
          ref={selectRef}
          id={`${id}-zone`}
          name="timeZone"
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        >
          {zones.map((name) => (
            <option key={name} value={name}>
              {name.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <p id={`${id}-hint`} className="text-sm text-ink-2">
          Students see due times, and reminder emails give them, in this zone.
        </p>
        {suggestion ? (
          <div>
            <Button type="button" size="sm" onClick={() => setZone(suggestion)}>
              {`Use ${suggestion}`}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
        {state.status === "saved" ? (
          <p role="status" className="text-sm text-ink-2">
            Saved.
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          Save time zone
        </Button>
      </div>
    </form>
  );
}
