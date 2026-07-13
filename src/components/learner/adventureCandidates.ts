/**
 * Apply parent unit curation before choosing a hero or quest destination.
 * A null set means the whole enrolled program is active.
 */
export function curateAdventureCandidates<
  Recommendation extends { unit: { id: string } },
  Generated extends { unitKey: string },
  Review extends { unit: { id: string } },
>(
  recommendations: readonly Recommendation[],
  generated: readonly Generated[],
  activeUnitKeys: ReadonlySet<string> | null,
  reviews: readonly Review[],
): { recommendations: Recommendation[]; generated: Generated[]; reviews: Review[] } {
  if (!activeUnitKeys) {
    return {
      recommendations: [...recommendations],
      generated: [...generated],
      reviews: [...reviews],
    };
  }
  return {
    recommendations: recommendations.filter((item) => activeUnitKeys.has(item.unit.id)),
    generated: generated.filter((item) => activeUnitKeys.has(item.unitKey)),
    reviews: reviews.filter((item) => activeUnitKeys.has(item.unit.id)),
  };
}
