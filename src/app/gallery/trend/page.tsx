import { sampleTrendItem } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { TrendDemo } from "./demo";

// Parsed on the server, so the browser bundle carries neither the fixtures module nor zod.
const item = itemSchema.parse(sampleTrendItem);

export default function TrendPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Trend item</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Not a fifteenth format: any item can be a Trend item by carrying a record charted at more
        than one time. The panel then offers a time selector, and each charted section shows what it
        held at the chosen time. Sample content is fictional.
      </p>
      <TrendDemo item={item} />
    </article>
  );
}
