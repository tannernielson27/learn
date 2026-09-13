"use client";

import { useRouter } from "next/navigation";
import { startStepItem } from "@/app/author/case-studies/[caseStudyId]/actions";
import type { CjmmStep } from "@/lib/ngn/types";
import { useItemEditorHost } from "./ItemEditorHost";
import { NewItemChooser } from "./NewItemChooser";

export interface StepTypeChooserProps {
  caseStudyId: string;
  position: CjmmStep;
}

/** Starts a case study step with a new draft item of the chosen type, then shows its editor. */
export function StepTypeChooser({ caseStudyId, position }: StepTypeChooserProps) {
  const router = useRouter();
  const { onStepStarted } = useItemEditorHost();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Choose the item type for this step. The item is saved in this case study&apos;s bank.
      </p>
      <NewItemChooser
        create={async (type) => {
          const result = await startStepItem(caseStudyId, position, type);
          if (!result.error) {
            // The button pressed is about to be replaced by the item's editor.
            onStepStarted?.();
            router.refresh();
          }
          return result;
        }}
      />
    </div>
  );
}
