
export function formatTime(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

export function now(): string {
  return formatTime(new Date());
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
