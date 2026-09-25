/** The next step from an empty list, when there is a place to take it (#266). */
export interface EmptyStateAction {
  readonly href: string;
  readonly label: string;
}

/** What an empty list says: what it is for, and what to do next (#266). */
export interface EmptyStateContent {
  readonly heading: string;
  /** One sentence naming the next step. */
  readonly body: string;
  readonly action?: EmptyStateAction;
}
