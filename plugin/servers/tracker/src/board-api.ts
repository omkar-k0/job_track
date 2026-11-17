// What the board page reads and the one write it makes. board-server.ts calls these; the MCP server does not.

import { ToolError } from './errors.ts';
import type { Status, Tracker } from './tracker.ts';
import { groupOf, isCard, STATUSES, userMoves } from './tracker.ts';
import { isRecord, oneOf } from './util.ts';

// These steps need research with evidence (the verify-employer skill), so a drag can't do them.
const CLAUDE_ONLY: readonly Status[] = ['found', 'verified'];
const MOVE_KEYS: readonly string[] = ['role_id', 'to', 'reason', 'evidence', 'outcome'];
const NOTE_KEYS: readonly string[] = ['role_id', 'reason'];
// A drag is a decision in itself, so the board doesn't ask why; the user can add their own reason as a note.
const DEFAULT_REASON = 'Moved on the board';

// A card's open items for the "needs my action" filter: what the user, not Claude, has to do next.
export interface Need {
  kind: 'question' | 'interview_to_book' | 'draft_unverified';
  text: string;
}

export interface BoardRole {
  id: number;
  company: string;
  title: string;
  status: Status;
  score: number | null;
  location_type: string | null;
  location_line: string | null;
  source: string | null;
  stack: string | null;
  industry: string | null;
  url: string | null;
  comp_min: number | null;
  comp_max: number | null;
  comp_currency: string | null;
  comp_period: string | null;
  first_seen: string | null;
  last_event: string | null;
  // First time the card's group was marked applied; null if never.
  applied_at: string | null;
  // The employer answered after an application: an interview, an offer or a rejection.
  replied: boolean;
  next_interview: string | null;
  question: string | null;
  needs: Need[];
}

const WEEK_MS = 7 * 864e5;
const MAX_UPCOMING = 8;
// Artifact bodies (cover notes, form answers) can be long; the drawer shows the start and says so.
const MAX_ARTIFACT_CHARS = 4000;

export class BoardNotFound extends Error {}

// Open items per card id, read through the tracker's own openItems so the board and the summary agree.
function needsByCard(t: Tracker): Map<number, Need[]> {
  const items = t.openItems();
  const byCard = new Map<number, Need[]>();
  const add = (id: number, need: Need) => {
    const list = byCard.get(id);
    if (list) list.push(need);
    else byCard.set(id, [need]);
  };
  for (const q of [...items.queue, ...items.stale_queue]) if (q.question) add(q.id, { kind: 'question', text: q.question });
  for (const q of items.questions) add(q.id, { kind: 'question', text: q.question });
  for (const i of items.interviews_to_book) add(t.canonicalRoleId(i.role_id), { kind: 'interview_to_book', text: `Book the ${i.stage || 'next'} interview` });
  for (const d of items.unverified_drafts) if (d.role_id != null) add(t.canonicalRoleId(d.role_id), { kind: 'draft_unverified', text: 'A Gmail draft is waiting to be checked' });
  return byCard;
}

export function boardView(t: Tracker, nowMs = Date.now()) {
  // One card per linked group: a duplicate's history counts toward its canonical role's card.
  const rows = t.q<Omit<BoardRole, 'replied' | 'next_interview' | 'needs'> & { verified_at: string | null; replied: number }>(`SELECT r.id, c.name AS company, r.title, COALESCE(r.status, 'found') AS status, r.score, r.location_type, r.location_line, r.source, r.stack, r.industry, r.url,
      r.comp_min, r.comp_max, r.comp_currency, r.comp_period, r.verified_at, r.first_seen,
      (SELECT MAX(ts) FROM events e WHERE e.role_id IN ${groupOf('r.id')}) AS last_event,
      (SELECT MIN(ts) FROM events e WHERE e.role_id IN ${groupOf('r.id')} AND e.status = 'applied') AS applied_at,
      EXISTS(SELECT 1 FROM events e WHERE e.role_id IN ${groupOf('r.id')} AND (e.status IN ('interviewing', 'offer') OR (e.status = 'closed' AND e.outcome = 'rejected'))) AS replied,
      CASE WHEN r.status = 'queued' THEN (SELECT question FROM events e WHERE e.role_id IN ${groupOf('r.id')} AND e.status = 'queued' ORDER BY e.ts DESC, e.id DESC LIMIT 1) END AS question
    FROM roles r JOIN companies c ON c.id = r.company_id WHERE ${isCard('r.id')} ORDER BY r.score DESC NULLS LAST, r.updated_at DESC`);
  const needs = needsByCard(t);
  const upcoming = t.openItems().upcoming_interviews;
  const nextInterview = new Map<number, string>();
  // Upcoming interviews come ordered by start, so the first per card is its next one.
  for (const i of upcoming) {
    const card = t.canonicalRoleId(i.role_id);
    if (i.starts_at && !nextInterview.has(card)) nextInterview.set(card, i.starts_at);
  }
  // Each card carries the lanes it may be dragged to, so the page lights up only those.
  const roles = rows.map(({ verified_at, replied, ...r }) => ({ ...r, replied: replied === 1, next_interview: nextInterview.get(r.id) ?? null, needs: needs.get(r.id) ?? [], moves: userMoves({ ...r, verified_at }).moves }));
  const rules = t.q<{ id: number; text: string }>('SELECT id, text FROM rules WHERE active = 1 ORDER BY id');

  const counts = Object.fromEntries(STATUSES.map((s) => [s, roles.filter((r) => r.status === s).length])) as Record<Status, number>;
  // Applied means the card was marked applied, or got an interview or offer (which a board move can record without it).
  const applied = roles.filter((r) => r.applied_at != null || r.status === 'interviewing' || r.status === 'offer' || (r.replied && r.status !== 'closed'));
  const replied = applied.filter((r) => r.replied).length;
  const since = new Date(nowMs - WEEK_MS).toISOString();
  const stats = {
    counts,
    applied_this_week: roles.filter((r) => r.applied_at != null && r.applied_at >= since).length,
    applied_total: applied.length,
    replied,
    reply_rate: applied.length ? replied / applied.length : null,
    needs_action: roles.filter((r) => r.needs.length > 0).length,
    upcoming_interviews: upcoming.slice(0, MAX_UPCOMING).map((i) => ({ id: i.id, role_id: t.canonicalRoleId(i.role_id), company: i.company, title: i.title, stage: i.stage, starts_at: i.starts_at, tz: i.tz })),
  };
  return { statuses: STATUSES, roles, rules, stats };
}

// Everything the drawer shows for one card: the role, its history, interviews and artifacts, read through
// roleDetail and listArtifacts. Fields are picked by name so a new column never reaches the page unreviewed.
export function boardRole(t: Tracker, id: number) {
  const card = t.cardRow(id);
  if (!card) throw new BoardNotFound(`No role ${id}`);
  const d = t.roleDetail({ role_id: id });
  const company = d.company;
  const { artifacts } = t.listArtifacts({ role_id: id });
  const events = [...d.events].reverse();
  const queued = events.find((e) => e.status === 'queued');
  return {
    id: card.id,
    requested_role_id: id,
    company: company ? { id: company.id, name: company.name, domain: company.domain, notes: company.notes, no_cold_apply: company.no_cold_apply === 1, no_cold_apply_reason: company.no_cold_apply_reason } : null,
    role: {
      title: card.title,
      status: card.status || 'found',
      url: card.url,
      ats: card.ats,
      score: card.score,
      score_notes: card.score_notes,
      location_line: card.location_line,
      location_type: card.location_type,
      comp_min: card.comp_min,
      comp_max: card.comp_max,
      comp_currency: card.comp_currency,
      comp_period: card.comp_period,
      equity: card.equity,
      stack: card.stack,
      industry: card.industry,
      source: card.source,
      first_seen: card.first_seen,
      posted_at: card.posted_at,
      verified_at: card.verified_at,
      updated_at: card.updated_at,
    },
    moves: userMoves(card).moves,
    question: card.status === 'queued' ? (queued?.question ?? null) : null,
    needs: needsByCard(t).get(card.id) ?? [],
    events: events.map((e) => ({ id: e.id, ts: e.ts, status: e.status, outcome: e.outcome, category: e.category, question: e.question, blocked_by: e.blocked_by, actor: e.actor, reason: e.reason, evidence: e.evidence })),
    interviews: d.interviews.map((i) => ({ id: i.id, stage: i.stage, state: i.state, starts_at: i.starts_at, tz: i.tz, people: i.people, link: i.link, booked_by: i.booked_by, notes: i.notes })),
    artifacts: artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      ref: a.path_or_ref,
      verified: a.verified_at != null,
      created_at: a.created_at,
      lint_errors: a.lint?.issues.filter((i) => i.severity === 'error').length ?? null,
      content: a.content ? a.content.slice(0, MAX_ARTIFACT_CHARS) : null,
      content_truncated: (a.content?.length ?? 0) > MAX_ARTIFACT_CHARS,
    })),
    urls: d.urls.map((u) => ({ url: u.url, evidence: u.evidence })),
    duplicates: d.links.map((l) => ({ role_id: l.duplicate_role_id, title: l.title, url: l.url, status: l.status })),
  };
}

const optionalString = (key: string, v: unknown): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new ToolError(`${key} must be a string.`);
  return v;
};

function checkBody(body: unknown, keys: readonly string[]): Record<string, unknown> & { role_id: number } {
  if (!isRecord(body)) throw new ToolError(`Send a JSON object with: ${keys.join(', ')}.`);
  const extra = Object.keys(body).filter((k) => !keys.includes(k));
  if (extra.length) throw new ToolError(`Unknown field: ${extra.join(', ')}. Allowed: ${keys.join(', ')}.`);
  const { role_id } = body;
  if (typeof role_id !== 'number' || !Number.isInteger(role_id)) throw new ToolError('role_id must be an integer.');
  return { ...body, role_id };
}

export function boardMove(t: Tracker, input: unknown) {
  const body = checkBody(input, MOVE_KEYS);
  const { role_id, to } = body;
  if (!oneOf(STATUSES, to)) throw new ToolError(`to must be one of: ${STATUSES.join(', ')}`);
  if (CLAUDE_ONLY.includes(to)) throw new ToolError(`Moving to ${to} needs Claude: run a sweep, or ask Claude to verify role ${role_id}.`);
  // A same-status transition is legal (re-running a step with new evidence) but would only add a no-op event here.
  const current = t.cardRow(role_id);
  if (current && (current.status || 'found') === to) throw new ToolError(`Role ${role_id} is already ${to}.`);
  const reason = optionalString('reason', body.reason)?.trim() || DEFAULT_REASON;
  const args = { role_id, to, reason, evidence: optionalString('evidence', body.evidence), outcome: optionalString('outcome', body.outcome) };
  // The user is the authority on their own search: any lane to any lane, and applied or dropped without evidence.
  return t.transition(args, { actor: 'user', selfReported: true });
}

// The user's own reason for a move, added after it: events are append-only, so it is a note, not an edit.
export function boardNote(t: Tracker, input: unknown) {
  const body = checkBody(input, NOTE_KEYS);
  // record rejects an empty reason with its own message.
  const reason = optionalString('reason', body.reason)?.trim() ?? '';
  return t.record({ role_id: body.role_id, reason, actor: 'user' });
}
