/** Format a number or numeric string as ZAR currency (e.g. "R 1 234.56") */
export function formatZAR(amount: number | string | null | undefined): string {
  if (amount == null) return 'R –';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return 'R –';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(n);
}

/** Format a date in SAST-friendly short form: "5 Mar 2026" */
export function formatDate(
  date: string | Date | null | undefined,
  opts?: { time?: boolean },
): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? new Date(date) : date;
  const base = d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  });
  if (opts?.time) {
    const t = d.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Johannesburg',
    });
    return `${base} ${t}`;
  }
  return base;
}

/** Relative time: "2 hours ago", "just now" */
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Truncate a string to maxLen chars */
export function truncate(s: string, maxLen = 40): string {
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/** Class name helper */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
