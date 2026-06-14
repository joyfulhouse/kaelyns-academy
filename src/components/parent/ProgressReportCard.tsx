"use client";

import { useState, useTransition } from "react";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleHalfIcon,
  LightbulbIcon,
  PlantIcon,
  SparkleIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { requestProgressReport, type ProgressReportResult } from "@/app/(parent)/actions";
import type { ProgressReport } from "@/lib/ai/report";

/**
 * "This week" AI report card on the parent dashboard. Calm, parent-facing: an
 * initial invite, a loading state, a graceful "unavailable" fallback (never a
 * stack trace), an honest "not enough activity yet" state (we never invent
 * progress), and the rendered narrative. Grounded in the learner's REAL
 * skill_state + recent attempts via requestProgressReport(learnerId). Motion
 * honors prefers-reduced-motion via motion-safe: (DESIGN.md §4).
 */

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: ProgressReport }
  | { status: "empty"; learnerName: string }
  | { status: "error" };

function nextState(result: ProgressReportResult): ViewState {
  if (result.ok) return { status: "ready", report: result.report };
  if (result.reason === "empty") return { status: "empty", learnerName: result.learnerName };
  return { status: "error" };
}

export function ProgressReportCard({
  learnerId,
  learnerName,
}: {
  learnerId: string;
  learnerName: string;
}) {
  const [view, setView] = useState<ViewState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function run() {
    setView({ status: "loading" });
    startTransition(async () => {
      try {
        const result = await requestProgressReport(learnerId);
        setView(nextState(result));
      } catch {
        // A transport failure invoking the action: still show the calm fallback.
        setView({ status: "error" });
      }
    });
  }

  const busy = isPending || view.status === "loading";

  return (
    <Surface as="section" tone="raised" aria-labelledby="weekly-report-heading" className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
          >
            <SparkleIcon weight="regular" className="size-5" />
          </span>
          <div>
            <h2
              id="weekly-report-heading"
              className="font-display text-lg font-semibold tracking-tight"
            >
              This week, in words
            </h2>
            <p className="text-sm text-ink-faint">A short, honest read on how things are going.</p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        {view.status === "idle" && (
          <div className="flex flex-col items-start gap-3">
            <p className="max-w-prose text-sm text-ink-soft">
              A warm, specific summary of {learnerName}&rsquo;s week, grounded only in what she has
              actually done.
            </p>
            <Button variant="accent" size="md" onClick={run} disabled={busy}>
              <SparkleIcon weight="fill" className="size-5" />
              Write this week&rsquo;s report
            </Button>
          </div>
        )}

        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 text-sm text-ink-soft"
          >
            <SpinnerGapIcon weight="bold" className="size-5 motion-safe:animate-spin" />
            Reading the week and writing a calm summary&hellip;
          </div>
        )}

        {!busy && view.status === "empty" && (
          <div className="flex flex-col items-start gap-3">
            <p className="inline-flex items-start gap-2 text-sm text-ink-soft">
              <PlantIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
              <span>
                There is not enough activity yet to write {view.learnerName} a report. Once she
                completes a few activities, a warm summary will appear here.
              </span>
            </p>
          </div>
        )}

        {!busy && view.status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="inline-flex items-start gap-2 text-sm text-ink-soft">
              <WarningCircleIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-ink-faint" />
              <span>
                The report is unavailable right now. This does not affect your learner&rsquo;s
                progress; please try again in a moment.
              </span>
            </p>
            <Button variant="soft" size="md" onClick={run} disabled={busy}>
              <ArrowClockwiseIcon weight="regular" className="size-5" />
              Try again
            </Button>
          </div>
        )}

        {!busy && view.status === "ready" && (
          <ReportBody report={view.report} onRegenerate={run} regenerating={busy} />
        )}
      </div>
    </Surface>
  );
}

function ReportBody({
  report,
  onRegenerate,
  regenerating,
}: {
  report: ProgressReport;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-ink">{report.summary}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <ReportList
          heading="Going well"
          tone="success"
          items={report.wins}
          icon={<CheckCircleIcon weight="fill" className="size-4 text-success" />}
        />
        <ReportList
          heading="Still emerging"
          tone="ready"
          items={report.reinforce}
          icon={<CircleHalfIcon weight="fill" className="size-4 text-honey-deep" />}
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-line bg-paper-sunk/60 p-4">
        <LightbulbIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
        <div>
          <p className="font-display text-sm font-semibold">Try this at home</p>
          <p className="mt-0.5 text-sm text-ink-soft">{report.suggestion}</p>
        </div>
      </div>

      <div>
        <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={regenerating}>
          <ArrowClockwiseIcon weight="regular" className="size-4" />
          Rewrite
        </Button>
      </div>
    </div>
  );
}

function ReportList({
  heading,
  tone,
  items,
  icon,
}: {
  heading: string;
  tone: "success" | "ready";
  items: string[];
  icon: React.ReactNode;
}) {
  return (
    <div>
      <Pill tone={tone} icon={icon} className="mb-3">
        {heading}
      </Pill>
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={`${heading}-${index}`} className="flex items-start gap-2 text-sm text-ink-soft">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-line-strong" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
