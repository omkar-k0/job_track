// Demo shim for the public web demo (dev/build-web.mjs). Loaded as a module before board.js, it answers the
// board's API from made-up records in fixtures.js, in memory, so the unchanged board runs as a static page.
// Moves and notes change only this tab's copy; a reload starts over. Nothing leaves the browser.
//
// The derived fields (last event, needs, moves, stats) follow board-api.ts and tracker.ts (userMoves,
// openItems, transition), so the demo shows what the real board would for the same data. Keep them in step.

import { buildFixtures } from './fixtures.js';

const STATUSES = ['found', 'verified', 'scored', 'queued', 'applied', 'interviewing', 'offer', 'dropped', 'closed'];
const BOARD_LANES = ['scored', 'queued', 'applied', 'interviewing', 'offer', 'dropped', 'closed'];
const RESEARCHED = ['scored', 'queued'];
const CLAUDE_ONLY = ['found', 'verified'];
const OUTCOMES = ['rejected', 'withdrawn', 'role_closed'];
const MOVE_KEYS = ['role_id', 'to', 'reason', 'evidence', 'outcome'];
const NOTE_KEYS = ['role_id', 'reason'];
const WEEK_MS = 7 * 864e5;
const MAX_UPCOMING = 8;

const { rules, roles } = buildFixtures(Date.now());
let nextEventId = 1;
for (const r of roles) for (const e of r.events) e.id = nextEventId++;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const max = (xs) => xs.reduce((a, b) => (a == null || b > a ? b : a), null);
const min = (xs) => xs.reduce((a, b) => (a == null || b < a ? b : a), null);

function userMoves(r) {
  if (!BOARD_LANES.includes(r.status)) return { moves: [], why: `is still in the sweep (${r.status}): Claude verifies and scores it first` };
  const researched = r.verified_at != null && r.score != null;
  return { moves: BOARD_LANES.filter((s) => s !== r.status && (researched || !RESEARCHED.includes(s))) };
}

const latest = (r) => [...r.events].sort((a, b) => (a.ts === b.ts ? b.id - a.id : a.ts < b.ts ? 1 : -1))[0];
const queuedQuestion = (r) => (r.status === 'queued' ? ([...r.events].reverse().find((e) => e.status === 'queued')?.question ?? null) : null);

function needsOf(r) {
  const needs = [];
  const q = queuedQuestion(r);
  if (q) needs.push({ kind: 'question', text: q });
  const last = latest(r);
  if (!['queued', 'dropped', 'closed'].includes(r.status) && last?.question) needs.push({ kind: 'question', text: last.question });
  if (!['closed', 'dropped'].includes(r.status)) {
    for (const i of r.interviews) if (i.state === 'pending') needs.push({ kind: 'interview_to_book', text: `Book the ${i.stage || 'next'} interview` });
  }
  for (const a of r.artifacts) if (a.kind === 'gmail_draft' && !a.verified) needs.push({ kind: 'draft_unverified', text: 'A Gmail draft is waiting to be checked' });
  return needs;
}

function upcoming(nowIso) {
  const list = [];
  for (const r of roles) {
    if (['closed', 'dropped'].includes(r.status)) continue;
    for (const i of r.interviews) if (i.state === 'scheduled' && i.starts_at && i.starts_at >= nowIso) list.push({ ...i, role_id: r.id, company: r.company.name, title: r.title });
  }
  return list.sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
}

function boardView() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const soon = upcoming(nowIso);
  const cards = roles.map((r) => {
    const replied = r.events.some((e) => e.status === 'interviewing' || e.status === 'offer' || (e.status === 'closed' && e.outcome === 'rejected'));
    return {
      id: r.id,
      company: r.company.name,
      title: r.title,
      status: r.status,
      score: r.score,
      location_type: r.location_type,
      location_line: r.location_line,
      source: r.source,
      stack: r.stack,
      industry: r.industry,
      url: r.url,
      comp_min: r.comp_min,
      comp_max: r.comp_max,
      comp_currency: r.comp_currency,
      comp_period: r.comp_period,
      first_seen: r.first_seen,
      last_event: max(r.events.map((e) => e.ts)),
      applied_at: min(r.events.filter((e) => e.status === 'applied').map((e) => e.ts)),
      replied,
      question: queuedQuestion(r),
      next_interview: soon.find((i) => i.role_id === r.id)?.starts_at ?? null,
      needs: needsOf(r),
      moves: userMoves(r).moves,
    };
  });
  // Same order as the real query: score high to low (no score last), then most recently updated.
  const byUpdate = new Map(roles.map((r) => [r.id, r.updated_at || '']));
  cards.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || (byUpdate.get(b.id) < byUpdate.get(a.id) ? -1 : 1));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, cards.filter((r) => r.status === s).length]));
  const applied = cards.filter((r) => r.applied_at != null || r.status === 'interviewing' || r.status === 'offer' || (r.replied && r.status !== 'closed'));
  const replied = applied.filter((r) => r.replied).length;
  const since = new Date(nowMs - WEEK_MS).toISOString();
  const stats = {
    counts,
    applied_this_week: cards.filter((r) => r.applied_at != null && r.applied_at >= since).length,
    applied_total: applied.length,
    replied,
    reply_rate: applied.length ? replied / applied.length : null,
    needs_action: cards.filter((r) => r.needs.length > 0).length,
    upcoming_interviews: soon.slice(0, MAX_UPCOMING).map((i) => ({ id: i.id, role_id: i.role_id, company: i.company, title: i.title, stage: i.stage, starts_at: i.starts_at, tz: i.tz })),
  };
  return { statuses: STATUSES, roles: cards, rules, stats };
}

function find(id) {
  const r = roles.find((x) => x.id === id);
  if (!r) throw new ApiError(404, `No role ${id}`);
  return r;
}

function boardRole(id) {
  const r = find(id);
  const { company, interviews, artifacts, urls, duplicates } = r;
  const events = [...r.events].sort((a, b) => (a.ts === b.ts ? b.id - a.id : a.ts < b.ts ? 1 : -1));
  return {
    id: r.id,
    requested_role_id: id,
    company: { id: r.id, ...company },
    role: {
      title: r.title,
      status: r.status,
      url: r.url,
      ats: r.ats,
      score: r.score,
      score_notes: r.score_notes,
      location_line: r.location_line,
      location_type: r.location_type,
      comp_min: r.comp_min,
      comp_max: r.comp_max,
      comp_currency: r.comp_currency,
      comp_period: r.comp_period,
      equity: r.equity,
      stack: r.stack,
      industry: r.industry,
      source: r.source,
      first_seen: r.first_seen,
      posted_at: r.posted_at,
      verified_at: r.verified_at,
      updated_at: r.updated_at,
    },
    moves: userMoves(r).moves,
    question: queuedQuestion(r),
    needs: needsOf(r),
    events: events.map(({ id: eid, ts, status, outcome, category, question, blocked_by, actor, reason, evidence }) => ({ id: eid, ts, status, outcome, category, question, blocked_by, actor, reason, evidence })),
    interviews,
    artifacts,
    urls,
    duplicates,
  };
}

function checkBody(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, `Send a JSON object with: ${keys.join(', ')}.`);
  const extra = Object.keys(body).filter((k) => !keys.includes(k));
  if (extra.length) throw new ApiError(400, `Unknown field: ${extra.join(', ')}. Allowed: ${keys.join(', ')}.`);
  if (!Number.isInteger(body.role_id)) throw new ApiError(400, 'role_id must be an integer.');
  for (const k of keys) if (k !== 'role_id' && body[k] !== undefined && typeof body[k] !== 'string') throw new ApiError(400, `${k} must be a string.`);
  return body;
}

function addEvent(r, event) {
  const e = { id: nextEventId++, ts: new Date().toISOString(), status: null, outcome: null, category: null, question: null, blocked_by: null, actor: 'user', evidence: null, ...event };
  r.events.push(e);
  r.updated_at = e.ts;
  return e;
}

function boardMove(input) {
  const body = checkBody(input, MOVE_KEYS);
  const { role_id, to } = body;
  if (!STATUSES.includes(to)) throw new ApiError(400, `to must be one of: ${STATUSES.join(', ')}`);
  if (CLAUDE_ONLY.includes(to)) throw new ApiError(400, `Moving to ${to} needs Claude: run a sweep, or ask Claude to verify role ${role_id}.`);
  const r = find(role_id);
  if (r.status === to) throw new ApiError(400, `Role ${role_id} is already ${to}.`);
  const { moves, why } = userMoves(r);
  if (why) throw new ApiError(400, `Role ${role_id} ${why}.`);
  if (!moves.includes(to)) throw new ApiError(400, `Role ${role_id} needs Claude to verify and score it before it can be ${to}.`);
  if (to === 'closed' && !OUTCOMES.includes(body.outcome)) throw new ApiError(400, `closed needs outcome: ${OUTCOMES.join(' | ')}`);
  const from = r.status;
  addEvent(r, { status: to, outcome: to === 'closed' ? body.outcome : null, reason: body.reason?.trim() || 'Moved on the board', evidence: body.evidence?.trim() || null });
  r.status = to;
  return { role: { id: r.id, status: r.status, updated_at: r.updated_at }, from, to };
}

function boardNote(input) {
  const body = checkBody(input, NOTE_KEYS);
  const r = find(body.role_id);
  const reason = body.reason?.trim() ?? '';
  if (!reason) throw new ApiError(400, 'reason is required');
  const e = addEvent(r, { reason });
  return { role: { id: r.id, status: r.status }, event_id: e.id, duplicate: false, status_applied: false };
}

function route(method, path, body) {
  if (method === 'GET' && path === '/api/health') return { ok: true };
  if (method === 'GET' && path === '/api/board') return boardView();
  const role = method === 'GET' ? /^\/api\/role\/(\d{1,12})$/.exec(path) : null;
  if (role) return boardRole(Number(role[1]));
  if (method === 'POST' && path === '/api/move') return boardMove(body);
  if (method === 'POST' && path === '/api/note') return boardNote(body);
  throw new ApiError(404, 'Not found.');
}

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);

window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
  // The real server wants the per-start token as a bearer header; the demo token is fixed.
  const auth = new Headers(init.headers).get('Authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return json(401, { error: 'Missing or wrong token.' });
  try {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    return json(200, route((init.method || 'GET').toUpperCase(), url.pathname, body));
  } catch (err) {
    if (err instanceof ApiError) return json(err.status, { error: err.message });
    if (err instanceof SyntaxError) return json(400, { error: 'The body is not valid JSON.' });
    throw err;
  }
};

// board.js takes its token from the link's #t= (then keeps it in sessionStorage and drops it from the
// address bar). A demo visitor has no link from Claude, so hand it one before board.js reads the hash.
try {
  if (!sessionStorage.getItem('laufbahn-board-token')) throw new Error('no token yet');
} catch {
  const hash = location.hash.slice(1);
  if (!new URLSearchParams(hash).has('t')) history.replaceState(null, '', `${location.pathname}${location.search}#${hash ? `${hash}&` : ''}t=demo`);
}
