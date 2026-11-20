import { useId } from 'react';
import type { MetricEvent } from '../runStore';
import { formatClock, formatNumber } from '../format';

type Props = {
  name: string;
  points: MetricEvent[];
  color: string;
};

const WIDTH = 640;
const HEIGHT = 210;
const PAD_LEFT = 56;
const PAD_RIGHT = 18;
const PAD_TOP = 14;
const PAD_BOTTOM = 34;

export default function Chart({ name, points, color }: Props) {
  const gradientId = `chart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const times = points.map((point) => Date.parse(point.ts));
  const values = points.map((point) => point.value);

  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;

  const x = (time: number) =>
    PAD_LEFT + ((time - minT) / spanT) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (value: number) =>
    HEIGHT - PAD_BOTTOM - ((value - minV) / spanV) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const coords = points.map(
    (point, index) => `${x(times[index]!).toFixed(1)},${y(point.value).toFixed(1)}`,
  );
  const last = points[points.length - 1]!;
  const levels = [minV, minV + spanV / 2, maxV];

  return (
    <article className="chart panel">
      <header className="chart-head">
        <div className="chart-title">
          <i style={{ background: color }} />
          {name}
        </div>
        <span className="chart-last">{formatNumber(last.value)}</span>
      </header>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${name} series`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {levels.map((value, index) => (
          <g key={index}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(value)}
              y2={y(value)}
              className="grid-line"
            />
            <text x={PAD_LEFT - 8} y={y(value) + 3} textAnchor="end" className="tick">
              {formatNumber(value)}
            </text>
          </g>
        ))}

        {points.length > 1 && (
          <>
            <polygon
              points={`${x(minT).toFixed(1)},${HEIGHT - PAD_BOTTOM} ${coords.join(' ')} ${x(
                maxT,
              ).toFixed(1)},${HEIGHT - PAD_BOTTOM}`}
              fill={`url(#${gradientId})`}
            />
            <polyline points={coords.join(' ')} className="line" stroke={color} />
          </>
        )}

        <circle cx={x(maxT)} cy={y(last.value)} r="3.5" fill={color} />
        <circle cx={x(maxT)} cy={y(last.value)} r="7" fill={color} opacity="0.18" />

        <text x={PAD_LEFT} y={HEIGHT - 8} className="tick">
          {formatClock(points[0]!.ts)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end" className="tick">
          {points.length} pts
        </text>
      </svg>
    </article>
  );
}
