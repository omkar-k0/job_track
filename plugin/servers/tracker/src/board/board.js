// Board for the job-hunt tracker: kanban and table views, search and filters, a role drawer and a stats header.
// Plain JS, no build step; served by board-server.ts. Every move is POST /api/move, which runs the tracker's
// transition rules. Roles come from scraped postings, so every string goes in with textContent or an attribute
// setter; nothing here builds markup from data (a test fails on innerHTML and friends).

const LABELS = { found: 'Found', verified: 'Verified', scored: 'Scored', queued: 'Queued', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offer', dropped: 'Dropped', closed: 'Closed' };
const ALL_STATUSES = Object.keys(LABELS);
// found and verified are the sweep's own steps: counted in the header and listed in the table, but no lanes.
// scored stays: it is the shortlist the user promotes to queued by hand.
const COLUMNS = ['scored', 'queued', 'applied', 'interviewing', 'offer', 'dropped', 'closed'];
const IN_PIPELINE = ['found', 'verified'];
const FOLDED = new Set(['dropped', 'closed']);
// Every drop moves at once with a default reason, except closed, which needs an outcome first.
// On the board the user's word is the evidence, so applied and dropped need no confirmation or quote.
const NEEDS_FORM = new Set(['closed']);
const PERIODS = { year: '/yr', month: '/mo', day: '/day', hour: '/hr' };
// Rough working periods per year, used only to order pay in the table.
const PER_YEAR = { year: 1, month: 12, day: 220, hour: 1800 };
const OUTCOMES = ['rejected', 'withdrawn', 'role_closed'];
const STOPPED = 'The board has stopped. Run /job-tracker:board in Claude to start it again.';
const STALE = 'This link is out of date. Run /job-tracker:board in Claude for a fresh one.';
const TOKEN_KEY = 'job-tracker-board-token';
const THEME_KEY = 'job-tracker-board-theme';
const SORTS = {
  company: { label: 'Company', get: (r) => r.company.toLowerCase(), text: true },
  title: { label: 'Role', get: (r) => r.title.toLowerCase(), text: true, cls: 'hide-sm' },
  status: { label: 'Status', get: (r) => ALL_STATUSES.indexOf(r.status) },
  score: { label: 'Score', get: (r) => r.score, num: true },
  mode: { label: 'Mode', get: (r) => (r.location_type || '').toLowerCase(), text: true, cls: 'hide-sm' },
  source: { label: 'Source', get: (r) => (r.source || '').toLowerCase(), text: true, cls: 'hide-md' },
  pay: { label: 'Pay', get: (r) => annual(r), num: true, cls: 'hide-md' },
  applied: { label: 'Applied', get: (r) => stamp(r.applied_at), num: true, cls: 'hide-md' },
  updated: { label: 'Updated', get: (r) => stamp(r.last_event), num: true, cls: 'hide-sm' },
};
const DEFAULTS = { q: '', status: '', source: '', mode: '', smin: '', smax: '', need: false, view: 'board', sort: 'score', dir: 'desc', role: null };

// ---------- small helpers ----------

// Storage can be blocked (private windows, site settings); the board must work without it.
const keep = (area, key, value) => {
  try {
    if (value === null) window[area].removeItem(key);
    else window[area].setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
const recall = (area, key) => {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const $ = (id) => document.getElementById(id);
const stamp = (ts) => {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Only web links are made clickable, whatever a scraped field holds ("javascript:", "data:", "file:" never are).
function safeHref(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function link(href, text, className) {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

const SVG = 'http://www.w3.org/2000/svg';
// One outline set on a 20px grid, stroked at 1.5px by board.css; index.html draws the static ones with the same paths.
function icon(paths) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
const ICONS = {
  // A square with an arrow leaving its top-right corner: the usual "opens elsewhere" mark.
  external: ['M15 11v4.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1H9', 'M12 3.5h4.5V8', 'M9 11l7.5-7.5'],
  moon: ['M16.5 12.2A7 7 0 1 1 7.8 3.5a5.5 5.5 0 0 0 8.7 8.7z'],
  sun: ['M10 6.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5z', 'M10 2v1.75', 'M10 16.25V18', 'M2 10h1.75', 'M16.25 10H18', 'M4.35 4.35l1.24 1.24', 'M14.41 14.41l1.24 1.24', 'M4.35 15.65l1.24-1.24', 'M14.41 5.59l1.24-1.24'],
  filter: ['M3 5.5h14', 'M5.5 10h9', 'M8 14.5h4'],
  close: ['M5 5l10 10', 'M15 5L5 15'],
  calendar: ['M3.5 5h13v11.5h-13z', 'M3.5 8.5h13', 'M7 3v3.5', 'M13 3v3.5'],
  note: ['M5 2.75h7l3.5 3.5v11h-10.5z', 'M12 2.75v3.5h3.5', 'M7.5 10.5h5', 'M7.5 13.5h5'],
  move: ['M3.5 10h12', 'M11.5 6l4 4-4 4'],
  warning: ['M10 3l7.5 13.5h-15z', 'M10 8.5v3.5', 'M10 14.25v.01'],
  check: ['M4 10.5l3.5 3.5L16 5.5'],
  up: ['M10 15V5', 'M6 9l4-4 4 4'],
  down: ['M10 5v10', 'M6 11l4 4 4-4'],
};
const externalIcon = () => icon(ICONS.external);
// An icon, then text in its own span, so flex layouts keep the icon at the top-left of a wrapped line.
function withIcon(node, name, text) {
  node.append(icon(ICONS[name]), el('span', '', text));
  return node;
}

// "€90K–€120K/yr", "from $150K/yr", "up to £80K/mo"; nothing when the posting had no band.
function pay(role) {
  const { comp_min: min, comp_max: max, comp_currency: currency, comp_period: period } = role;
  if (min == null && max == null) return '';
  let fmt;
  try {
    const nf = new Intl.NumberFormat(undefined, { ...(currency ? { style: 'currency', currency } : {}), notation: 'compact', maximumFractionDigits: 1 });
    fmt = (n) => nf.format(n);
  } catch {
    fmt = (n) => `${n.toLocaleString()} ${currency}`; // not an ISO currency code
  }
  const band = min != null && max != null && min !== max ? `${fmt(min)}–${fmt(max)}` : min != null ? (max == null ? `from ${fmt(min)}` : fmt(min)) : `up to ${fmt(max)}`;
  return band + (PERIODS[period] || '');
}

function annual(role) {
  const top = role.comp_max ?? role.comp_min;
  return top == null ? null : top * (PER_YEAR[role.comp_period] ?? 1);
}

function age(ts) {
  const then = stamp(ts);
  if (then == null) return '';
  const days = Math.floor((Date.now() - then) / 864e5);
  return days < 1 ? 'today' : `${days}d ago`;
}

function fmtDate(ts) {
  const ms = stamp(ts);
  if (ms == null) return '';
  const same = new Date(ms).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(same ? {} : { year: 'numeric' }) }).format(ms);
}

function fmtDateTime(ts, tz) {
  const ms = stamp(ts);
  if (ms == null) return '';
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, ...(tz ? { timeZone: tz, timeZoneName: 'short' } : {}) }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts).format(ms); // not a time zone this browser knows
  }
}

// ---------- state: filters, view and open role live in the URL hash ----------

let token = '';
const state = { ...DEFAULTS };

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = p.get('t');
  if (t) {
    token = t;
    keep('sessionStorage', TOKEN_KEY, t);
  } else if (!token) {
    token = recall('sessionStorage', TOKEN_KEY) || '';
  }
  const pick = (key, ok) => {
    const v = p.get(key) ?? '';
    return ok(v) ? v : '';
  };
  state.q = p.get('q') ?? '';
  state.status = pick('status', (v) => ALL_STATUSES.includes(v));
  state.source = p.get('source') ?? '';
  state.mode = p.get('mode') ?? '';
  state.smin = pick('smin', (v) => v !== '' && Number.isFinite(Number(v)));
  state.smax = pick('smax', (v) => v !== '' && Number.isFinite(Number(v)));
  state.need = p.get('need') === '1';
  state.view = p.get('view') === 'table' ? 'table' : 'board';
  state.sort = pick('sort', (v) => v in SORTS) || DEFAULTS.sort;
  state.dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
  const role = p.get('role') ?? '';
  state.role = /^\d{1,12}$/.test(role) ? Number(role) : null;
}

// The token stays out of the address bar once the tab holds it (history, bookmarks, screenshots), unless
// storage is blocked, in which case a reload would lose it.
function writeHash() {
  const p = new URLSearchParams();
  if (token && !recall('sessionStorage', TOKEN_KEY)) p.set('t', token);
  if (state.q) p.set('q', state.q);
  for (const key of ['status', 'source', 'mode', 'smin', 'smax']) if (state[key]) p.set(key, state[key]);
  if (state.need) p.set('need', '1');
  if (state.view !== DEFAULTS.view) p.set('view', state.view);
  if (state.sort !== DEFAULTS.sort) p.set('sort', state.sort);
  if (state.dir !== DEFAULTS.dir) p.set('dir', state.dir);
  if (state.role != null) p.set('role', String(state.role));
  const next = p.toString();
  history.replaceState(null, '', `${location.pathname}${location.search}${next ? `#${next}` : ''}`);
}

const filtered = () => state.q !== '' || state.status !== '' || state.source !== '' || state.mode !== '' || state.smin !== '' || state.smax !== '' || state.need;

// ---------- data ----------

const boardEl = $('board');
const tableEl = $('table-wrap');
const emptyEl = $('empty');
const statusEl = $('status');
const statsEl = $('stats');
const drawerEl = $('drawer');
const scrimEl = $('scrim');
const expanded = new Set();
let view = null;
let haystack = new Map();
let lastKey = '';
let requests = 0;
let statusIsError = false;
// While a card is dragged or a move form is open, polling must not redraw the board under the user.
// Derived from the page rather than kept as a flag, so it cannot get stuck.
let dragging = false;
let lastDragEnd = 0;
const isBusy = () => dragging || document.querySelector('#board form') !== null;
// The card just moved by a drop opens with a reason field until the user saves, skips or moves another.
let justMoved = null;
// A card dropped on closed waits there, with its outcome form, until Move or Cancel.
let pending = null;
// The item that takes Tab (roving tabindex), so a long board is one tab stop, and arrows go from there.
let navId = null;
let opener = null;
let drawerSeq = 0;

function say(message, { error = false, ms = 0 } = {}) {
  statusEl.textContent = message;
  statusIsError = error && message !== '';
  if (ms) setTimeout(() => statusEl.textContent === message && say(''), ms);
}

async function api(path, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw new Error(STOPPED); // fetch rejects only when the server is unreachable
  }
  if (res.status === 401) throw new Error(STALE);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `The board answered ${res.status}.`), { status: res.status });
  return data;
}

async function refresh() {
  // A hidden tab doesn't poll, so a forgotten tab can't keep the board listening; focus revives it.
  if (document.hidden) return;
  const seq = ++requests;
  try {
    if (isBusy()) {
      await api('/api/health'); // keeps the idle timer from stopping the board while a form is open
      return;
    }
    const next = await api('/api/board');
    // A newer refresh supersedes this one, and a form or drag may have started while it was in flight.
    if (seq !== requests || isBusy()) return;
    // Redrawing identical data would drop keyboard focus every 30 s, so only draw what changed.
    const key = JSON.stringify(next);
    if (!view || key !== lastKey) {
      const previous = view;
      view = next;
      try {
        index();
        renderAll();
      } catch (err) {
        view = previous;
        throw err;
      }
      lastKey = key;
      // The open role may have changed too; leave it alone while the user is typing in it.
      if (state.role != null && !drawerEl.hidden && !drawerDirty()) loadRole(state.role, { quiet: true });
    }
    if (statusIsError) say('');
  } catch (err) {
    say(err.message, { error: true });
  }
}

function index() {
  haystack = new Map(view.roles.map((r) => [r.id, [r.company, r.title, r.location_line, r.location_type, r.source, r.stack, r.industry, r.status].filter(Boolean).join(' ').toLowerCase()]));
}

// ---------- filtering and sorting ----------

function matches(role) {
  if (state.status && role.status !== state.status) return false;
  if (state.source && (role.source || '') !== state.source) return false;
  if (state.mode && (role.location_type || '') !== state.mode) return false;
  if (state.smin !== '' && !(role.score != null && role.score >= Number(state.smin))) return false;
  if (state.smax !== '' && !(role.score != null && role.score <= Number(state.smax))) return false;
  if (state.need && role.needs.length === 0) return false;
  if (state.q) {
    const hay = haystack.get(role.id) ?? '';
    for (const term of state.q.toLowerCase().split(/\s+/)) if (term && !hay.includes(term)) return false;
  }
  return true;
}

const visibleRoles = () => view.roles.filter(matches);

function sorted(roles) {
  const { get, text } = SORTS[state.sort];
  const sign = state.dir === 'asc' ? 1 : -1;
  // Missing values sort last in either direction, and ties keep the server's order (best score first).
  return [...roles].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (text ? x.localeCompare(y) : x - y) * sign;
  });
}

// ---------- rendering ----------

function renderAll() {
  renderStats();
  renderControls();
  renderContent();
}

function dotted(node, status) {
  node.style.setProperty('--dot', `var(--s-${status})`);
  return node;
}

function renderStats() {
  const { stats } = view;
  const chips = el('div', 'counts');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Roles per status; choose one to filter');
  for (const status of [...IN_PIPELINE, ...COLUMNS]) {
    const n = stats.counts[status] ?? 0;
    if (IN_PIPELINE.includes(status) && n === 0) continue;
    const chip = dotted(el('button', `count-chip${IN_PIPELINE.includes(status) ? ' dim' : ''}`), status);
    chip.type = 'button';
    chip.append(el('span', '', LABELS[status]), el('b', '', String(n)));
    chip.setAttribute('aria-pressed', String(state.status === status));
    chip.addEventListener('click', () => {
      state.status = state.status === status ? '' : status;
      // The board has no lane for roles still in the sweep, so show them where they can be listed.
      if (state.status && IN_PIPELINE.includes(state.status)) state.view = 'table';
      changed();
    });
    chips.append(chip);
  }

  const kpis = el('dl', 'kpis');
  const kpi = (label, glyph) => {
    const box = el('div', 'kpi');
    const dd = el('dd');
    const dt = el('dt', '', label);
    dt.prepend(icon(ICONS[glyph]));
    box.append(dt, dd);
    kpis.append(box);
    return dd;
  };
  const week = kpi('Applied this week', 'check');
  week.append(el('span', 'big', String(stats.applied_this_week)), el('span', 'sub', `${plural(stats.applied_total, 'application')} in all`));
  const reply = kpi('Reply rate', 'note');
  reply.append(el('span', 'big', stats.reply_rate == null ? 'n/a' : `${Math.round(stats.reply_rate * 100)}%`), el('span', 'sub', stats.applied_total ? `${stats.replied} of ${stats.applied_total} answered` : 'No applications yet'));
  const need = kpi('Needs my action', 'warning');
  if (stats.needs_action) need.parentElement.classList.add('alert');
  need.append(el('span', 'big', String(stats.needs_action)));
  if (stats.needs_action) {
    const show = el('button', 'link', state.need ? 'Show all roles' : 'Show these');
    show.type = 'button';
    show.addEventListener('click', () => {
      state.need = !state.need;
      changed();
    });
    need.append(show);
  } else {
    need.append(el('span', 'sub', 'Nothing waiting'));
  }
  const iv = kpi('Upcoming interviews', 'calendar');
  iv.append(el('span', 'big', String(stats.upcoming_interviews.length)));
  if (stats.upcoming_interviews.length) {
    const list = el('ul');
    for (const i of stats.upcoming_interviews.slice(0, 2)) {
      const item = el('li');
      const open = el('button', 'link', `${fmtDateTime(i.starts_at, i.tz)} · ${i.company}${i.stage ? `, ${i.stage}` : ''}`);
      open.type = 'button';
      open.addEventListener('click', () => openRole(i.role_id, null));
      item.append(open);
      list.append(item);
    }
    iv.append(list);
  } else {
    iv.append(el('span', 'sub', 'None booked'));
  }
  statsEl.replaceChildren(chips, kpis);
}

function fillSelect(select, any, values, current) {
  const options = [['', any], ...[...new Set(values)].sort((a, b) => a.localeCompare(b)).map((v) => [v, v])];
  // A value from the URL that no role has still shows, so the filter is visible and can be cleared.
  if (current && !options.some(([v]) => v === current)) options.push([current, current]);
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const o = el('option', '', label);
      o.value = value;
      return o;
    }),
  );
  select.value = current;
}

function renderControls() {
  const status = $('f-status');
  fillSelect(status, 'All statuses', ALL_STATUSES, state.status);
  for (const o of status.options) if (o.value) o.textContent = LABELS[o.value];
  fillSelect($('f-source'), 'All sources', view.roles.map((r) => r.source).filter(Boolean), state.source);
  fillSelect($('f-mode'), 'Any work mode', view.roles.map((r) => r.location_type).filter(Boolean), state.mode);
  syncControls();
}

// Puts the state into the controls without touching one the user is typing in.
function syncControls() {
  const set = (id, value) => {
    const node = $(id);
    if (node !== document.activeElement && node.value !== value) node.value = value;
  };
  set('f-q', state.q);
  set('f-status', state.status);
  set('f-source', state.source);
  set('f-mode', state.mode);
  set('f-smin', state.smin);
  set('f-smax', state.smax);
  $('f-need').checked = state.need;
  $('clear').hidden = !filtered();
  const active = [state.status, state.source, state.mode, state.smin, state.smax, state.need].filter(Boolean).length;
  $('filters-toggle').replaceChildren(icon(ICONS.filter), active ? `Filters (${active})` : 'Filters');
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
}

function renderContent() {
  const roles = visibleRoles();
  const onBoard = roles.filter((r) => COLUMNS.includes(r.status));
  const total = view.roles.length;
  const showing = state.view === 'board' ? onBoard.length : roles.length;
  $('count').textContent = total ? (filtered() ? `${showing} of ${total} roles` : plural(total, 'role')) : '';

  const message = !total ? 'empty' : roles.length === 0 ? 'nomatch' : state.view === 'board' && onBoard.length === 0 ? 'sweep' : null;
  boardEl.hidden = message !== null || state.view !== 'board';
  tableEl.hidden = message !== null || state.view !== 'table';
  emptyEl.hidden = message === null;
  if (message) renderEmpty(message);

  // Redrawing replaces the focused node, so remember where focus was and put it back.
  const focusedId = document.activeElement?.closest('[data-nav]')?.dataset.nav;
  if (state.view === 'board') {
    tableEl.replaceChildren();
    if (!boardEl.hidden) {
      boardEl.replaceChildren(...COLUMNS.map((s) => column(s, roles)));
      const moved = justMoved != null && boardEl.querySelector(`.card[data-id="${justMoved}"]`);
      if (moved) openNote(moved, view.roles.find((r) => r.id === justMoved));
    }
  } else {
    boardEl.replaceChildren();
    if (!tableEl.hidden) tableEl.replaceChildren(table(sorted(roles)));
  }
  markSelected();
  setRoving(focusedId != null ? Number(focusedId) : navId, focusedId != null);
}

function renderEmpty(kind) {
  const title = el('h2');
  const text = el('p');
  const action = el('button', 'primary');
  action.type = 'button';
  if (kind === 'empty') {
    title.textContent = 'Nothing tracked yet';
    text.textContent = 'Ask Claude to run a sweep (/job-tracker:sweep) and the roles it finds will show up here.';
    action.hidden = true;
  } else if (kind === 'nomatch') {
    title.textContent = 'No roles match';
    text.textContent = 'Nothing fits the current search and filters.';
    action.textContent = 'Clear filters';
    action.addEventListener('click', clearFilters);
  } else {
    title.textContent = 'These roles are still in the sweep';
    text.textContent = 'Claude verifies and scores a role before it gets a lane on the board. The table lists everything.';
    action.textContent = 'Show the table';
    action.addEventListener('click', () => {
      state.view = 'table';
      changed();
    });
  }
  emptyEl.replaceChildren(title, text, action);
}

function column(status, roles) {
  const here = roles.filter((r) => r.status === status);
  const col = dotted(el('section', 'col'), status);
  col.dataset.status = status;
  col.setAttribute('aria-label', LABELS[status]);
  const head = el('h2');
  if (FOLDED.has(status)) {
    col.classList.toggle('folded', !expanded.has(status));
    const toggle = el('button', 'fold', `${LABELS[status]} · ${here.length}`);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded.has(status)));
    // Flip in place rather than render: a redraw would throw away an open move form.
    toggle.addEventListener('click', () => {
      const open = !expanded.has(status);
      if (open) expanded.add(status);
      else expanded.delete(status);
      col.classList.toggle('folded', !open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    head.append(toggle);
  } else {
    // Without a label the heading reads as "Found3".
    head.setAttribute('aria-label', `${LABELS[status]}, ${plural(here.length, 'role')}`);
    head.append(el('span', '', LABELS[status]), el('span', '', String(here.length)));
  }
  const list = el('div', 'cards');
  for (const role of here) list.append(card(role));
  if (!here.length) list.append(el('p', 'none', filtered() ? 'No matches' : 'Nothing here'));
  col.append(head, list);
  return col;
}

function postingLink(role) {
  const href = safeHref(role.url);
  if (!href) return null;
  const a = link(href, '', 'posting');
  a.title = 'Open the posting';
  a.setAttribute('aria-label', `${role.company} posting (opens in a new tab)`);
  a.append(externalIcon());
  return a;
}

function card(role) {
  const node = el('article', 'card');
  node.dataset.id = role.id;
  node.dataset.nav = role.id;
  node.tabIndex = -1;
  node.setAttribute('aria-label', `${role.company}, ${role.title}. Enter opens the details.`);
  const head = el('div', 'head');
  head.append(el('span', 'company', role.company));
  const posting = postingLink(role);
  if (posting) head.append(posting);
  node.append(head, el('div', 'title', role.title));
  const band = pay(role);
  if (band) node.append(el('div', 'pay', band));
  const meta = [role.score != null ? `Score ${role.score}` : '', role.location_type || '', role.source || '', age(role.last_event)].filter(Boolean).join(' · ');
  if (meta) node.append(el('div', 'meta', meta));
  if (role.next_interview) node.append(withIcon(el('div', 'when'), 'calendar', `Interview ${fmtDateTime(role.next_interview)}`));
  for (const need of role.needs) node.append(withIcon(el('div', 'needs'), 'warning', need.kind === 'question' ? `Needs you: ${need.text}` : need.text));
  node.addEventListener('click', (e) => {
    // A drag ends with a click on the same card; a link or form inside has its own job.
    if (e.target.closest('a, button, input, textarea, select, form') || performance.now() - lastDragEnd < 80) return;
    openRole(role.id, node);
  });
  node.addEventListener('keydown', (e) => {
    if (e.target === node && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openRole(role.id, node);
    }
  });
  if (role.moves.length) {
    node.classList.add('draggable');
    node.addEventListener('pointerdown', (e) => startDrag(e, node, role));
  }
  return node;
}

function table(roles) {
  const t = el('table');
  const caption = el('caption', 'sr', 'Roles. Sort with the column buttons.');
  const head = el('thead');
  const row = el('tr');
  for (const [key, def] of Object.entries(SORTS)) {
    const th = el('th', [def.cls, def.num ? 'num' : ''].filter(Boolean).join(' '));
    th.scope = 'col';
    if (state.sort === key) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
    const button = el('button', 'sort', def.label);
    button.type = 'button';
    if (state.sort === key) button.append(icon(state.dir === 'asc' ? ICONS.up : ICONS.down));
    button.addEventListener('click', () => {
      // Text starts A to Z, numbers and dates start with the biggest or newest.
      state.dir = state.sort === key ? (state.dir === 'asc' ? 'desc' : 'asc') : def.text ? 'asc' : 'desc';
      state.sort = key;
      changed();
    });
    th.append(button);
    row.append(th);
  }
  head.append(row);
  const body = el('tbody');
  for (const role of roles) body.append(tableRow(role));
  t.append(caption, head, body);
  return t;
}

function tableRow(role) {
  const tr = el('tr');
  tr.dataset.id = role.id;
  const cell = (key, content, className = '') => {
    const td = el('td', [SORTS[key]?.cls, className, SORTS[key]?.num ? 'num' : ''].filter(Boolean).join(' '));
    if (typeof content === 'string') td.textContent = content;
    else td.append(content);
    return td;
  };
  const name = el('button', 'row-open', role.company);
  name.type = 'button';
  name.dataset.nav = role.id;
  name.setAttribute('aria-label', `${role.company}, ${role.title}: open details`);
  name.addEventListener('click', () => openRole(role.id, name));
  const company = cell('company', name, 'company-cell');
  if (role.needs.length) {
    const flag = el('span', 'flag', 'Needs you');
    flag.title = role.needs.map((n) => n.text).join('\n');
    company.append(flag);
  }
  // On a phone the role sits under the company instead of in a column of its own.
  company.append(el('div', 'stack-title', role.title));
  const status = dotted(el('span', 'pill', LABELS[role.status]), role.status);
  tr.append(company, cell('title', role.title), cell('status', status), cell('score', role.score != null ? String(role.score) : ''), cell('mode', role.location_type || '', 'muted'), cell('source', role.source || '', 'muted'), cell('pay', pay(role), 'muted'), cell('applied', role.applied_at ? fmtDate(role.applied_at) : '', 'muted'), cell('updated', age(role.last_event), 'muted'));
  tr.addEventListener('click', (e) => {
    if (!e.target.closest('button, a')) openRole(role.id, name);
  });
  return tr;
}

// Re-renders after a state change from a control: the hash, the controls and the lists.
function changed() {
  writeHash();
  if (!view) return;
  closeForms();
  renderAll();
}

function clearFilters() {
  Object.assign(state, { q: '', status: '', source: '', mode: '', smin: '', smax: '', need: false });
  syncControls();
  changed();
}

// ---------- keyboard: / to search, arrows between items, Enter to open, Esc to close ----------

const navItems = () => [...document.querySelectorAll(state.view === 'board' ? '#board [data-nav]' : '#table-wrap [data-nav]')];

function setRoving(id, focus) {
  const items = navItems();
  const target = items.find((n) => Number(n.dataset.nav) === id) ?? items[0];
  for (const n of items) n.tabIndex = n === target ? 0 : -1;
  navId = target ? Number(target.dataset.nav) : null;
  if (focus && target) target.focus({ preventScroll: true });
}

function neighbour(from, key) {
  if (state.view === 'table') {
    const items = navItems();
    const i = items.indexOf(from);
    return key === 'ArrowDown' ? items[i + 1] : key === 'ArrowUp' ? items[i - 1] : undefined;
  }
  const cols = [...boardEl.querySelectorAll('.col:not(.folded)')].map((c) => [...c.querySelectorAll('[data-nav]')]);
  const ci = cols.findIndex((c) => c.includes(from));
  if (ci < 0) return undefined;
  const ri = cols[ci].indexOf(from);
  if (key === 'ArrowDown') return cols[ci][ri + 1];
  if (key === 'ArrowUp') return cols[ci][ri - 1];
  const step = key === 'ArrowRight' ? 1 : -1;
  for (let c = ci + step; c >= 0 && c < cols.length; c += step) if (cols[c].length) return cols[c][Math.min(ri, cols[c].length - 1)];
  return undefined;
}

function focusItem(node) {
  setRoving(Number(node.dataset.nav), true);
  node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const typing = (node) => node instanceof HTMLElement && (node.matches('input, textarea, select') || node.isContentEditable);

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const active = document.activeElement;
  if (e.key === '/' && !typing(active)) {
    e.preventDefault();
    $('f-q').focus();
    $('f-q').select();
  } else if (e.key === 'Escape') {
    if (active === $('f-q') && $('f-q').value) {
      $('f-q').value = '';
      state.q = '';
      changed();
    } else if (typing(active) && (active.closest('#toolbar') || drawerDirty())) active.blur();
    else if (!drawerEl.hidden) closeRole();
  } else if (e.key.startsWith('Arrow') && !typing(active) && !dragging) {
    const from = active?.closest?.('[data-nav]');
    if (from) {
      const next = neighbour(from, e.key);
      if (next) {
        e.preventDefault();
        focusItem(next);
      }
    } else if (active === document.body || active === $('content')) {
      const first = navItems().find((n) => Number(n.dataset.nav) === navId) ?? navItems()[0];
      if (first) {
        e.preventDefault();
        focusItem(first);
      }
    }
  }
});

document.addEventListener('focusin', (e) => {
  const item = e.target.closest?.('[data-nav]');
  if (item) setRoving(Number(item.dataset.nav), false);
});

// ---------- drag and drop (mouse and pen; touch uses the drawer's Move form so panning still scrolls) ----------

// Closes any open form; a pending card goes back where it came from.
function closeForms() {
  document.querySelector('#board form')?.remove();
  if (!pending) return;
  pending.node.classList.remove('pending');
  if (pending.parent.isConnected) pending.parent.insertBefore(pending.node, pending.next);
  pending = null;
}

// Pointer events: the card follows the pointer as a fixed "ghost"; only legal columns light up.
function startDrag(e, node, role) {
  if (!e.isPrimary || dragging || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('a, button, input, textarea, select, form')) return;
  if (pending?.node === node) return;
  // A new drag abandons an open form rather than being silently ignored.
  closeForms();
  const allowed = new Set(role.moves);
  const rect = node.getBoundingClientRect();
  const dx = e.clientX - rect.left;
  const dy = e.clientY - rect.top;
  let ghost = null;
  node.setPointerCapture(e.pointerId);
  const columns = () => [...boardEl.querySelectorAll('.col')];
  // The legal column under the pointer gets a slot the card's size, so the drop target is unambiguous.
  const slot = el('div', 'slot');
  let over = null;
  const hover = (x, y) => {
    const col = document.elementFromPoint(x, y)?.closest('.col');
    const next = col && allowed.has(col.dataset.status) ? col : null;
    if (next === over) return;
    over?.classList.remove('over');
    slot.remove();
    over = next;
    if (!over) return;
    over.classList.add('over');
    slot.style.height = `${rect.height}px`;
    over.querySelector('.cards')?.append(slot);
  };

  const onMove = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      dragging = true;
      ghost = node.cloneNode(true);
      ghost.removeAttribute('tabindex');
      ghost.removeAttribute('data-nav');
      ghost.classList.add('ghost');
      ghost.style.width = `${rect.width}px`;
      document.body.append(ghost);
      node.classList.add('dragging');
      for (const col of columns()) {
        const ok = allowed.has(col.dataset.status);
        col.classList.toggle('target', ok);
        col.classList.toggle('dim', !ok && col.dataset.status !== role.status);
      }
    }
    ghost.style.left = `${ev.clientX - dx}px`;
    ghost.style.top = `${ev.clientY - dy}px`;
    hover(ev.clientX, ev.clientY);
    // Nudge the board sideways near its edges so far columns can be reached.
    const edge = boardEl.getBoundingClientRect();
    if (ev.clientX < edge.left + 40) boardEl.scrollLeft -= 16;
    else if (ev.clientX > edge.right - 40) boardEl.scrollLeft += 16;
  };
  const end = (drop) => {
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerup', onUp);
    node.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onKey);
    if (!ghost) return;
    dragging = false;
    lastDragEnd = performance.now();
    ghost.remove();
    node.classList.remove('dragging');
    const to = drop ? over?.dataset.status : null;
    slot.remove();
    for (const col of columns()) col.classList.remove('target', 'dim', 'over');
    if (!to || !allowed.has(to)) return;
    if (NEEDS_FORM.has(to)) openForm(node, role, to);
    else quickMove(node, role, to);
  };
  const onUp = () => end(true);
  const onCancel = () => end(false);
  const onKey = (ev) => {
    if (ev.key === 'Escape') end(false);
  };
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
  node.addEventListener('pointercancel', onCancel);
  document.addEventListener('keydown', onKey);
}

function labelled(text, control) {
  const label = el('label', '', text);
  label.append(control);
  return label;
}

function option(value, text) {
  const node = el('option', '', text);
  node.value = value;
  return node;
}

// closed is the one move the board can't default: transition needs the outcome. The server checks it again.
function outcomeSelect() {
  const outcome = el('select');
  outcome.name = 'outcome';
  outcome.append(...OUTCOMES.map((o) => option(o, o.replace('_', ' '))));
  return outcome;
}

function showError(node, message) {
  node.querySelector(':scope > .error')?.remove();
  const error = el('p', 'error', message);
  error.setAttribute('role', 'alert');
  node.append(error);
}

// A drop moves at once; the server records the default reason, and the card opens with a field for the user's own.
async function quickMove(node, role, to) {
  closeForms();
  justMoved = null;
  try {
    await api('/api/move', { role_id: role.id, to });
    justMoved = role.id;
    // A folded lane opens, so the card and its reason field can be seen where it landed.
    if (FOLDED.has(to)) expanded.add(to);
    await refresh();
  } catch (err) {
    showError(node, err.message);
  }
}

// The user's own reason for the move just made, saved as a note next to the default one. Optional: Skip,
// Escape or an empty Save keeps the default.
function openNote(node, role) {
  closeForms();
  const form = el('form', 'note');
  const reason = el('input');
  reason.name = 'reason';
  reason.placeholder = 'Why did you move it?';
  reason.setAttribute('aria-label', `Reason for moving ${role.company} (optional)`);
  const error = el('p', 'error');
  error.setAttribute('role', 'alert');
  const save = el('button', 'primary', 'Save');
  save.type = 'submit';
  const skip = el('button', '', 'Skip');
  skip.type = 'button';
  const buttons = el('div', 'buttons');
  buttons.append(save, skip);
  const done = () => {
    justMoved = null;
    form.remove();
  };
  skip.addEventListener('click', done);
  form.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      done();
    }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = reason.value.trim();
    if (!text) return done();
    save.disabled = true;
    error.textContent = '';
    try {
      await api('/api/note', { role_id: role.id, reason: text });
      done();
      await refresh();
    } catch (err) {
      error.textContent = err.message;
      save.disabled = false;
    }
  });
  form.append(reason, error, buttons);
  node.append(form);
  node.scrollIntoView({ block: 'nearest' });
  reason.focus({ preventScroll: true });
}

// A drop on closed waits in the lane with this form: the outcome, and an optional reason (left empty, the
// server records the board's default). The card moves only after the server accepts.
function openForm(node, role, to) {
  justMoved = null;
  closeForms();
  placePending(node, to);
  const form = el('form', 'move');
  const reason = el('input');
  reason.name = 'reason';
  reason.placeholder = 'Why? (optional)';
  reason.setAttribute('aria-label', 'Reason (optional)');
  const outcome = outcomeSelect();
  const error = el('p', 'error');
  error.setAttribute('role', 'alert');
  const save = el('button', 'primary', 'Move');
  save.type = 'submit';
  const cancel = el('button', '', 'Cancel');
  cancel.type = 'button';
  const buttons = el('div', 'buttons');
  buttons.append(save, cancel);
  cancel.addEventListener('click', closeForms);
  form.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeForms();
    }
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    save.disabled = true;
    error.textContent = '';
    try {
      await api('/api/move', { role_id: role.id, to, reason: reason.value.trim() || undefined, outcome: outcome.value });
      pending = null; // the redraw puts every card where the server says it is
      form.remove();
      await refresh();
    } catch (err) {
      error.textContent = err.message;
      save.disabled = false;
    }
  });
  form.append(el('div', 'form-title', `Move to ${LABELS[to]}`), labelled('Outcome', outcome), reason, error, buttons);
  node.append(form);
  node.scrollIntoView({ block: 'nearest' });
  outcome.focus({ preventScroll: true });
}

// Shows the dropped card at the top of the column it was dropped on, unfolding that column if needed.
function placePending(node, to) {
  const col = boardEl.querySelector(`.col[data-status="${to}"]`);
  if (!col) return;
  if (col.classList.contains('folded')) col.querySelector('button.fold')?.click();
  pending = { node, parent: node.parentElement, next: node.nextSibling };
  node.classList.add('pending');
  col.querySelector('.cards').prepend(node);
}

// ---------- the role drawer ----------

function markSelected() {
  for (const n of document.querySelectorAll('.card.selected, tr.selected')) n.classList.remove('selected');
  if (state.role == null) return;
  for (const n of document.querySelectorAll(`.card[data-id="${state.role}"], tr[data-id="${state.role}"]`)) n.classList.add('selected');
}

const drawerDirty = () => {
  if (drawerEl.hidden) return false;
  const active = document.activeElement;
  if (drawerEl.contains(active) && typing(active)) return true;
  return [...drawerEl.querySelectorAll('form input[name="reason"]')].some((i) => i.value !== '');
};

function openRole(id, from) {
  opener = from ?? opener;
  state.role = id;
  writeHash();
  markSelected();
  drawerEl.hidden = false;
  scrimEl.hidden = false;
  document.body.classList.add('drawer-open');
  drawerEl.replaceChildren(el('p', 'empty-line', 'Loading…'));
  loadRole(id, { focus: true });
}

function closeRole() {
  state.role = null;
  drawerSeq++;
  writeHash();
  markSelected();
  drawerEl.hidden = true;
  scrimEl.hidden = true;
  document.body.classList.remove('drawer-open');
  drawerEl.replaceChildren();
  const back = opener?.isConnected ? opener : document.querySelector(`[data-nav="${navId}"]`);
  back?.focus({ preventScroll: true });
  opener = null;
}

async function loadRole(id, { focus = false, quiet = false } = {}) {
  const seq = ++drawerSeq;
  try {
    const data = await api(`/api/role/${id}`);
    if (seq !== drawerSeq) return;
    // A duplicate's id shows its canonical role; keep the URL pointing at what is on screen.
    if (data.id !== state.role) {
      state.role = data.id;
      writeHash();
      markSelected();
    }
    renderDrawer(data);
    drawerEl.hidden = false;
    scrimEl.hidden = false;
    document.body.classList.add('drawer-open');
    if (focus) $('drawer-title').focus({ preventScroll: true });
  } catch (err) {
    if (seq !== drawerSeq) return;
    if (err.status === 404) {
      closeRole();
      say('That role is no longer on the board.', { ms: 5000 });
    } else if (!quiet) {
      drawerEl.replaceChildren(el('p', 'error', err.message));
    } else {
      say(err.message, { error: true });
    }
  }
}

function section(title) {
  const s = el('section', 'd-section');
  s.append(el('h3', '', title));
  return s;
}

function renderDrawer(d) {
  const { role } = d;
  const head = el('div', 'd-head');
  const names = el('div');
  const h2 = el('h2', 'd-name', d.company?.name ?? 'Unknown company');
  h2.id = 'drawer-title';
  h2.tabIndex = -1;
  names.append(h2, el('p', 'd-title', role.title));
  const close = el('button', 'd-close');
  close.append(icon(ICONS.close));
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  close.addEventListener('click', closeRole);
  head.append(names, close);

  const sub = el('div', 'd-sub');
  sub.append(dotted(el('span', 'pill', LABELS[role.status] ?? role.status), role.status));
  if (role.score != null) sub.append(el('span', '', `Score ${role.score}`));
  const posting = safeHref(role.url);
  if (posting) {
    const a = link(posting, 'Open the posting', 'ext');
    a.append(' ', externalIcon());
    sub.append(a);
  }

  const parts = [head, sub];
  if (d.needs.length) {
    const s = section('Needs your action');
    s.classList.add('urgent');
    for (const n of d.needs) s.append(withIcon(el('div', 'needs'), 'warning', n.text));
    parts.push(s);
  }
  parts.push(actions(d), details(d), interviews(d), timeline(d), artifacts(d));
  const extra = links(d);
  if (extra) parts.push(extra);
  drawerEl.replaceChildren(...parts);
}

function fact(list, label, value) {
  if (value == null || value === '') return;
  const dd = el('dd');
  if (typeof value === 'string') dd.textContent = value;
  else dd.append(value);
  list.append(el('dt', '', label), dd);
}

function details(d) {
  const { role } = d;
  const s = section('Details');
  const list = el('dl', 'facts');
  fact(list, 'Pay', pay(role));
  fact(list, 'Equity', role.equity);
  const line = role.location_line || '';
  fact(list, 'Location', [line, role.location_type && !line.toLowerCase().includes(role.location_type.toLowerCase()) && `(${role.location_type})`].filter(Boolean).join(' '));
  fact(list, 'Stack', role.stack);
  fact(list, 'Industry', role.industry);
  fact(list, 'Source', [role.source, role.ats && `via ${role.ats}`].filter(Boolean).join(' '));
  fact(list, 'Posted', role.posted_at && fmtDate(role.posted_at));
  fact(list, 'First seen', role.first_seen && fmtDate(role.first_seen));
  fact(list, 'Verified', role.verified_at ? fmtDate(role.verified_at) : 'Not yet');
  fact(list, 'Last change', role.updated_at && `${fmtDate(role.updated_at)} (${age(role.updated_at)})`);
  fact(list, 'Company site', d.company?.domain);
  s.append(list);
  if (role.score_notes) s.append(el('p', 'note-box', role.score_notes));
  if (d.company?.no_cold_apply) s.append(withIcon(el('p', 'needs'), 'warning', `No cold applications here${d.company.no_cold_apply_reason ? `: ${d.company.no_cold_apply_reason}` : ''}`));
  if (d.company?.notes) s.append(el('p', 'note-box', d.company.notes));
  return s;
}

// Moves and notes from the drawer go through the same endpoints as a drop, so the same rules apply, and they work
// from the keyboard and on a phone, where touch can't drag.
function actions(d) {
  const s = section('Move or note');
  if (d.moves.length) {
    const form = el('form', 'drawer-form');
    const to = el('select');
    to.name = 'to';
    to.append(...d.moves.map((m) => option(m, LABELS[m])));
    const outcome = outcomeSelect();
    const outcomeLabel = labelled('Outcome', outcome);
    outcomeLabel.hidden = true;
    to.addEventListener('change', () => {
      outcomeLabel.hidden = !NEEDS_FORM.has(to.value);
    });
    const reason = el('input');
    reason.name = 'reason';
    reason.placeholder = 'Why? (optional)';
    const go = withIcon(el('button', 'primary'), 'move', 'Move');
    go.type = 'submit';
    const error = el('p', 'error');
    error.setAttribute('role', 'alert');
    form.append(labelled('Move to', to), outcomeLabel, Object.assign(labelled('Reason', reason), { className: 'wide' }), go, error);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      go.disabled = true;
      error.textContent = '';
      try {
        await api('/api/move', { role_id: d.id, to: to.value, reason: reason.value.trim() || undefined, outcome: NEEDS_FORM.has(to.value) ? outcome.value : undefined });
        say(`Moved to ${LABELS[to.value]}.`, { ms: 4000 });
        if (FOLDED.has(to.value)) expanded.add(to.value);
        await refresh();
        await loadRole(d.id);
      } catch (err) {
        error.textContent = err.message;
        go.disabled = false;
      }
    });
    s.append(form);
  } else {
    s.append(el('p', 'empty-line', 'Claude is still verifying and scoring this role, so it cannot be moved yet.'));
  }
  const note = el('form', 'drawer-form');
  const text = el('input');
  text.name = 'reason';
  text.placeholder = 'Add a note to the timeline';
  const add = withIcon(el('button'), 'note', 'Add note');
  add.type = 'submit';
  const error = el('p', 'error');
  error.setAttribute('role', 'alert');
  note.append(Object.assign(labelled('Note', text), { className: 'wide' }), add, error);
  note.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!text.value.trim()) return;
    add.disabled = true;
    error.textContent = '';
    try {
      await api('/api/note', { role_id: d.id, reason: text.value.trim() });
      await refresh();
      await loadRole(d.id);
    } catch (err) {
      error.textContent = err.message;
      add.disabled = false;
    }
  });
  s.append(note);
  return s;
}

function interviews(d) {
  const s = section('Interviews');
  if (!d.interviews.length) {
    s.append(el('p', 'empty-line', 'No interviews recorded.'));
    return s;
  }
  const list = el('ul', 'list');
  for (const i of d.interviews) {
    const item = el('li', 'item');
    const row = el('div', 'row');
    row.append(icon(ICONS.calendar), el('span', 'strong', i.stage || 'Interview'), el('span', `tag${i.state === 'scheduled' ? ' ok' : i.state === 'cancelled' ? ' bad' : ''}`, i.state));
    item.append(row);
    if (i.starts_at) item.append(el('div', '', fmtDateTime(i.starts_at, i.tz)));
    else if (i.state === 'pending') item.append(el('div', 'small', 'Time not booked yet'));
    if (i.people) item.append(el('div', 'small', `With ${i.people}`));
    if (i.booked_by) item.append(el('div', 'small', `Booked by ${i.booked_by}`));
    const href = safeHref(i.link);
    if (href) item.append(link(href, i.link.length > 60 ? `${i.link.slice(0, 57)}…` : i.link));
    else if (i.link) item.append(el('div', 'small', i.link));
    if (i.notes) item.append(el('div', 'small', i.notes));
    list.append(item);
  }
  s.append(list);
  return s;
}

const CATEGORIES = { interview_changed: 'Interview update' };

function timeline(d) {
  const s = section('Timeline');
  if (!d.events.length) {
    s.append(el('p', 'empty-line', 'Nothing recorded yet.'));
    return s;
  }
  const list = el('ol', 'timeline');
  for (const e of d.events) {
    const item = el('li');
    if (e.status) dotted(item, e.status);
    const what = el('div', 'what');
    const label = e.status ? `${LABELS[e.status] ?? e.status}${e.outcome ? ` (${e.outcome.replace('_', ' ')})` : ''}` : (CATEGORIES[e.category] ?? e.category ?? 'Note');
    what.append(el('b', '', label), el('span', 'small', `${e.actor} · ${fmtDate(e.ts)}${e.ts ? ` · ${age(e.ts)}` : ''}`));
    item.append(what, el('p', 'why', e.reason));
    if (e.question) item.append(el('p', 'why', `Question: ${e.question}`));
    if (e.evidence) item.append(el('blockquote', '', e.evidence));
    list.append(item);
  }
  s.append(list);
  return s;
}

const KINDS = { cover_note: 'Cover note', cover_letter_pdf: 'Cover letter PDF', gmail_draft: 'Gmail draft', form_answers: 'Form answers', confirmation: 'Confirmation', note: 'Note' };

function artifacts(d) {
  const s = section('Artifacts');
  if (!d.artifacts.length) {
    s.append(el('p', 'empty-line', 'No cover notes, drafts or confirmations saved.'));
    return s;
  }
  const list = el('ul', 'list');
  for (const a of d.artifacts) {
    const item = el('li', 'item');
    const row = el('div', 'row');
    row.append(icon(ICONS.note), el('span', 'strong', KINDS[a.kind] ?? a.kind), el('span', 'small', fmtDate(a.created_at)));
    if (a.verified) row.append(withIcon(el('span', 'tag ok'), 'check', 'verified'));
    else if (a.kind === 'gmail_draft') row.append(el('span', 'tag', 'unverified'));
    if (a.lint_errors) row.append(el('span', 'tag bad', plural(a.lint_errors, 'style error')));
    item.append(row);
    const href = safeHref(a.ref);
    if (href) item.append(link(href, a.ref));
    else if (a.ref) item.append(el('div', 'small', a.ref));
    if (a.content) {
      const more = el('details');
      more.append(el('summary', '', 'Show the text'), el('pre', '', a.content + (a.content_truncated ? '\n…(shortened)' : '')));
      item.append(more);
    }
    list.append(item);
  }
  s.append(list);
  return s;
}

function links(d) {
  const other = d.urls.filter((u) => u.url !== d.role.url);
  if (!other.length && !d.duplicates.length) return null;
  const s = section('Other links');
  const list = el('ul', 'list');
  for (const u of other) {
    const item = el('li', 'item');
    const href = safeHref(u.url);
    item.append(href ? link(href, u.url) : el('span', '', u.url));
    if (u.evidence) item.append(el('div', 'small', u.evidence));
    list.append(item);
  }
  for (const dup of d.duplicates) {
    const item = el('li', 'item');
    item.append(el('div', 'strong', `Same posting tracked as role ${dup.role_id}`), el('div', 'small', `${dup.title}${dup.status ? ` · ${dup.status}` : ''}`));
    list.append(item);
  }
  s.append(list);
  return s;
}

// ---------- theme ----------

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : systemDark.matches);

function paintTheme() {
  const dark = isDark();
  const btn = $('theme');
  btn.setAttribute('aria-pressed', String(dark));
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  btn.replaceChildren(icon(dark ? ICONS.sun : ICONS.moon), Object.assign(el('span', 'sr'), { textContent: 'Dark mode' }));
}

function initTheme() {
  const saved = recall('localStorage', THEME_KEY);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  $('theme').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    keep('localStorage', THEME_KEY, next);
    paintTheme();
  });
  systemDark.addEventListener('change', paintTheme);
  paintTheme();
}

// ---------- start ----------

function wire() {
  const text = $('f-q');
  text.addEventListener('input', () => {
    state.q = text.value;
    changed();
  });
  const bind = (id, key) =>
    $(id).addEventListener('input', (e) => {
      state[key] = e.target.value;
      changed();
    });
  bind('f-status', 'status');
  bind('f-source', 'source');
  bind('f-mode', 'mode');
  for (const [id, key] of [['f-smin', 'smin'], ['f-smax', 'smax']]) {
    $(id).addEventListener('input', (e) => {
      state[key] = e.target.value !== '' && Number.isFinite(Number(e.target.value)) ? e.target.value : '';
      changed();
    });
  }
  $('f-need').addEventListener('change', (e) => {
    state.need = e.target.checked;
    changed();
  });
  $('clear').addEventListener('click', clearFilters);
  // Below phone width the filters fold away; the button shows how many are on.
  $('filters-toggle').addEventListener('click', () => {
    const open = $('toolbar').classList.toggle('open');
    $('filters-toggle').setAttribute('aria-expanded', String(open));
  });
  $('toolbar').addEventListener('submit', (e) => e.preventDefault());
  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      changed();
    });
  }
  scrimEl.addEventListener('click', closeRole);
  // Editing the address by hand (or following a saved link) applies without a reload.
  window.addEventListener('hashchange', () => {
    const before = state.role;
    readHash();
    if (!view) return;
    syncControls();
    renderAll();
    if (state.role !== before) {
      if (state.role == null) closeRole();
      else openRole(state.role, null);
    }
  });
}

initTheme();
wire();
readHash();
syncControls();
writeHash();
if (!token) {
  say('This link has no token. Run /job-tracker:board in Claude for a fresh link.', { error: true });
} else {
  refresh().then(() => {
    if (view && state.role != null) openRole(state.role, null);
  });
  setInterval(refresh, 30_000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}
