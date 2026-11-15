export function fmtTime(sec: number | null | undefined, withTenths = false): string {
  if (sec === null || sec === undefined || !isFinite(sec)) return '--:--';
  const neg = sec < 0;
  let s = Math.abs(sec);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  const core = (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(whole).padStart(2, '0')}`;
  return (neg ? '-' : '') + core + (withTenths ? `.${tenth}` : '');
}

/** Match-clock display: half 2 continues from 45:00. */
export function fmtMatchClock(clockInHalf: number, half: 1 | 2, halfLength = 45 * 60): string {
  const total = clockInHalf + (half === 2 ? halfLength : 0);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtBytes(n: number | undefined): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clip';
}
