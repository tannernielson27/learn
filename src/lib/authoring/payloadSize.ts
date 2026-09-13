/**
 * The most an item may weigh when it reaches Save draft or Publish, as UTF-8 JSON. A full sample
 * item with its patient record is a few kilobytes, so this leaves ample room for real content while
 * keeping any one row small. Next already caps a Server Action request at 1 MB; this is the
 * item-level limit, and it covers every field, including ones the schemas do not size-limit
 * (record, metadata, rationale).
 */
export const MAX_ITEM_PAYLOAD_BYTES = 200_000;

const encoder = new TextEncoder();

/** False for anything too large, or anything that cannot be serialized at all. Never throws. */
export function withinItemSizeLimit(value: unknown): boolean {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return false; // cyclic structures, BigInt
  }
  if (json === undefined) return false;
  // Every UTF-16 code unit is at least one UTF-8 byte, so an over-long string can be refused
  // before it is encoded.
  if (json.length > MAX_ITEM_PAYLOAD_BYTES) return false;
  return encoder.encode(json).length <= MAX_ITEM_PAYLOAD_BYTES;
}
