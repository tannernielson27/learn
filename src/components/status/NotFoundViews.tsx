import { ReadingWidth } from "@/components/authoring/PageWidth";
import { WayBack } from "@/components/recovery/WayBack";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusFrame } from "./StatusFrame";
import { StatusLinks } from "./StatusLinks";

/**
 * What each `not-found.tsx` draws (#267, #563): one layout for every 404, `ErrorState`'s not-found
 * kind (the heading in the page title's style, then one sentence), then the way home. Static copy
 * and links only, so a 404 has nothing of a page's data to carry. `/gallery/states` draws these.
 */
export interface NotFoundViewProps {
  /** False draws the root page's frame as a `div`, for the gallery, whose layout holds the main. */
  landmark?: boolean;
}

/** An unmatched URL, or a `notFound()` outside the signed-in segments: home and sign in. */
export function RootNotFoundView({ landmark }: NotFoundViewProps) {
  return (
    <StatusFrame landmark={landmark}>
      <ErrorState kind="not-found">
        <StatusLinks />
      </ErrorState>
    </StatusFrame>
  );
}

/** A teacher's page that is not there, or not theirs: inside the teacher's `AppShell`. */
export function AuthorNotFoundView() {
  return (
    <ReadingWidth>
      <ErrorState kind="not-found">
        <WayBack to="library" />
      </ErrorState>
    </ReadingWidth>
  );
}

/** A student's page that is not there, or not theirs: inside the student's `AppShell`. */
export function LearnNotFoundView() {
  return (
    <ErrorState kind="not-found">
      <WayBack to="student-home" />
    </ErrorState>
  );
}
