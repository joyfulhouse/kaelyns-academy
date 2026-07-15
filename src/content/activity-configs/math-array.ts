import { z } from "zod";

// Math array: a rows x cols grid for multiplication, division (sharing), and area.
export const mathArrayConfig = z.object({
  instruction: z.string(),
  mode: z.enum(["build", "multiply", "divide", "area"]),
  rows: z.number().int().min(1).max(12),
  cols: z.number().int().min(1).max(12),
  answer: z.number().int().optional(), // product / quotient / area; defaults to rows*cols when omitted
  emoji: z.string().optional(), // object to tile the array with (🚀 🐳 🍪)
});
export type MathArrayConfig = z.input<typeof mathArrayConfig>;
