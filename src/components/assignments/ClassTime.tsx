import { formatInZone } from "@/lib/classes/timeZone";

export interface ClassTimeProps {
  /** An instant, as stored. */
  iso: string;
  /** The class's IANA zone (#242). */
  timeZone: string;
}

/**
 * An instant in the class's zone, labelled with the zone's short name ("17:00 MDT"), so a due time
 * reads the same to every student of the class and matches the reminder email. Unlike LocalTime it
 * needs no browser: render it from a Server Component only, so the text is formatted once, by the
 * server, and never re-formatted by a browser whose ICU names the zone differently.
 */
export function ClassTime({ iso, timeZone }: ClassTimeProps) {
  return <time dateTime={iso}>{formatInZone(iso, timeZone)}</time>;
}
