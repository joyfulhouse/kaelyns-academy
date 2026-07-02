// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { interest, learnerInterest } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";

export interface InterestView {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
}

const MAX_PICKS = 5;

/** PURE: dedupe + bound + subset-validate child picks against the offered set.
 *  Returns the cleaned ids, or null when any pick is outside the offered set /
 *  over the cap (the action then reports invalid; nothing is written). */
export function validatePicks(pickedIds: string[], offeredIds: string[]): string[] | null {
  const offered = new Set(offeredIds);
  const deduped = [...new Set(pickedIds)];
  if (deduped.length > MAX_PICKS) return null;
  if (deduped.some((id) => !offered.has(id))) return null;
  return deduped;
}

export async function listPublishedInterests(): Promise<InterestView[]> {
  const rows = await getDb()
    .select()
    .from(interest)
    .where(eq(interest.status, "published"))
    .orderBy(asc(interest.label));
  return rows.map((r) => ({ id: r.id, slug: r.slug, label: r.label, icon: r.icon }));
}

export async function getLearnerInterests(
  accountId: string,
  learnerId: string,
): Promise<{ offered: InterestView[]; picked: InterestView[] }> {
  return withOwnedLearner(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({
          id: interest.id,
          slug: interest.slug,
          label: interest.label,
          icon: interest.icon,
          source: learnerInterest.source,
        })
        .from(learnerInterest)
        .innerJoin(interest, eq(learnerInterest.interestId, interest.id))
        .where(and(eq(learnerInterest.learnerId, learnerId), eq(interest.status, "published")))
        .orderBy(asc(interest.label));
      const view = (r: (typeof rows)[number]): InterestView => ({
        id: r.id, slug: r.slug, label: r.label, icon: r.icon,
      });
      return {
        offered: rows.filter((r) => r.source === "parent").map(view),
        picked: rows.filter((r) => r.source === "child").map(view),
      };
    },
    { offered: [], picked: [] },
  );
}

/**
 * Parent gate: replace the offered set; prune child picks no longer offered.
 *
 * Lock order (must match {@link setPickedInterests}, which locks the SAME
 * `source="parent"` rows first, to rule out a deadlock): this transaction
 * touches `source="parent"` rows FIRST (the delete + insert below implicitly
 * takes row locks) and `source="child"` rows SECOND (the prune select/delete).
 * A racing `setPickedInterests` therefore either commits fully before this
 * transaction's parent-row DELETE can acquire its locks, or blocks on that
 * DELETE until this transaction (parent replace + child prune) commits — it
 * can never observe a half-applied offered set (Finding 1 / TOCTOU).
 */
export async function setOfferedInterests(
  accountId: string,
  learnerId: string,
  interestIds: string[],
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      const ids = [...new Set(interestIds)].slice(0, 30);
      await getDb().transaction(async (tx) => {
        await tx
          .delete(learnerInterest)
          .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "parent")));
        if (ids.length > 0) {
          await tx
            .insert(learnerInterest)
            .values(ids.map((interestId) => ({ learnerId, interestId, source: "parent" as const })));
        }
        // Child picks must stay ⊆ offered: prune any pick now outside the set.
        // Locked FOR UPDATE (same discipline as setPickedInterests's child
        // delete+insert) so this prune can't race a concurrent child write.
        if (ids.length > 0) {
          const picks = await tx
            .select({ id: learnerInterest.id, interestId: learnerInterest.interestId })
            .from(learnerInterest)
            .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")))
            .for("update");
          const allowed = new Set(ids);
          const stale = picks.filter((p) => !allowed.has(p.interestId)).map((p) => p.id);
          if (stale.length > 0) {
            await tx.delete(learnerInterest).where(inArray(learnerInterest.id, stale));
          }
        } else {
          await tx
            .delete(learnerInterest)
            .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")));
        }
      });
      return true;
    },
    false,
  );
}

/**
 * Child pick: validated ⊆ offered (server-authoritative), replace-all.
 *
 * Fix (Finding 1 / TOCTOU): the offered-set read used to happen OUTSIDE this
 * function's write transaction, so a concurrent `setOfferedInterests` could
 * narrow the offered set between the read and the write, leaving a child pick
 * outside the new offered set until the NEXT write. The read now happens
 * INSIDE the same transaction as the delete+insert, and locks the offered
 * (`source="parent"`) rows `FOR UPDATE` — the same rows `setOfferedInterests`
 * deletes first — so a racing `setOfferedInterests` either commits its full
 * parent-replace-and-child-prune before this transaction can see/lock those
 * rows, or blocks until this transaction (which re-validates against
 * whatever offered set it actually locked) commits. Touches `source="parent"`
 * rows first, then `source="child"` rows — same order as
 * {@link setOfferedInterests} — so the two can never deadlock.
 */
export async function setPickedInterests(
  accountId: string,
  learnerId: string,
  interestIds: string[],
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      return getDb().transaction(async (tx) => {
        const offered = await tx
          .select({ interestId: learnerInterest.interestId })
          .from(learnerInterest)
          .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "parent")))
          .for("update");
        const cleaned = validatePicks(interestIds, offered.map((o) => o.interestId));
        if (cleaned === null) return false;
        await tx
          .delete(learnerInterest)
          .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")));
        if (cleaned.length > 0) {
          await tx
            .insert(learnerInterest)
            .values(cleaned.map((interestId) => ({ learnerId, interestId, source: "child" as const })));
        }
        return true;
      });
    },
    false,
  );
}

/** The ≤5 picked labels for AI practice theming (§8: bounded preset labels
 *  from the admin-authored taxonomy — the ONLY interest text AI ever sees). */
export async function pickedInterestLabels(accountId: string, learnerId: string): Promise<string[]> {
  const { picked } = await getLearnerInterests(accountId, learnerId);
  return picked.slice(0, 5).map((p) => p.label);
}
