export interface SelectForMoveProps {
  /** The move form this checkbox joins; it sits in a list outside that form. */
  formId: string;
  name: "item" | "caseStudy";
  value: string;
  label: string;
}

/** A row's checkbox for moving it to a folder, beside (never inside) the row's link. */
export function SelectForMove({ formId, name, value, label }: SelectForMoveProps) {
  return (
    <label className="tap-target flex shrink-0 cursor-pointer items-center justify-center px-3 hover:bg-surface-2">
      <input
        type="checkbox"
        form={formId}
        name={name}
        value={value}
        aria-label={label}
        className="size-5 accent-accent"
      />
    </label>
  );
}
