export type MeasureAttribute = "length" | "height" | "weight";
export type ComparisonQuestion = "most" | "least";

export interface SizedItem {
  size: number;
}

function valueForAttribute(attribute: MeasureAttribute, item: SizedItem): number {
  switch (attribute) {
    case "length":
    case "height":
    case "weight":
      return item.size;
  }
}

/** Derive the unique requested extreme; ambiguous authored comparisons fail closed. */
export function deriveComparisonIndex(
  attribute: MeasureAttribute,
  question: ComparisonQuestion,
  items: SizedItem[],
): number | null {
  if (items.length === 0) return null;
  const values = items.map((item) => valueForAttribute(attribute, item));
  const extreme = question === "most" ? Math.max(...values) : Math.min(...values);
  const matching = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value === extreme);
  return matching.length === 1 ? matching[0].index : null;
}
