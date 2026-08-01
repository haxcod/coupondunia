"use client";

/**
 * Lightweight, dependency-free chart primitives for the admin dashboard
 * (Task 15.5, Req 14.3/14.4/14.5). No charting library is installed, so these
 * render with inline SVG / CSS and stay accessible: each chart exposes an
 * `aria-label` summary and a visually-hidden data table fallback so the figures
 * are usable without sight of the graphic (ui-ux-pro-max accessibility rules).
 *
 * All charts render gracefully when empty or all-zero (Req 14.7).
 */

/** A single category/series datum used by {@link HBarChart}. */
export interface BarDatum {
  /** Stable key for React reconciliation. */
  key: string;
  /** Human-readable label shown beside the bar. */
  label: string;
  /** Optional secondary line under the label (e.g. slug). */
  sublabel?: string;
  value: number;
}

interface HBarChartProps {
  data: readonly BarDatum[];
  /** Accessible summary describing what the chart shows. */
  caption: string;
  /** Unit word for screen-reader rows (e.g. "clicks"). Defaults to "clicks". */
  unit?: string;
  /** Optional empty-state message (Req 14.7). */
  emptyMessage?: string;
}

/**
 * Horizontal bar chart rendered as accessible CSS bars. Used for the top-10
 * products/deals (Req 14.4) and clicks-by-category (Req 14.5).
 */
export function HBarChart({
  data,
  caption,
  unit = "clicks",
  emptyMessage = "No data yet.",
}: HBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-secondary">{emptyMessage}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div>
      <ul className="space-y-3" aria-hidden="true">
        {data.map((d, index) => {
          const pct = Math.round((d.value / max) * 100);
          return (
            <li key={d.key} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-foreground" title={d.label}>
                    {d.label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {d.value.toLocaleString()}
                  </span>
                </div>
                {d.sublabel ? (
                  <span className="block truncate text-xs text-muted" title={d.sublabel}>
                    {d.sublabel}
                  </span>
                ) : null}
                <div className="mt-1 h-2 w-full overflow-hidden rounded-badge bg-border">
                  <div
                    className="h-full rounded-badge bg-accent"
                    style={{ width: `${d.value === 0 ? 0 : Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Screen-reader data table fallback. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Name</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, index) => (
            <tr key={d.key}>
              <td>{index + 1}</td>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A single point in the {@link LineChart} series. */
export interface LinePoint {
  /** `YYYY-MM-DD` calendar day. */
  date: string;
  value: number;
}

interface LineChartProps {
  data: readonly LinePoint[];
  caption: string;
  unit?: string;
  emptyMessage?: string;
}

/**
 * Minimal line chart over a daily series (Req 14.3) drawn with inline SVG in a
 * 0–100 viewBox so it scales fluidly. Includes a screen-reader table fallback.
 */
export function LineChart({
  data,
  caption,
  unit = "clicks",
  emptyMessage = "No clicks recorded in this period yet.",
}: LineChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-secondary">{emptyMessage}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const peak = data.reduce(
    (best, d) => (d.value > best.value ? d : best),
    data[0]!,
  );

  const W = 100;
  const H = 40;
  const n = data.length;
  const stepX = n > 1 ? W / (n - 1) : 0;

  const points = data.map((d, i) => {
    const x = n > 1 ? i * stepX : W / 2;
    const y = H - (d.value / max) * H;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1]!.x.toFixed(2)} ${H} L${points[0]!.x.toFixed(2)} ${H} Z`;

  const ariaLabel = `${caption}. ${total.toLocaleString()} total ${unit} over ${n} days. Peak of ${peak.value.toLocaleString()} ${unit} on ${peak.date}.`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
        className="h-40 w-full"
      >
        <path d={areaPath} fill="var(--color-accent)" fillOpacity={0.12} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={0.8}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{data[0]!.date}</span>
        <span>{data[data.length - 1]!.date}</span>
      </div>

      {/* Screen-reader data table fallback. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
