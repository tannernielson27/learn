import { MotionDemo } from "./motion-demo";

const COLORS = [
  { group: "Surfaces", tokens: ["surface-0", "surface-1", "surface-2"] },
  { group: "Ink and lines", tokens: ["ink-1", "ink-2", "line", "line-strong"] },
  { group: "Accent", tokens: ["accent", "accent-ink", "accent-soft", "accent-contrast"] },
  {
    group: "Feedback (feedback mode only)",
    tokens: ["correct", "correct-soft", "incorrect", "incorrect-soft", "flag", "flag-soft"],
  },
] as const;

const TYPE_SCALE = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl"] as const;
const SPACE = ["1", "2", "3", "4", "6", "8", "12"] as const;

export default function TokensPage() {
  return (
    <article className="max-w-4xl">
      <p className="eyebrow">Foundations</p>
      <h1 className="mt-2 text-2xl font-semibold">Tokens</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Every color, size and duration in the product comes from these variables. Switch the theme
        in the sidebar to check both palettes.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Color</h2>
      {COLORS.map((group) => (
        <section key={group.group} className="mt-5">
          <h3 className="text-sm font-medium text-ink-2">{group.group}</h3>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.tokens.map((token) => (
              <li key={token} className="rounded-md border border-line bg-surface-1 p-2">
                <div
                  className="h-14 rounded-sm border border-line"
                  style={{ background: `var(--${token})` }}
                />
                <p className="mt-2 font-mono text-xs">--{token}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <h2 className="mt-10 text-lg font-semibold">Type scale</h2>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface-1">
        {TYPE_SCALE.map((step) => (
          <li key={step} className="flex items-baseline gap-4 px-4 py-3">
            <span className="w-24 shrink-0 font-mono text-xs text-ink-2">--text-{step}</span>
            <span style={{ fontSize: `var(--text-${step})` }}>Recognize cues before acting.</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold">Space</h2>
          <ul className="mt-3 space-y-2">
            {SPACE.map((step) => (
              <li key={step} className="flex items-center gap-3">
                <span className="w-20 font-mono text-xs text-ink-2">--space-{step}</span>
                <span className="h-3 bg-accent" style={{ width: `var(--space-${step})` }} />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Shape</h2>
          <div className="mt-3 flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-sm border border-line-strong bg-surface-1" />
              <span className="font-mono text-xs text-ink-2">--radius-sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-md border border-line-strong bg-surface-1" />
              <span className="font-mono text-xs text-ink-2">--radius-md</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            Two radii only. Depth comes from lines, not shadows.
          </p>
        </section>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Motion</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-2">
        Transform and opacity only. Fast 120 ms, base 200 ms, slow 320 ms, all on the expo ease.
        With reduced motion on, everything collapses to 80 ms.
      </p>
      <MotionDemo />
    </article>
  );
}
