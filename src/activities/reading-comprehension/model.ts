import {
  splitComprehensionPassage,
  validateReadingComprehensionConfig,
} from "@/content/activity-configs/reading-comprehension";

export function splitPassageSentences(passage: string): string[] {
  return splitComprehensionPassage(passage);
}

export function isExactEventPermutation(
  expectedEventIds: readonly string[],
  submittedEventIds: readonly string[],
): boolean {
  return (
    expectedEventIds.length === submittedEventIds.length &&
    new Set(submittedEventIds).size === submittedEventIds.length &&
    expectedEventIds.every((eventId, index) => submittedEventIds[index] === eventId)
  );
}

export function validateComprehensionConfig(
  config: Parameters<typeof validateReadingComprehensionConfig>[0],
): string | null {
  return validateReadingComprehensionConfig(config);
}
