export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';

  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1_000_000 || magnitude < 0.001)) {
    return value.toExponential(2);
  }

  return value.toFixed(4).replace(/\.?0+$/, '');
}
