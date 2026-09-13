/** The element id of a problem message, so a field can point at it with aria-describedby. */
export function issueMessageId(prefix: string, field: string): string {
  return `${prefix}-issue-${field.replace(/\./g, "-")}`;
}
