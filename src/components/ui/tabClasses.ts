/**
 * One tab chip's look, shared by `Tabs` (buttons that swap a panel in place) and `TabLinks`
 * (links that change the page), so the app has one tab strip, not two. Kept out of `Tabs`, a
 * client module, so a Server Component can call it.
 */
export function tabClasses(selected: boolean): string {
  return `tap-target -mb-px inline-flex shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-[color,border-color] duration-fast ease-out-expo ${
    selected ? "border-accent text-accent-ink" : "border-transparent text-ink-2 hover:text-ink-1"
  }`;
}
