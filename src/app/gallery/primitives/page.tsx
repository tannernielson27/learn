import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { PrimitivesDemo } from "./demo";

export default function PrimitivesPage() {
  return (
    <article className="max-w-4xl">
      <p className="eyebrow">Foundations</p>
      <h1 className="mt-2 text-2xl font-semibold">Primitives</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The few building blocks everything else composes. Each has a visible focus state and a 44px
        minimum tap target.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Button</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary">Submit</Button>
          <Button variant="secondary">Flag for review</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="primary" size="sm">
            Next
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <PrimitivesDemo />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Surface</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Surface>
            <p className="text-sm font-medium">Raised</p>
            <p className="mt-1 text-sm text-ink-2">Cards, the EHR panel, item containers.</p>
          </Surface>
          <Surface tone="inset">
            <p className="text-sm font-medium">Inset</p>
            <p className="mt-1 text-sm text-ink-2">Grouped or secondary content, table stripes.</p>
          </Surface>
        </div>
      </section>
    </article>
  );
}
