/**
 * A stand-in for the browser's own `popover` in jsdom, which hides a `[popover]` panel but has no
 * `showPopover`, `hidePopover` or `popovertarget` (#563). It does what a browser does for a
 * `popover="auto"` panel, closely enough to test what a component wires to it: the button opens
 * and closes its panel, Escape and a press outside close it, and focus goes back to the button
 * when it closes from inside. The real behaviour is checked in a browser by the gallery specs.
 */
export function installPopover(): () => void {
  const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;
  const had = {
    show: proto.showPopover,
    hide: proto.hidePopover,
    toggle: proto.togglePopover,
  };
  const invokers = new WeakMap<HTMLElement, HTMLElement>();
  let open: HTMLElement | null = null;

  function show(panel: HTMLElement, invoker?: HTMLElement) {
    if (open && open !== panel) hide(open);
    if (invoker) invokers.set(panel, invoker);
    panel.style.display = "block";
    panel.dataset.popoverOpen = "";
    open = panel;
  }
  function hide(panel: HTMLElement) {
    if (!("popoverOpen" in panel.dataset)) return;
    const hadFocus = panel.contains(document.activeElement);
    panel.style.removeProperty("display");
    delete panel.dataset.popoverOpen;
    if (open === panel) open = null;
    if (hadFocus) invokers.get(panel)?.focus();
  }

  proto.showPopover = function (this: HTMLElement) {
    show(this);
  };
  proto.hidePopover = function (this: HTMLElement) {
    hide(this);
  };
  proto.togglePopover = function (this: HTMLElement) {
    if ("popoverOpen" in this.dataset) hide(this);
    else show(this);
    return "popoverOpen" in this.dataset;
  };

  const click = (event: MouseEvent) => {
    const button = (event.target as Element | null)?.closest?.("[popovertarget]");
    if (!(button instanceof HTMLElement)) return;
    const panel = document.getElementById(button.getAttribute("popovertarget") ?? "");
    if (!panel) return;
    if ("popoverOpen" in panel.dataset) hide(panel);
    else show(panel, button);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      const panel = open;
      // Escape returns focus to the button whether or not focus was inside.
      hide(panel);
      invokers.get(panel)?.focus();
    }
  };
  const down = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!open || open.contains(target)) return;
    const invoker = invokers.get(open);
    if (invoker?.contains(target)) return;
    hide(open);
  };
  document.addEventListener("click", click);
  document.addEventListener("keydown", key);
  document.addEventListener("pointerdown", down);

  return () => {
    document.removeEventListener("click", click);
    document.removeEventListener("keydown", key);
    document.removeEventListener("pointerdown", down);
    proto.showPopover = had.show as HTMLElement["showPopover"];
    proto.hidePopover = had.hide as HTMLElement["hidePopover"];
    proto.togglePopover = had.toggle as HTMLElement["togglePopover"];
  };
}
