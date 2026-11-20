export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';

  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1_000_000 || magnitude < 0.001)) {
    return value.toExponential(2);
  }

  return value.toFixed(4).replace(/\.?0+$/, '');
}

export function formatRelative(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';

  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(time).toLocaleDateString();
}

export function formatClock(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '—';
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
