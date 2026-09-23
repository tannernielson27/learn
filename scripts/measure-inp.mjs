// #55: an interaction-to-next-paint proxy for the item player, under CPU throttling.
//
// The #42 audit measured Submit and a drag-and-drop placement with Playwright's event timing
// entries at 4x CPU and found the repeat runs too far apart to trust a single figure. This makes
// the method repeatable: a fresh page per run, many runs, the median and p75 reported.
//
// Run against a production build that is already serving (the gallery is open locally):
//     pnpm build && pnpm start
//     node scripts/measure-inp.mjs [--base http://127.0.0.1:3000] [--runs 15] [--cpu 4]
//
// For each interaction it prints the INP proxy (the longest event timing entry in the interaction,
// which Chrome rounds to 8 ms); from the long-animation-frame entries that overlap it, how much of
// the frame was script and how much of that was style and layout the script forced; and, for a
// Submit, how long until the frame that paints the score panel. Numbers are only comparable between
// runs on the same machine: throttling slows this CPU down 4x, it does not become a phone.

import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = arg("base", "http://127.0.0.1:3000");
const RUNS = Number(arg("runs", "15"));
const CPU = Number(arg("cpu", "4"));
const ONLY = arg("only", "");

/** Installed before any page script, so every interaction from load onwards is observed. */
const OBSERVE = () => {
  window.__events = [];
  window.__frames = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__events.push({
        name: e.name,
        id: e.interactionId,
        start: e.startTime,
        duration: e.duration,
        processingStart: e.processingStart,
        processingEnd: e.processingEnd,
      });
    }
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
  try {
    new PerformanceObserver((list) => {
      for (const f of list.getEntries()) {
        window.__frames.push({
          start: f.startTime,
          duration: f.duration,
          script: f.scripts.reduce((sum, s) => sum + s.duration, 0),
          forced: f.scripts.reduce((sum, s) => sum + s.forcedStyleAndLayoutDuration, 0),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {
    // Older Chromium: the breakdown is left out, the INP proxy still stands.
  }
  // When the score panel first reaches the screen: the start of the frame that paints it. INP only
  // covers the next paint after the press, so this is what shows a slower reveal hiding behind it.
  new MutationObserver(() => {
    if (window.__revealed !== undefined || !document.querySelector('[aria-label="Score"]')) return;
    window.__revealed = null;
    requestAnimationFrame(() => {
      window.__revealed = performance.now();
    });
  }).observe(document, { childList: true, subtree: true });
};

const settle = (page, ms) => page.waitForTimeout(ms);

/** The interaction that started after `since` and holds an event named `name`, summarised. */
async function interaction(page, since, name) {
  // Event timing entries are delivered after the next paint; give them time to land.
  await settle(page, 1200);
  return page.evaluate(
    ({ since, name }) => {
      const events = window.__events.filter((e) => e.start >= since);
      const target = events.find((e) => e.name === name);
      if (!target) return null;
      const same = events.filter((e) => e.id === target.id);
      const longest = same.reduce((a, b) => (b.duration > a.duration ? b : a));
      // dnd-kit's mouse sensor listens for mouseup, which carries no interactionId of its own but
      // is dispatched with the pointerup, so handler time counts every event from the same input.
      const dispatched = events.filter((e) => same.some((s) => Math.abs(s.start - e.start) < 1));
      const end = longest.start + longest.duration;
      const frames = window.__frames.filter(
        (f) => f.start < end && f.start + f.duration > longest.start,
      );
      return {
        inp: longest.duration,
        delay: longest.processingStart - longest.start,
        handlers: dispatched.reduce((sum, e) => sum + (e.processingEnd - e.processingStart), 0),
        script: frames.reduce((sum, f) => sum + f.script, 0),
        forced: frames.reduce((sum, f) => sum + f.forced, 0),
        reveal: window.__revealed ? window.__revealed - longest.start : undefined,
      };
    },
    { since, name },
  );
}

const now = (page) => page.evaluate(() => performance.now());

const PHONE = { width: 375, height: 812 };
/** Mouse drag is the desktop path (the e2e suite drags at 1280 too); touch uses tap-to-place. */
const DESKTOP = { width: 1280, height: 800 };

async function open(browser, path, viewport = PHONE) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(OBSERVE);
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`);
  await page.locator('[data-hydrated="true"]').waitFor();
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

const throttle = (cdp) => cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

const SCENARIOS = {
  /** Choose an option, then press Submit: the feedback reveal. */
  async "mc-submit"(browser) {
    const { context, page, cdp } = await open(browser, "/gallery/items/multiple_choice");
    const option = page.getByRole("radiogroup", { name: "Options" }).getByRole("radio").nth(1);
    await option.waitFor();
    await throttle(cdp);
    await option.click();
    await settle(page, 600);
    const since = await now(page);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("complementary", { name: "Score" }).waitFor();
    const result = await interaction(page, since, "click");
    await context.close();
    return result;
  },

  /** Drag a word from the bank onto a blank with a mouse: the drop. */
  async "dnd-drop"(browser) {
    const { context, page, cdp } = await open(browser, "/gallery/items/dragdrop_cloze", DESKTOP);
    const chip = page.getByRole("group", { name: "Word bank" }).getByRole("button").first();
    const blank = page.getByRole("button", { name: "Blank 1 of 2, empty" });
    await chip.waitFor();
    await chip.scrollIntoViewIfNeeded();
    await throttle(cdp);
    const a = await chip.boundingBox();
    const b = await blank.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await settle(page, 300);
    const since = await now(page);
    await page.mouse.up();
    await page.getByRole("button", { name: /^Blank 1 of 2: / }).waitFor();
    const result = await interaction(page, since, "pointerup");
    await context.close();
    return result;
  },

  /** The same drop into a bowtie, the largest drag-and-drop item: five slots, three banks. */
  async "bowtie-drop"(browser) {
    const { context, page, cdp } = await open(browser, "/gallery/items/bowtie", DESKTOP);
    const choice = page
      .getByRole("group", { name: "Actions to Take choices" })
      .getByRole("button")
      .first();
    const slot = page.getByRole("button", { name: "Actions to Take 1 of 2, empty" });
    await choice.waitFor();
    await slot.scrollIntoViewIfNeeded();
    await throttle(cdp);
    const a = await choice.boundingBox();
    const b = await slot.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await settle(page, 300);
    const since = await now(page);
    await page.mouse.up();
    await page.getByRole("button", { name: /^Actions to Take 1 of 2: / }).waitFor();
    const result = await interaction(page, since, "pointerup");
    await context.close();
    return result;
  },

  /** Tap a word, then a blank: the placement, which is also the keyboard path. */
  async "dnd-tap"(browser) {
    const { context, page, cdp } = await open(browser, "/gallery/items/dragdrop_cloze");
    const chip = page.getByRole("group", { name: "Word bank" }).getByRole("button").first();
    await chip.waitFor();
    await throttle(cdp);
    await chip.click();
    await settle(page, 600);
    const since = await now(page);
    await page.getByRole("button", { name: "Blank 1 of 2, empty" }).click();
    await page.getByRole("button", { name: /^Blank 1 of 2: / }).waitFor();
    const result = await interaction(page, since, "click");
    await context.close();
    return result;
  },

  /** Fill both blanks, then Submit: the drag-and-drop feedback reveal. */
  async "dnd-submit"(browser) {
    const { context, page, cdp } = await open(browser, "/gallery/items/dragdrop_cloze");
    const bank = page.getByRole("group", { name: "Word bank" });
    await bank.getByRole("button").first().waitFor();
    await throttle(cdp);
    for (const n of [1, 2]) {
      await bank.getByRole("button").first().click();
      await page.getByRole("button", { name: `Blank ${n} of 2, empty` }).click();
    }
    await settle(page, 600);
    const since = await now(page);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("complementary", { name: "Score" }).waitFor();
    const result = await interaction(page, since, "click");
    await context.close();
    return result;
  },
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const round = (n) => Math.round(n);

const browser = await chromium.launch();
try {
  console.log(`${BASE}, ${RUNS} runs each, ${CPU}x CPU, 375x812 (mouse drag at 1280x800)\n`);
  for (const [name, run] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.split(",").includes(name)) continue;
    const results = [];
    for (let i = 0; i < RUNS; i += 1) {
      const r = await run(browser);
      if (r) results.push(r);
    }
    const inp = results.map((r) => r.inp).sort((x, y) => x - y);
    const med = (key) => {
      const values = results.map((r) => r[key]).filter((v) => v !== undefined);
      return values.length
        ? round(
            quantile(
              values.sort((x, y) => x - y),
              0.5,
            ),
          )
        : "-";
    };
    console.log(
      `${name.padEnd(11)} INP median ${round(quantile(inp, 0.5))} ms, p75 ${round(
        quantile(inp, 0.75),
      )} ms, range ${round(inp[0])}-${round(inp[inp.length - 1])} ms (n=${inp.length})`,
    );
    console.log(
      `            median: input delay ${med("delay")}, handlers ${med("handlers")}, ` +
        `long-frame script ${med("script")} (forced style+layout ${med("forced")}), ` +
        `press to feedback frame ${med("reveal")} ms`,
    );
    console.log(`            all: ${inp.map(round).join(" ")}`);
  }
} finally {
  await browser.close();
}
