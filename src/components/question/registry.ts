import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ItemType } from "@/lib/ngn/schemas";
import { RendererLoading } from "./RendererLoading";
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
 * `ssr` stays on (the default). The server renders the item into the HTML (streamed in the same
 * response, just behind the placeholder) and names the chunk for the browser to preload, so the
 * question reads before the page hydrates. `ssr: false` would show every student the placeholder
 * until the chunk ran.
 * What the server renders is the same keyless item the browser would get: the player strips the
 * key and the rationale before a renderer sees its props, lazily loaded or not.
 */

const renderers: { [T in ItemType]: Lazy<T> } = {
  multiple_choice: dynamic(
    () => import("./multiple_choice/MultipleChoiceItem").then((m) => m.MultipleChoiceItem),
    { loading: RendererLoading },
  ),
  multiple_response: dynamic(
    () => import("./multiple_response/MultipleResponseItem").then((m) => m.MultipleResponseItem),
    { loading: RendererLoading },
  ),
  multiple_response_grouping: dynamic(
    () =>
      import("./multiple_response_grouping/MultipleResponseGroupingItem").then(
        (m) => m.MultipleResponseGroupingItem,
      ),
    { loading: RendererLoading },
  ),
  matrix_multiple_choice: dynamic(
    () =>
      import("./matrix_multiple_choice/MatrixMultipleChoiceItem").then(
        (m) => m.MatrixMultipleChoiceItem,
      ),
    { loading: RendererLoading },
  ),
  matrix_multiple_response: dynamic(
    () =>
      import("./matrix_multiple_response/MatrixMultipleResponseItem").then(
        (m) => m.MatrixMultipleResponseItem,
      ),
    { loading: RendererLoading },
  ),
  dropdown_cloze: dynamic(
    () => import("./dropdown_cloze/DropdownClozeItem").then((m) => m.DropdownClozeItem),
    { loading: RendererLoading },
  ),
  dropdown_rationale: dynamic(
    () => import("./dropdown_rationale/DropdownRationaleItem").then((m) => m.DropdownRationaleItem),
    { loading: RendererLoading },
  ),
  dropdown_table: dynamic(
    () => import("./dropdown_table/DropdownTableItem").then((m) => m.DropdownTableItem),
    { loading: RendererLoading },
  ),
  highlight_text: dynamic(
    () => import("./highlight_text/HighlightTextItem").then((m) => m.HighlightTextItem),
    { loading: RendererLoading },
  ),
  highlight_table: dynamic(
    () => import("./highlight_table/HighlightTableItem").then((m) => m.HighlightTableItem),
    { loading: RendererLoading },
  ),
  dragdrop_cloze: dynamic(
    () => import("./dragdrop_cloze/DragdropClozeItem").then((m) => m.DragdropClozeItem),
    { loading: RendererLoading },
  ),
  dragdrop_rationale: dynamic(
    () => import("./dragdrop_rationale/DragdropRationaleItem").then((m) => m.DragdropRationaleItem),
    { loading: RendererLoading },
  ),
  ordered_response: dynamic(
    () => import("./ordered_response/OrderedResponseItem").then((m) => m.OrderedResponseItem),
    { loading: RendererLoading },
  ),
  bowtie: dynamic(() => import("./bowtie/BowtieItem").then((m) => m.BowtieItem), {
    loading: RendererLoading,
  }),
};

function moduleFor<T extends ItemType>(type: T): ItemRendererModule<T> {
  return { Renderer: renderers[type], ...RULES[type] };
}

/**
 * Renderers registered so far. Types missing here are shown as "coming soon" by the gallery
 * rather than crashing. Add a line to `renderers` above, to `RULES` and to `RENDERED_TYPES` as a
 * type's renderer lands. The rules are synchronous; only the component waits on its chunk.
 */
export const RENDERERS: { [T in ItemType]?: ItemRendererModule<T> } = Object.fromEntries(
  (Object.keys(renderers) as ItemType[]).map((type) => [type, moduleFor(type)]),
);
