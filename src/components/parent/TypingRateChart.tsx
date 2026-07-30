interface TypingRateChartPoint {
  day: string;
  wpm: number;
  label: string;
}

interface TypingRateChartProps {
  points: readonly TypingRateChartPoint[];
}

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 280;
const PLOT_LEFT = 48;
const PLOT_RIGHT = 608;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 220;
const CEILING_FLOOR = 20;
const CEILING_STEP = 10;

function xFor(index: number, count: number): number {
  if (count === 1) return (PLOT_LEFT + PLOT_RIGHT) / 2;
  return PLOT_LEFT + (index * (PLOT_RIGHT - PLOT_LEFT)) / (count - 1);
}

/**
 * Reading fluency has a vetted "typical early 1st grade" WCPM band to
 * annotate against (see FluencyChart). No comparable benchmark exists for
 * early keyboarding, so the y-axis scales to this learner's own data instead
 * of asserting an invented "typical" WPM — a floor keeps a single quiet day
 * from looking like a dramatic spike.
 */
function ceilingFor(points: readonly TypingRateChartPoint[]): number {
  const highest = Math.max(CEILING_FLOOR, ...points.map((point) => point.wpm));
  return Math.ceil(highest / CEILING_STEP) * CEILING_STEP;
}

function yFor(wpm: number, ceiling: number): number {
  const clamped = Math.max(0, Math.min(ceiling, wpm));
  return PLOT_BOTTOM - (clamped / ceiling) * (PLOT_BOTTOM - PLOT_TOP);
}

function coordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatWpm(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function chartLabel(
  points: readonly TypingRateChartPoint[],
  latest: number,
  best: number,
): string {
  const delta = latest - points[0].wpm;
  const trend =
    delta > 0
      ? `Up ${formatWpm(delta)} WPM`
      : delta < 0
        ? `Down ${formatWpm(Math.abs(delta))} WPM`
        : "Holding steady";
  const dayWord = points.length === 1 ? "day" : "days";
  return `Typing speed chart. Latest ${formatWpm(latest)} WPM. Best ${formatWpm(best)} WPM. ${trend} across ${points.length} typing ${dayWord}.`;
}

/** Parent-only, deterministic typing-speed chart. Mirrors FluencyChart's
 * inline-SVG shape (viewBox, index-spaced polyline, point titles, day
 * labels), swapping its fixed reading-benchmark band for a data-scaled axis
 * since no equivalent "typical" WPM figure exists to cite honestly. */
export function TypingRateChart({ points }: TypingRateChartProps) {
  if (points.length === 0) {
    return (
      <div className="rounded-lg bg-paper-sunk/50 px-5 py-6 text-center">
        <p className="font-medium text-ink-soft">No typing speed yet</p>
        <p className="mt-1 text-sm text-ink-faint">
          Typing speed will appear here after a few Rocket Race sessions.
        </p>
      </div>
    );
  }

  const latest = points.at(-1)!.wpm;
  const best = Math.max(...points.map((point) => point.wpm));
  const ceiling = ceilingFor(points);
  const polylinePoints = points
    .map(
      (point, index) =>
        `${coordinate(xFor(index, points.length))},${coordinate(yFor(point.wpm, ceiling))}`,
    )
    .join(" ");
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">Latest</dt>
          <dd className="font-semibold text-ink">{formatWpm(latest)} WPM</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-ink-faint">Best</dt>
          <dd className="font-semibold text-ink">{formatWpm(best)} WPM</dd>
        </div>
      </dl>

      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label={chartLabel(points, latest, best)}
        className="mt-4 h-auto w-full overflow-visible"
      >
        <text x={PLOT_LEFT} y={PLOT_TOP - 8} fill="var(--color-ink-faint)" className="text-[11px]">
          words per minute
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
          const y = yFor(point.wpm, ceiling);
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
              <title>{`${point.label}: ${formatWpm(point.wpm)} WPM`}</title>
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
