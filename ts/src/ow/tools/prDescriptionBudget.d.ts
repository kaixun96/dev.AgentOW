export const ADO_PR_DESCRIPTION_MAX_LENGTH: number;
export const VISUAL_SECTION_START: string;
export const VISUAL_SECTION_END: string;

export interface PrDescriptionUpdate {
  description: string;
  replacedVisualSection: boolean;
  prunedSections: string[];
}

export function preparePrDescriptionUpdate(
  existing: string,
  visualMarkdown: string,
  maxLength?: number,
): PrDescriptionUpdate;
