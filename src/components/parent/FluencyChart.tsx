export interface FluencyChartPoint {
  day: string;
  wcpm: number;
  label: string;
}

interface FluencyChartProps {
  points: FluencyChartPoint[];
  latest: number | null;
  best: number | null;
}

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 280;
const PLOT_LEFT = 48;
const PLOT_RIGHT = 608;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 220;
const WCPM_CEILING = 70;
const REFERENCE_LOW = 10;
const REFERENCE_HIGH = 30;

function xFor(index: number, count: number): number {
  if (count === 1) return (PLOT_LEFT + PLOT_RIGHT) / 2;
  return PLOT_LEFT + (index * (PLOT_RIGHT - PLOT_LEFT)) / (count - 1);
}

function yFor(wcpm: number): number {
  const clamped = Math.max(0, Math.min(WCPM_CEILING, wcpm));
  return PLOT_BOTTOM - (clamped / WCPM_CEILING) * (PLOT_BOTTOM - PLOT_TOP);
}

function coordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatWcpm(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function chartLabel(points: FluencyChartPoint[], latest: number, best: number): string {
  const delta = latest - points[0].wcpm;
  const trend =
    delta > 0
      ? `Up ${formatWcpm(delta)} WCPM`
      : delta < 0
        ? `Down ${formatWcpm(Math.abs(delta))} WCPM`
        : "Holding steady";
  const dayWord = points.length === 1 ? "day" : "days";
  return `Reading fluency chart. Latest ${formatWcpm(latest)} WCPM. Best ${formatWcpm(best)} WCPM. ${trend} across ${points.length} reading-aloud ${dayWord}.`;
}

/** Parent-only, deterministic sentence-reading fluency chart. */
export function FluencyChart({ points, latest, best }: FluencyChartProps) {
  if (points.length === 0) {
    return (
      <div className="rounded-lg bg-paper-sunk/50 px-5 py-6 text-center">
        <p className="font-medium text-ink-soft">No reading-aloud yet</p>
        <p className="mt-1 text-sm text-ink-faint">
          Sentence reading results will appear here after a read-aloud activity.
        </p>
      </div>
    );
  }

  const resolvedLatest = latest ?? points.at(-1)!.wcpm;
  const resolvedBest = best ?? Math.max(...points.map(({ wcpm }) => wcpm));
  const polylinePoints = points
    .map(({ wcpm }, index) => `${coordinate(xFor(index, points.length))},${coordinate(yFor(wcpm))}`)
    .join(" ");
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const bandTop = yFor(REFERENCE_HIGH);
  const bandBottom = yFor(REFERENCE_LOW);

  return (
    <div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">Latest</dt>
          <dd className="font-semibold text-ink">{formatWcpm(resolvedLatest)} WCPM</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">Best</dt>
          <dd className="font-semibold text-ink">{formatWcpm(resolvedBest)} WCPM</dd>
        </div>
      </dl>

      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label={chartLabel(points, resolvedLatest, resolvedBest)}
        className="mt-4 h-auto w-full overflow-visible"
      >
        <rect
          x={PLOT_LEFT}
          y={bandTop}
          width={PLOT_RIGHT - PLOT_LEFT}
          height={bandBottom - bandTop}
          rx="8"
          fill="var(--color-accent)"
          fillOpacity="0.1"
        />
        <line
          x1={PLOT_LEFT}
          y1={bandTop}
          x2={PLOT_RIGHT}
          y2={bandTop}
          stroke="var(--color-accent-deep)"
          strokeOpacity="0.2"
        />
        <line
          x1={PLOT_LEFT}
          y1={bandBottom}
          x2={PLOT_RIGHT}
          y2={bandBottom}
          stroke="var(--color-accent-deep)"
          strokeOpacity="0.2"
        />
        <text
          x={PLOT_LEFT + 8}
          y={bandTop - 8}
          fill="var(--color-ink-faint)"
          className="text-[11px]"
        >
          typical early 1st grade
        </text>

        <polyline
          points={polylinePoints}
          fill="none"
          stroke="var(--color-accent-deep)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => {
          const x = xFor(index, points.length);
          const y = yFor(point.wcpm);
          return (
            <circle
              key={`${point.day}-${index}`}
              cx={x}
              cy={y}
              r="5"
              fill="var(--color-paper)"
              stroke="var(--color-accent-deep)"
              strokeWidth="3"
            >
              <title>{`${point.label}: ${formatWcpm(point.wcpm)} WCPM`}</title>
            </circle>
          );
        })}

        {points.map((point, index) =>
          labelIndexes.has(index) ? (
            <text
              key={`${point.day}-label-${index}`}
              x={xFor(index, points.length)}
              y={PLOT_BOTTOM + 30}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              fill="var(--color-ink-faint)"
              className="text-[11px]"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
