import { z } from "zod";

export const mathTenframeConfig = z.object({
  instruction: z.string(),
  mode: z.enum(["represent", "add"]),
  target: z.number().int().min(0).max(20),
  addend: z.number().int().min(0).max(20).optional(),
  frames: z.union([z.literal(1), z.literal(2)]).default(1),
});
export type MathTenframeConfig = z.input<typeof mathTenframeConfig>;
