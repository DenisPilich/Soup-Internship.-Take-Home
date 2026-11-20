import type { MetricEvent } from '../runStore';
import { formatClock, formatNumber } from '../format';

type Props = {
  name: string;
  points: MetricEvent[];
  color: string;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 54;
const PAD_RIGHT = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;

export default function Chart({ name, points, color }: Props) {
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
  const glow = { filter: `drop-shadow(0 0 2px ${color}66)` };
  const lastGlow = { filter: `drop-shadow(0 0 6px ${color}88)` };

  return (
    <article className="chart panel">
      <header className="chart-head">
        <div className="chart-title">
          <i style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {name}
        </div>
        <span className="chart-last">{formatNumber(last.value)}</span>
      </header>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${name} series`}>
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

        <polyline points={coords.join(' ')} className="line" stroke={color} style={glow} />

        {points.map((point, index) => (
          <circle
            key={point.seq}
            cx={x(times[index]!)}
            cy={y(point.value)}
            r="2.1"
            fill="#ffffff"
            stroke={color}
            strokeWidth="1.3"
          />
        ))}
        <circle cx={x(maxT)} cy={y(last.value)} r="3.6" fill={color} style={lastGlow} />

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
