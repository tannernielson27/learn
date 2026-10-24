"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/question/usePrefersReducedMotion";
import type { RichText } from "@/lib/ngn/schemas";
import { StageStem } from "./StageParts";
import { RETURN_EASING, fitStemSize, scrollPlan, stemFloor } from "./stageScroll";

/**
 * Set on the part of the stage that gives way (StageQuestion) while its stem is too long for the
 * room #482 gives it. Then the stem takes whatever the options leave it, and the options keep
 * their compact rows (`StageOptions`).
 */
export const STEM_LONG = "data-stem-long";

interface Fit {
  /** Pixels hidden below the region at the floor; 0 when the stem fits. */
  distance: number;
  lineHeight: number;
}

const FITS: Fit = { distance: 0, lineHeight: 0 };

/**
 * The question text on the projector, fitted to its part of the wall (feat/stage-long-text).
 *
 * A stem that fits as #482 draws it is left exactly as it is. One that does not first takes all
 * the room the options leave, then steps down in size until it fits, never under `stemFloor`.
 * Only a stem that still does not fit at the floor moves: it holds at the top, reads down slowly,
 * holds at the bottom and glides back (`scrollAt`), with a soft fade at each edge that has text
 * past it. Transform only, and only while it moves. With reduced motion it stays at the top, faded at the bottom, where a
 * line says the whole question is on every phone. That line sits over the stem's own last line,
 * so it takes no room from the options, the clock or the count.
 *
 * Measured in one synchronous pass, before paint, whenever the question, the size of the part
 * that gives way, or the fonts change, so nothing flickers; the pass only writes the stem's font
 * size and a data attribute, neither of which can resize what it watches. Key it by the stem and
 * `clamp`, so each new question starts from the top and a change of clamp measures again.
 */
export function StageStemFit({ stem, clamp }: { stem: RichText; clamp: boolean }) {
  const region = useRef<HTMLDivElement>(null);
  const mover = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>(FITS);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const area = region.current;
    const box = area?.parentElement;
    const text = mover.current?.firstElementChild;
    if (!area || !box || !(text instanceof HTMLElement)) return;
    let seen = "";

    const measure = () => {
      // Hidden (display: none) or not laid out: nothing to fit until it shows.
      if (box.clientWidth === 0 && box.clientHeight === 0) return;
      const stage = area.closest<HTMLElement>("[data-stage]") ?? document.documentElement;
      seen = `${box.clientWidth}x${box.clientHeight}:${stage.clientHeight}`;
      // Back to #482's own layout first, so a stem that fits there is drawn exactly as it was.
      text.style.fontSize = "";
      box.removeAttribute(STEM_LONG);
      // The stem's own text is cut (a crowded question's three lines), or the part overflows,
      // which the stem or only the options can cause.
      const cutOff = text.scrollHeight > text.clientHeight + 1;
      const fitsAsIs = () => {
        text.style.fontSize = "";
        box.removeAttribute(STEM_LONG);
        setFit((was) => (was.distance === 0 ? was : FITS));
      };
      if (!cutOff && box.scrollHeight <= box.clientHeight + 1) return fitsAsIs();
      box.setAttribute(STEM_LONG, "");
      const natural = parseFloat(getComputedStyle(text).fontSize);
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      if (!Number.isFinite(natural)) return;
      const { size, fits } = fitStemSize(natural, stemFloor(stage.clientHeight, root), (px) => {
        text.style.fontSize = `${px}px`;
        return text.scrollHeight <= area.clientHeight + 1;
      });
      // A stem that is whole in #482's layout and fits the long one at its own size is not long:
      // the options overflow, and they give way row by row as #482 draws them.
      if (!cutOff && fits && size === natural) return fitsAsIs();
      text.style.fontSize = `${size}px`;
      const distance = fits ? 0 : Math.ceil(text.scrollHeight - area.clientHeight);
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || size * 1.25;
      setFit((was) =>
        was.distance === distance && was.lineHeight === lineHeight ? was : { distance, lineHeight },
      );
    };

    measure();
    // Only a real change of size measures again, never the echo of a pass's own writes.
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stage = area.closest<HTMLElement>("[data-stage]") ?? document.documentElement;
        if (`${box.clientWidth}x${box.clientHeight}:${stage.clientHeight}` !== seen) measure();
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    observer?.observe(box);
    window.addEventListener("resize", again);
    // A web font that arrives late changes every line, at the same size of box.
    const fonts = document.fonts as FontFaceSet | undefined;
    const onFonts = () => measure();
    fonts?.addEventListener?.("loadingdone", onFonts);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", again);
      fonts?.removeEventListener?.("loadingdone", onFonts);
      box.removeAttribute(STEM_LONG);
    };
  }, []);

  const cut = fit.distance > 0;
  const still = cut && reduced;

  // The loop: hold, read down, hold, glide back. Each move is one CSS transition on transform
  // with a timer to the next phase, so nothing runs while the text holds, and the text is on its
  // own layer (will-change) only while it has a loop. The fades change opacity only.
  useEffect(() => {
    const text = mover.current;
    const shade = (el: HTMLDivElement | null, on: boolean) => {
      if (el) el.style.opacity = on ? "1" : "0";
    };
    if (!text) return;
    const plan = still ? null : scrollPlan(fit.distance, fit.lineHeight);
    shade(top.current, false);
    shade(bottom.current, cut);
    if (plan === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const move = (offset: number, ms: number, easing: string) => {
      text.style.transition = `transform ${ms}ms ${easing}`;
      text.style.transform = `translateY(${-offset}px)`;
    };
    const holdTop = () => {
      shade(top.current, false);
      timer = setTimeout(down, plan.holdTopMs);
    };
    const down = () => {
      move(plan.distance, plan.downMs, "linear");
      shade(top.current, true);
      timer = setTimeout(holdBottom, plan.downMs);
    };
    const holdBottom = () => {
      shade(bottom.current, false);
      timer = setTimeout(back, plan.holdBottomMs);
    };
    const back = () => {
      move(0, plan.returnMs, RETURN_EASING);
      shade(bottom.current, true);
      timer = setTimeout(holdTop, plan.returnMs);
    };
    text.style.willChange = "transform";
    text.style.transform = "translateY(0px)";
    holdTop();
    return () => {
      clearTimeout(timer);
      text.style.transition = "";
      text.style.transform = "";
      text.style.willChange = "";
    };
  }, [fit, still, cut]);

  return (
    <div
      ref={region}
      data-testid="stage-stem-region"
      className="relative shrink-0 overflow-hidden text-stage-option leading-tight in-data-[stem-long]:min-h-[3lh] in-data-[stem-long]:flex-[1_1_0]"
    >
      <div ref={mover} data-testid="stage-stem-mover">
        <StageStem stem={stem} clamp={clamp} />
      </div>
      {/* The fades say there is more text past an edge. Drawn only for a stem that is cut. */}
      {cut ? (
        <>
          <div
            ref={top}
            aria-hidden="true"
            data-testid="stage-stem-fade-top"
            className="pointer-events-none absolute inset-x-0 top-0 h-[1.5lh] bg-linear-to-b from-stage-surface to-transparent opacity-0 transition-opacity duration-base"
          />
          <div
            ref={bottom}
            aria-hidden={still ? undefined : "true"}
            data-testid="stage-stem-fade-bottom"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col transition-opacity duration-base"
          >
            <div className="h-[1.5lh] bg-linear-to-t from-stage-surface to-transparent" />
            {still ? (
              <p className="bg-stage-surface text-stage-label leading-tight font-semibold text-ink-2">
                Full question on your phone.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
