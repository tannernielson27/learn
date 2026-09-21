import { notFound } from "next/navigation";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/labels";
import { itemSchema, type ItemType } from "@/lib/ngn/schemas";
import { ItemPlayground } from "./playground";

// No `generateStaticParams` here, deliberately. It used to list every item type and Next
// prerendered one page each (the build output showed them as ●). Since #146 the gallery layout
// awaits `connection()` so its production gate is decided per request, which makes this route
// server-rendered on demand (ƒ) and leaves nothing for that list to prerender. Adding it back
// would read as a guarantee the segment no longer offers. The valid types are `ITEM_TYPES`, and
// the check that matters is the `notFound()` below, which runs on every request.
export default async function GalleryItemPage({ params }: PageProps<"/gallery/items/[type]">) {
  const { type } = await params;
  if (!(ITEM_TYPES as readonly string[]).includes(type)) notFound();
  const itemType = type as ItemType;
  return (
    <article className="max-w-3xl">
      <p className="eyebrow">Item type</p>
      <h1 className="mt-2 text-2xl font-semibold">{ITEM_TYPE_LABELS[itemType]}</h1>
      {/* Parsed here, on the server, so the browser gets one type's items and no zod. */}
      <ItemPlayground
        type={itemType}
        items={{
          canonical: itemSchema.parse(FIXTURES[itemType].canonical),
          edge: itemSchema.parse(FIXTURES[itemType].edge),
        }}
      />
    </article>
  );
}
