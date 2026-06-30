import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityRowItem } from "./ActivityRowItem";
import type { ActivityRow } from "@/app/(parent)/data";

// ActivityRowItem is the one row shared by the parent-home "Recent activity" and
// learner-detail "Recent attempts" lists. The rendered markup must match the
// inline rows it replaces: the caller's <li> chrome composes onto the base, the
// star box sizes with the variant, and the title + `kindLabel · when` line are
// exact.

const ROW: ActivityRow = {
  activityId: "a1",
  title: "Build a word",
  kindLabel: "Build a word",
  stars: 3,
  day: "2026-06-30",
  when: "Today",
};

describe("ActivityRowItem", () => {
  it("renders the md row (parent home) with the size-10 star box and composed li chrome", () => {
    const html = renderToStaticMarkup(
      <ActivityRowItem row={ROW} size="md" className="py-3 first:pt-0 last:pb-0" />,
    );
    expect(html).toContain('<li class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">');
    expect(html).toContain(
      'class="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft"',
    );
    expect(html).toContain('<p class="truncate font-medium text-ink">Build a word</p>');
    expect(html).toContain('<p class="text-sm text-ink-faint">Build a word · Today</p>');
  });

  it("renders the sm row (learner detail) with the size-9 star box", () => {
    const html = renderToStaticMarkup(
      <ActivityRowItem row={ROW} size="sm" className="px-5 py-3.5 border-t border-line" />,
    );
    expect(html).toContain('<li class="flex items-center gap-3 px-5 py-3.5 border-t border-line">');
    expect(html).toContain(
      'class="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft"',
    );
  });
});
