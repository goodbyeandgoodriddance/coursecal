import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { Item } from '../types';
import { buildWorkload } from '../lib/workload';

/**
 * Ordinal blue ramp for the dark chart surface (#161922), low → high magnitude.
 * Steps 600/500/400/250 of the sequential blue hue; validated with
 * `validate_palette.js --ordinal --mode dark` (monotone lightness, visible step
 * gaps, light end clears 2:1 against the surface, single hue).
 *
 * On a dark surface the *brighter* step reads as "more", so the ramp runs dark
 * (quiet week) to bright (crunch week).
 */
const RAMP = ['#184f95', '#256abf', '#3987e5', '#86b6ef'] as const;

const CHART_W = 620;
const CHART_H = 132;
const PAD = { top: 14, right: 10, bottom: 34, left: 34 };
const PLOT_W = CHART_W - PAD.left - PAD.right;
const PLOT_H = CHART_H - PAD.top - PAD.bottom;
/** 2px of surface between adjacent bars, per the mark spec. */
const BAR_GAP = 2;

interface Props {
  items: Item[];
  now: Date;
  weeks: number;
}

/**
 * How much of the final grade falls due each week across the horizon, so a
 * crunch week is visible before it arrives.
 *
 * One measure, one axis: the bars encode grade weight. Item count rides along
 * as a text label rather than a second y-scale.
 */
export function WorkloadChart({ items, now, weeks }: Props) {
  const buckets = useMemo(() => buildWorkload(items, now, weeks), [items, now, weeks]);
  const [hovered, setHovered] = useState<number | null>(null);

  const maxWeight = Math.max(...buckets.map((bucket) => bucket.gradeWeight), 10);
  // Round up to a clean 10, with headroom so the tallest bar's value label has
  // room above it instead of colliding with the top gridline.
  const axisTop = Math.max(Math.ceil((maxWeight * 1.18) / 10) * 10, 10);

  const bandW = PLOT_W / buckets.length;
  const barW = Math.max(bandW - BAR_GAP * 2 - 14, 12);

  // Ramp position by magnitude, not by position in the list.
  const rampIndex = (weight: number) => {
    if (weight <= 0) return 0;
    const ratio = weight / axisTop;
    return Math.min(RAMP.length - 1, Math.floor(ratio * RAMP.length));
  };

  const active = hovered !== null ? buckets[hovered] : null;
  const busiest = buckets.reduce(
    (best, bucket) => (bucket.gradeWeight > best.gradeWeight ? bucket : best),
    buckets[0] as (typeof buckets)[number],
  );

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Grade weight due per week</span>
        {active ? (
          <span className="chart-note">
            {format(active.weekStart, 'MMM d')} — {active.gradeWeight.toFixed(0)}% of final grade
            across {active.itemCount} item{active.itemCount === 1 ? '' : 's'}
            {active.estimatedHours > 0 && ` · ~${active.estimatedHours}h est.`}
          </span>
        ) : (
          <span className="chart-note">
            {busiest && busiest.gradeWeight > 0
              ? `Heaviest: ${busiest.label.toLowerCase()} at ${busiest.gradeWeight.toFixed(0)}%`
              : 'Nothing due in this window'}
          </span>
        )}
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Grade weight due per week: ${buckets
          .map((bucket) => `${bucket.label}, ${bucket.gradeWeight.toFixed(0)} percent`)
          .join('; ')}`}
      >
        {/* Recessive gridlines at 0 / 50% / 100% of the axis. */}
        {[0, 0.5, 1].map((fraction) => {
          const y = PAD.top + PLOT_H * (1 - fraction);
          return (
            <g key={fraction}>
              <line className="grid-line" x1={PAD.left} x2={CHART_W - PAD.right} y1={y} y2={y} />
              <text className="tick-label" x={PAD.left - 6} y={y + 3} textAnchor="end">
                {Math.round(axisTop * fraction)}%
              </text>
            </g>
          );
        })}

        {buckets.map((bucket, index) => {
          const h = axisTop === 0 ? 0 : (bucket.gradeWeight / axisTop) * PLOT_H;
          const x = PAD.left + bandW * index + (bandW - barW) / 2;
          const y = PAD.top + PLOT_H - h;
          const isHovered = hovered === index;

          return (
            <g
              key={bucket.weekStart.toISOString()}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Hit target spans the whole band so hovering is forgiving. */}
              <rect
                x={PAD.left + bandW * index}
                y={PAD.top}
                width={bandW}
                height={PLOT_H}
                fill={isHovered ? 'rgba(255,255,255,0.04)' : 'transparent'}
              />

              {bucket.gradeWeight > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={RAMP[rampIndex(bucket.gradeWeight)]}
                  opacity={hovered === null || isHovered ? 1 : 0.55}
                />
              )}

              {/* Direct value label — only 4 bars, so every one is labeled. */}
              {bucket.gradeWeight > 0 && (
                <text className="value-label" x={x + barW / 2} y={y - 5} textAnchor="middle">
                  {bucket.gradeWeight.toFixed(0)}%
                </text>
              )}

              <text
                className="tick-label"
                x={PAD.left + bandW * index + bandW / 2}
                y={CHART_H - 17}
                textAnchor="middle"
              >
                {bucket.label}
              </text>

              <text
                className="tick-label"
                x={PAD.left + bandW * index + bandW / 2}
                y={CHART_H - 5}
                textAnchor="middle"
                opacity={0.72}
              >
                {bucket.itemCount === 0
                  ? '—'
                  : `${bucket.itemCount} item${bucket.itemCount === 1 ? '' : 's'}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
