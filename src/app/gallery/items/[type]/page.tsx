import { notFound } from "next/navigation";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/labels";
import { itemSchema, type ItemType } from "@/lib/ngn/schemas";
import { ItemPlayground } from "./playground";

export function generateStaticParams() {
  return ITEM_TYPES.map((type) => ({ type }));
}

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
