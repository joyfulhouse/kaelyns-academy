import { z } from "zod";

// ── Science & Nature (Adventure 2.0 B2) ──────────────────────────────────────

export const sortCategoriesConfig = z
  .object({
    instruction: z.string().min(1).max(240),
    bins: z
      .array(
        z
          .object({
            id: z.string().min(1).max(24),
            label: z.string().min(1).max(24),
            emoji: z.string().min(1).max(8).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    items: z
      .array(
        z
          .object({
            label: z.string().min(1).max(24),
            emoji: z.string().min(1).max(8).optional(),
            /** Must equal one of `bins[].id`. */
            binId: z.string().min(1).max(24),
          })
          .strict(),
      )
      .min(3)
      .max(8),
  })
  .strict()
  .refine((cfg) => cfg.items.every((it) => cfg.bins.some((b) => b.id === it.binId)), {
    message: "every item.binId must match a bins[].id",
    path: ["items"],
  });
export type SortCategoriesConfig = z.input<typeof sortCategoriesConfig>;
