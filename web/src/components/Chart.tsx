import type { MetricEvent } from '../runStore';

type Props = {
  name: string;
  points: MetricEvent[];
};

const WIDTH = 640;
const HEIGHT = 180;
const PAD = 28;

export default function Chart({ name, points }: Props) {
  const times = points.map((point) => Date.parse(point.ts));
  const values = points.map((point) => point.value);

  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const spanT = maxT - minT || 1;
  const spanV = maxV - minV || 1;

  const x = (time: number) => PAD + ((time - minT) / spanT) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - minV) / spanV) * (HEIGHT - PAD * 2);

  const coords = points.map(
    (point, index) => `${x(times[index]!).toFixed(1)},${y(point.value).toFixed(1)}`,
  );
  const last = points[points.length - 1]!;

  return (
    <article className="card chart">
      <header>
        <h2>{name}</h2>
        <span className="chart-last">{last.value}</span>
      </header>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${name} series`}>
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} className="axis" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} className="axis" />
        {points.length > 1 ? (
          <polyline points={coords.join(' ')} className="line" />
        ) : (
          <circle cx={x(times[0]!)} cy={y(last.value)} r={4} className="dot" />
        )}
        <text x={PAD - 6} y={y(maxV)} textAnchor="end" className="tick">
          {maxV}
        </text>
        <text x={PAD - 6} y={y(minV)} textAnchor="end" className="tick">
          {minV}
        </text>
        <text x={WIDTH - PAD} y={HEIGHT - 8} textAnchor="end" className="tick">
          {points.length} pts
        </text>
      </svg>
    </article>
  );
}
