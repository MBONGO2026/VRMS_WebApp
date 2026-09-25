// Parses the report period selected by the user (daily / monthly / annual /
// custom range) into an inclusive [from, to] date range. All date arithmetic is
// done in UTC on plain 'YYYY-MM-DD' strings so the server time zone can never
// shift a day.

const TYPES = ['daily', 'monthly', 'annual', 'custom'];
const MAX_CUSTOM_DAYS = 3660; // ~10 years
const DAY_BUCKET_MAX_DAYS = 62; // custom ranges up to ~2 months are charted per day

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates such as 2026-02-30 that Date would silently roll over.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

// The form sends a date as three dropdowns (<prefix>Day, <prefix>Month,
// <prefix>Year) so it always reads day/month/year whatever the browser language;
// links and exports use a compact ISO value instead. Accept either.
function dateParam(q, isoKey, prefix) {
  const d = q[`${prefix}Day`]; const m = q[`${prefix}Month`]; const y = q[`${prefix}Year`];
  if (d && m && y) return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
  return q[isoKey];
}

// Day/month/year parts of an ISO date, used to preselect the dropdowns.
const parts = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { day, month, year };
};

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// Returns { type, from, to, days, bucket, label, query, prevQuery, nextQuery, input }
// or throws an Error whose `i18nKey` is a translation key for the message.
function resolvePeriod(q, locale) {
  const type = TYPES.includes(q.type) ? q.type : 'monthly';
  const today = todayUtc();
  const fmt = (d, opts) => d.toLocaleDateString(locale, { timeZone: 'UTC', ...opts });
  const fail = (key) => { const e = new Error(key); e.i18nKey = key; throw e; };

  let from; let to; let label; let prev; let next; let params; const input = {};

  if (type === 'daily') {
    const raw = dateParam(q, 'date', 'on');
    from = raw ? parseDate(raw) : today;
    if (!from) fail('period.errInvalidDate');
    to = from;
    label = fmt(from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    prev = { type, date: iso(addDays(from, -1)) };
    next = { type, date: iso(addDays(from, 1)) };
    params = { date: iso(from) };
    input.date = parts(iso(from));
  } else if (type === 'monthly') {
    const y = Number(q.year) || today.getUTCFullYear();
    const m = Number(q.month) || today.getUTCMonth() + 1;
    if (m < 1 || m > 12 || y < 1900 || y > 2999) fail('period.errInvalidDate');
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 0));
    label = fmt(from, { month: 'long', year: 'numeric' });
    const p = new Date(Date.UTC(y, m - 2, 1));
    const n = new Date(Date.UTC(y, m, 1));
    prev = { type, month: p.getUTCMonth() + 1, year: p.getUTCFullYear() };
    next = { type, month: n.getUTCMonth() + 1, year: n.getUTCFullYear() };
    params = { month: m, year: y };
    Object.assign(input, params);
  } else if (type === 'annual') {
    const y = Number(q.year) || today.getUTCFullYear();
    if (y < 1900 || y > 2999) fail('period.errInvalidDate');
    from = new Date(Date.UTC(y, 0, 1));
    to = new Date(Date.UTC(y, 11, 31));
    label = String(y);
    prev = { type, year: y - 1 };
    next = { type, year: y + 1 };
    params = { year: y };
    input.year = y;
  } else {
    // Default custom range: the last 30 days up to today.
    const rawFrom = dateParam(q, 'from', 'from');
    const rawTo = dateParam(q, 'to', 'to');
    from = rawFrom ? parseDate(rawFrom) : addDays(today, -29);
    to = rawTo ? parseDate(rawTo) : today;
    if (!from || !to) fail('period.errInvalidDate');
    if (to < from) fail('period.errRangeOrder');
    if (daysBetween(from, to) + 1 > MAX_CUSTOM_DAYS) fail('period.errRangeTooLong');
    label = `${fmt(from, { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${fmt(to, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    params = { from: iso(from), to: iso(to) };
    Object.assign(input, { from: parts(iso(from)), to: parts(iso(to)) });
  }

  const days = daysBetween(from, to) + 1;
  let bucket = null;
  if (type === 'monthly') bucket = 'day';
  else if (type === 'annual') bucket = 'month';
  else if (type === 'custom' && days > 1) bucket = days <= DAY_BUCKET_MAX_DAYS ? 'day' : 'month';

  const toQuery = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
  return {
    type, from: iso(from), to: iso(to), days, bucket, label, input,
    query: toQuery({ type, ...params }),
    prevQuery: prev ? toQuery(prev) : null,
    nextQuery: next ? toQuery(next) : null,
  };
}

// Form values to redisplay after a validation error (the query as submitted).
function submittedInput(q) {
  const triple = (prefix) => ({ day: Number(q[`${prefix}Day`]), month: Number(q[`${prefix}Month`]), year: Number(q[`${prefix}Year`]) });
  return { date: triple('on'), month: Number(q.month), year: Number(q.year), from: triple('from'), to: triple('to') };
}

module.exports = { resolvePeriod, submittedInput, TYPES };
