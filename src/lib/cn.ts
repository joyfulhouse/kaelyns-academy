export type ClassValue = string | number | null | false | undefined | ClassValue[];

/** Minimal class joiner. Components use static class maps, so order-based
 *  conflict resolution (à la tailwind-merge) isn't needed. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    } else {
      out.push(String(input));
    }
  }
  return out.join(" ");
}
