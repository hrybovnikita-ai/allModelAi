export const STATUS_FILTERS = [
  { id: 'all', label: 'All providers' },
  { id: 'operational', label: 'Operational' },
  { id: 'degraded', label: 'Degraded' },
  { id: 'unavailable', label: 'Unavailable' },
  { id: 'rate limited', label: 'Rate limited' },
  { id: 'not configured', label: 'Not configured' },
];

export const WINDOW_OPTIONS = [
  { id: '15m', label: '15 minutes' },
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
];

export function filterProvidersClient(providers, { statusFilter = 'all', search = '' } = {}) {
  let list = [...(providers || [])];
  const sf = String(statusFilter || 'all').toLowerCase();
  if (sf !== 'all') {
    const map = {
      operational: ['operational'],
      degraded: ['degraded'],
      unavailable: ['unavailable'],
      'rate limited': ['rate_limited', 'quota_exhausted'],
      'not configured': ['not_configured'],
    };
    const keys = map[sf] || [sf.replace(/\s+/g, '_')];
    list = list.filter((p) => keys.includes(p.statusKey || p.status));
  }
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) => p.id?.includes(q) || String(p.displayName || '').toLowerCase().includes(q),
    );
  }
  return list;
}

export function sortProvidersClient(providers, sortBy = 'name') {
  const key = String(sortBy || 'name').toLowerCase();
  const copy = [...(providers || [])];
  if (key === 'latency') {
    copy.sort((a, b) => (a.averageLatencyMs ?? 1e9) - (b.averageLatencyMs ?? 1e9));
  } else if (key === 'success') {
    copy.sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1));
  } else {
    copy.sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
  }
  return copy;
}

export function statusBadgeClass(statusKey) {
  const k = String(statusKey || '').toLowerCase();
  if (k === 'operational') return 'ph-status--ok';
  if (k === 'degraded') return 'ph-status--warn';
  if (k === 'rate_limited' || k === 'quota_exhausted') return 'ph-status--rate';
  if (k === 'authentication_failed') return 'ph-status--auth';
  if (k === 'unavailable') return 'ph-status--bad';
  if (k === 'not_configured') return 'ph-status--muted';
  return 'ph-status--unknown';
}

export function formatPercent(rate) {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function chartSeriesFromPoints(points, valueKey) {
  return (points || [])
    .map((p) => p[valueKey])
    .filter((v) => typeof v === 'number' && !Number.isNaN(v));
}
