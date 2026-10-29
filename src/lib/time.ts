// The shelter runs on Qatar time (UTC+3, no daylight saving).
const OFFSET_MIN = 180;

function qatarNow(d = new Date()) {
  return new Date(d.getTime() + (OFFSET_MIN + d.getTimezoneOffset()) * 60000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in Qatar time */
export function today(d = new Date()): string {
  const q = qatarNow(d);
  return `${q.getFullYear()}-${pad(q.getMonth() + 1)}-${pad(q.getDate())}`;
}

/** HH:MM in Qatar time */
export function nowHM(d = new Date()): string {
  const q = qatarNow(d);
  return `${pad(q.getHours())}:${pad(q.getMinutes())}`;
}

export function hourOf(iso: string): number {
  return qatarNow(new Date(iso)).getHours();
}

export function timeOf(iso: string): string {
  return nowHM(new Date(iso));
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function weekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${DAYS[weekday(day)]} ${d} ${MONTHS[m - 1]}`;
}

export function shortDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${DAYS[weekday(day)].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

export function dayLabel(day: string) {
  const [, , d] = day.split('-').map(Number);
  return { dow: DAYS[weekday(day)].slice(0, 3).toUpperCase(), num: d };
}

export function minusMinutes(hm: string, mins: number): string {
  const [h, m] = hm.split(':').map(Number);
  const t = Math.max(0, h * 60 + m - mins);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function monthLabel(day: string) {
  const [y, m] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
