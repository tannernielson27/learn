import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ItemType } from "@/lib/ngn/schemas";
import { withLoadRecovery } from "./RendererRecovery";
import { RULES } from "./rules";
import type { ItemRendererModule, ItemRendererProps } from "./types";

export { hasRenderer } from "./rendered";

type Lazy<T extends ItemType> = ComponentType<ItemRendererProps<T>>;

/*
 * One chunk per renderer (#54). A page that plays a bowtie loads the bowtie and dnd-kit, and a page
 * of multiple choice loads neither. Each `import()` has to be written out in full, at the top level
 * of this module with its options written as an object literal, for Next to match it to its chunk
 * and preload it.
 *
 * No `loading` option: `next/dynamic` would wrap the renderer in a Suspense boundary of its own,
 * so the component would count as rendered while only its placeholder was showing. The one
 * boundary is in `withLoadRecovery`, which shows RendererLoading and reports to the player only
 * once the renderer itself is on screen, which is what Submit waits for.
 *
 * `ssr` stays on (the default; written out here). The server renders the item into the HTML (streamed in the same
 * response, just behind the placeholder) and names the chunk for the browser to preload, so the
 * question reads before the page hydrates. `ssr: false` would show every student the placeholder
 * until the chunk ran.
 * What the server renders is the same keyless item the browser would get: the player strips the
 * key and the rationale before a renderer sees its props, lazily loaded or not.
 */

const renderers: { [T in ItemType]: Lazy<T> } = {
  multiple_choice: dynamic(
    () => import("./multiple_choice/MultipleChoiceItem").then((m) => m.MultipleChoiceItem),
    { ssr: true },
  ),
  multiple_response: dynamic(
    () => import("./multiple_response/MultipleResponseItem").then((m) => m.MultipleResponseItem),
    { ssr: true },
  ),
  multiple_response_grouping: dynamic(
    () =>
      import("./multiple_response_grouping/MultipleResponseGroupingItem").then(
        (m) => m.MultipleResponseGroupingItem,
      ),
    { ssr: true },
  ),
  matrix_multiple_choice: dynamic(
    () =>
      import("./matrix_multiple_choice/MatrixMultipleChoiceItem").then(
        (m) => m.MatrixMultipleChoiceItem,
      ),
    { ssr: true },
  ),
  matrix_multiple_response: dynamic(
    () =>
      import("./matrix_multiple_response/MatrixMultipleResponseItem").then(
        (m) => m.MatrixMultipleResponseItem,
      ),
    { ssr: true },
  ),
  dropdown_cloze: dynamic(
    () => import("./dropdown_cloze/DropdownClozeItem").then((m) => m.DropdownClozeItem),
    { ssr: true },
  ),
  dropdown_rationale: dynamic(
    () => import("./dropdown_rationale/DropdownRationaleItem").then((m) => m.DropdownRationaleItem),
    { ssr: true },
  ),
  dropdown_table: dynamic(
    () => import("./dropdown_table/DropdownTableItem").then((m) => m.DropdownTableItem),
    { ssr: true },
  ),
  highlight_text: dynamic(
    () => import("./highlight_text/HighlightTextItem").then((m) => m.HighlightTextItem),
    { ssr: true },
  ),
  highlight_table: dynamic(
    () => import("./highlight_table/HighlightTableItem").then((m) => m.HighlightTableItem),
    { ssr: true },
  ),
  dragdrop_cloze: dynamic(
    () => import("./dragdrop_cloze/DragdropClozeItem").then((m) => m.DragdropClozeItem),
    { ssr: true },
  ),
  dragdrop_rationale: dynamic(
    () => import("./dragdrop_rationale/DragdropRationaleItem").then((m) => m.DragdropRationaleItem),
    { ssr: true },
  ),
  ordered_response: dynamic(
    () => import("./ordered_response/OrderedResponseItem").then((m) => m.OrderedResponseItem),
    { ssr: true },
  ),
  bowtie: dynamic(() => import("./bowtie/BowtieItem").then((m) => m.BowtieItem), { ssr: true }),
};

/*
 * The same imports again, for a second attempt after a renderer's chunk failed to load. The
 * `dynamic` components above cannot make one: each is a `React.lazy`, which keeps a rejected load
 * for the life of the page. `withLoadRecovery` swaps in a fresh `React.lazy` over these instead
 * (see RendererRecovery.tsx). They name the same modules, so the bundler maps them to the same
 * chunks; nothing calls them unless a load has failed.
 */
const retryLoaders: { [T in ItemType]: () => Promise<Lazy<T>> } = {
  multiple_choice: () =>
    import("./multiple_choice/MultipleChoiceItem").then((m) => m.MultipleChoiceItem),
  multiple_response: () =>
    import("./multiple_response/MultipleResponseItem").then((m) => m.MultipleResponseItem),
  multiple_response_grouping: () =>
    import("./multiple_response_grouping/MultipleResponseGroupingItem").then(
      (m) => m.MultipleResponseGroupingItem,
    ),
  matrix_multiple_choice: () =>
    import("./matrix_multiple_choice/MatrixMultipleChoiceItem").then(
      (m) => m.MatrixMultipleChoiceItem,
    ),
  matrix_multiple_response: () =>
    import("./matrix_multiple_response/MatrixMultipleResponseItem").then(
      (m) => m.MatrixMultipleResponseItem,
    ),
  dropdown_cloze: () =>
    import("./dropdown_cloze/DropdownClozeItem").then((m) => m.DropdownClozeItem),
  dropdown_rationale: () =>
    import("./dropdown_rationale/DropdownRationaleItem").then((m) => m.DropdownRationaleItem),
  dropdown_table: () =>
    import("./dropdown_table/DropdownTableItem").then((m) => m.DropdownTableItem),
  highlight_text: () =>
    import("./highlight_text/HighlightTextItem").then((m) => m.HighlightTextItem),
  highlight_table: () =>
    import("./highlight_table/HighlightTableItem").then((m) => m.HighlightTableItem),
  dragdrop_cloze: () =>
    import("./dragdrop_cloze/DragdropClozeItem").then((m) => m.DragdropClozeItem),
  dragdrop_rationale: () =>
    import("./dragdrop_rationale/DragdropRationaleItem").then((m) => m.DragdropRationaleItem),
  ordered_response: () =>
    import("./ordered_response/OrderedResponseItem").then((m) => m.OrderedResponseItem),
  bowtie: () => import("./bowtie/BowtieItem").then((m) => m.BowtieItem),
};

function moduleFor<T extends ItemType>(type: T): ItemRendererModule<T> {
  return {
    Renderer: withLoadRecovery<ItemRendererProps<T>>(renderers[type], retryLoaders[type]),
    ...RULES[type],
  };
}

/**
 * Renderers registered so far. Types missing here are shown as "coming soon" by the gallery
 * rather than crashing. Add a line to `renderers` above, to `RULES` and to `RENDERED_TYPES` as a
 * type's renderer lands. The rules are synchronous; only the component waits on its chunk.
 */
export const RENDERERS: { [T in ItemType]?: ItemRendererModule<T> } = Object.fromEntries(
  (Object.keys(renderers) as ItemType[]).map((type) => [type, moduleFor(type)]),
);
