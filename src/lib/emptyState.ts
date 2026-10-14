/** The next step from an empty list, when there is a place to take it (#266). */
export interface EmptyStateAction {
  readonly href: string;
  readonly label: string;
}

/** What an empty list says: one line, and what to do next (#266, #412). */
export interface EmptyStateContent {
  readonly heading: string;
  /** One more sentence, only where the heading and the action do not say enough. */
  readonly body?: string;
  readonly action?: EmptyStateAction;
}
