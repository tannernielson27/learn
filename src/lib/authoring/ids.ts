const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params reach queries only as well-formed UUIDs; anything else is a 404. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
