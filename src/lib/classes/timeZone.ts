/**
 * A class's time zone (#242): the zone its due times are read in, on the student home, the
 * assignment pages and the reminder emails. Pure: no React, no Next, no Supabase.
 *
 * The database is the authority on which names are valid (`private.is_time_zone`, checked against
 * `pg_timezone_names`); the checks here only keep an obviously wrong value from reaching it and
 * give the form a readable error.
 */

/** Every class starts here (the column default since #212). */
export const DEFAULT_CLASS_TIME_ZONE = "America/Denver";

export const TIME_ZONE_ERROR = "Choose a time zone from the list.";

/** The longest IANA name is about 30 characters; anything past this is not one. */
const TIME_ZONE_MAX = 64;
const FALLBACK_ZONE = "UTC";
/** An IANA name's shape: letters first, then `Area/Location` segments. Offsets are not names. */
const TIME_ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/** Whether this runtime's Intl knows the zone. */
export function isKnownTimeZone(zone: string): boolean {
  if (zone.length > TIME_ZONE_MAX || !TIME_ZONE_SHAPE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * An instant as "Thu 24 Sep 2026, 17:00 MDT": the class's calendar and clock, on a 24-hour clock,
 * with the zone's short name so nobody reads it as their own. A zone this runtime does not know
 * falls back to UTC, still labelled.
 */
export function formatInZone(iso: string, zone: string): string {
  const timeZone = isKnownTimeZone(zone) ? zone : FALLBACK_ZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

/** The zones this runtime lists, or an empty list where `Intl.supportedValuesOf` is missing. */
export function supportedTimeZones(): readonly string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  return typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : [];
}

/** The select's options: sorted, unique, and always holding UTC and the current value. */
export function timeZoneChoices(zones: readonly string[], current: string): string[] {
  return [...new Set([...zones, FALLBACK_ZONE, current])].sort((a, b) => a.localeCompare(b));
}

export type TimeZoneFormResult = { ok: true; zone: string } | { ok: false; error: string };

/** Reads the time zone form on the server. */
export function parseTimeZoneForm(formData: FormData): TimeZoneFormResult {
  const raw = formData.get("timeZone");
  const zone = typeof raw === "string" ? raw.trim() : "";
  return isKnownTimeZone(zone) ? { ok: true, zone } : { ok: false, error: TIME_ZONE_ERROR };
}

/** The zone of one of the viewer's classes; the default when it cannot be found. */
export function zoneOfClass(
  classes: readonly { id: string; timeZone: string }[] | null,
  classId: string,
): string {
  return classes?.find((entry) => entry.id === classId)?.timeZone ?? DEFAULT_CLASS_TIME_ZONE;
}
