import { notFound } from "next/navigation";
import { ITEM_TYPE_LABELS, ITEM_TYPES } from "@/lib/ngn/registry";
import type { ItemType } from "@/lib/ngn/schemas";
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
      <ItemPlayground type={itemType} />
    </article>
  );
}
