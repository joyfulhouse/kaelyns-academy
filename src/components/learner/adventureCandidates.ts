/**
 * Restrict every offered destination — hero pick, warm-up review, quest, and
 * generated shelf item — to units the learner can actually open.
 *
 * The caller passes the same `playableUnitIds` set the world map locks its tiles
 * with, so the map and the offers can never disagree: the tutor may rank an
 * activity in a not-yet-unlocked unit by skill need, but offering it would send
 * the child to a door the activity route then closes.
 *
 * A null set means "no restriction" (used only where the playable set is not yet
 * resolved); pass the real set whenever it is available.
 */
export function curateAdventureCandidates<
  Recommendation extends { unit: { id: string } },
  Generated extends { unitKey: string },
  Review extends { unit: { id: string } },
>(
  recommendations: readonly Recommendation[],
  generated: readonly Generated[],
  playableUnitIds: ReadonlySet<string> | null,
  reviews: readonly Review[],
): { recommendations: Recommendation[]; generated: Generated[]; reviews: Review[] } {
  if (!playableUnitIds) {
    return {
      recommendations: [...recommendations],
      generated: [...generated],
      reviews: [...reviews],
    };
  }
  return {
    recommendations: recommendations.filter((item) => playableUnitIds.has(item.unit.id)),
    generated: generated.filter((item) => playableUnitIds.has(item.unitKey)),
    reviews: reviews.filter((item) => playableUnitIds.has(item.unit.id)),
  };
}
