import { expect } from "vitest";

/**
 * The alert notices drawn with the page when it loads (#563, docs/04 §11): they keep the alert's
 * look (`data-notice="alert"`) and drop the live region (`live={false}`), so a screen reader is
 * not interrupted on every visit. Each one found is checked to carry no role.
 */
export function onLoadNotices(root: ParentNode = document): HTMLElement[] {
  const notices = Array.from(root.querySelectorAll<HTMLElement>('[data-notice="alert"]'));
  for (const notice of notices) expect(notice).not.toHaveAttribute("role");
  return notices;
}

/** The one on-load alert notice on the page. */
export function onLoadNotice(root: ParentNode = document): HTMLElement {
  const notices = onLoadNotices(root);
  expect(notices).toHaveLength(1);
  return notices[0]!;
}
