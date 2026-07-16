import { z } from "zod";

const coinEnum = z.enum(["penny", "nickel", "dime", "quarter"]);
export const mathMoneyConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("identify"),
    instruction: z.string(),
    coins: z.array(coinEnum).min(2).max(6),
    targetCoin: coinEnum,
  }).strict(),
  z.object({
    mode: z.literal("count"),
    instruction: z.string(),
    /** Coin types the child can tap into the tray. */
    palette: z.array(coinEnum).min(1).max(4),
    targetCents: z.number().int().min(1).max(100),
  }).strict(),
]);
export type MathMoneyConfig = z.input<typeof mathMoneyConfig>;
