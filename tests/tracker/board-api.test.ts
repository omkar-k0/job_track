import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoardNotFound, boardMove, boardNote, boardRole, boardView } from '../../plugin/servers/tracker/src/board-api.ts';
import { ToolError } from '../../plugin/servers/tracker/src/errors.ts';
import type { RpcResponse } from '../../plugin/servers/tracker/src/mcp.ts';
import { makeHandler } from '../../plugin/servers/tracker/src/mcp.ts';
import { renderReport, runAudit } from '../../plugin/servers/tracker/src/report.ts';
import { STATUSES } from '../../plugin/servers/tracker/src/tracker.ts';
import { seeded, seededRich } from './board-seed.ts';

const lastEvent = (s: ReturnType<typeof seeded>, id: number) => s.t.roleDetail({ role_id: id }).events.at(-1);
const callTool = async (s: ReturnType<typeof seeded>, name: string, args: Record<string, unknown>) => {
  const res = (await makeHandler(s.t)({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as RpcResponse;
  return res.result as { isError: boolean; content: [{ text: string }] };
};

test('the board view lists roles with company, pay, blocking question, drag targets and active rules', () => {
  const s = seeded();
  const v = boardView(s.t);
  assert.deepEqual(v.statuses, STATUSES);
  const byId = new Map(v.roles.map((r) => [r.id, r]));
  assert.equal(byId.get(s.found)?.company, 'Northwind');
  assert.equal(byId.get(s.found)?.status, 'found');
  assert.equal(byId.get(s.found)?.question, null);
  assert.equal(byId.get(s.queued)?.question, 'Is a quarterly week in Lisbon OK?');
  assert.ok(byId.get(s.queued)?.last_event);
  assert.deepEqual({ ...byId.get(s.scored), id: 0, last_event: null, first_seen: null }, { id: 0, company: 'Contoso', title: 'Platform Engineer', status: 'scored', score: 8, location_type: 'remote', location_line: 'Remote (EU)', source: 'ashby', stack: null, industry: null, url: 'https://jobs.ashbyhq.com/contoso/2', comp_min: 90000, comp_max: 120000, comp_currency: 'EUR', comp_period: 'year', first_seen: null, last_event: null, applied_at: null, replied: false, next_interview: null, question: null, needs: [], moves: ['queued', 'applied', 'interviewing', 'offer', 'dropped', 'closed'] });
  // Roles still in the sweep are Claude's: they are counted in the header, not dragged.
  assert.deepEqual(byId.get(s.found)?.moves, []);
  assert.deepEqual(byId.get(s.queued)?.moves, ['scored', 'applied', 'interviewing', 'offer', 'dropped', 'closed']);
  assert.deepEqual(v.rules.map((r) => ({ ...r })), [{ id: s.rule, text: 'Skip staffing agencies' }]);
});

test('a legal move is recorded as the user', () => {
  const s = seeded();
  const out = boardMove(s.t, { role_id: s.scored, to: 'queued', reason: 'Moved on the board' });
  assert.equal(out.to, 'queued');
  assert.equal(lastEvent(s, s.scored)?.actor, 'user');
});

test('the user can move a card from any lane to any lane, back and out of dropped or closed', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.queued, to: 'interviewing' });
  boardMove(s.t, { role_id: s.queued, to: 'applied' });
  boardMove(s.t, { role_id: s.queued, to: 'scored' });
  boardMove(s.t, { role_id: s.queued, to: 'closed', outcome: 'rejected' });
  boardMove(s.t, { role_id: s.queued, to: 'queued' });
  boardMove(s.t, { role_id: s.queued, to: 'dropped' });
  boardMove(s.t, { role_id: s.queued, to: 'offer' });
  assert.equal(s.t.roleRow(s.queued)?.status, 'offer');
  const moves = s.t.roleDetail({ role_id: s.queued }).events.filter((e) => e.actor === 'user').map((e) => e.status);
  assert.deepEqual(moves, ['interviewing', 'applied', 'scored', 'closed', 'queued', 'dropped', 'offer']);
});

test('a drop on the board needs no evidence; the model\'s drops still do', async () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.scored, to: 'dropped' });
  const ev = lastEvent(s, s.scored);
  assert.equal(ev?.status, 'dropped');
  assert.equal(ev?.evidence, null);
  assert.equal(ev?.reason, 'Moved on the board');
  const out = await callTool(s, 'transition', { role_id: s.queued, to: 'dropped', reason: 'Not a fit' });
  assert.equal(out.isError, true);
  assert.match(out.content[0].text, /A drop needs evidence/);
  const viaRecord = await callTool(s, 'record', { role_id: s.queued, status: 'dropped', reason: 'User said so', actor: 'user' });
  assert.equal(viaRecord.isError, true);
  // The forward-only machine still binds the model.
  const back = await callTool(s, 'transition', { role_id: s.queued, to: 'scored', reason: 'Undo' });
  assert.match(back.content[0].text, /Illegal transition queued → scored/);
});

test('board moves keep the rules that still mean something', () => {
  const s = seeded();
  const eventsBefore = s.t.roleDetail({ role_id: s.found }).events.length;
  // A role still in the sweep is not on the board.
  assert.throws(() => boardMove(s.t, { role_id: s.found, to: 'applied' }), /still in the sweep \(found\)/);
  assert.throws(() => boardMove(s.t, { role_id: s.queued, to: 'closed', reason: 'r' }), /closed needs outcome/);
  assert.throws(() => boardMove(s.t, { role_id: 9999, to: 'dropped' }), /No role 9999/);
  // Only a role Claude verified and scored can go back to scored or queued.
  const t2 = s.t.upsertRole({ company: 'Tailspin', title: 'SRE', url: 'https://jobs.ashbyhq.com/tailspin/4', source: 'ashby' }).role.id;
  s.t.transition({ role_id: t2, to: 'dropped', reason: 'agency', evidence: `rule:${s.rule}` });
  assert.throws(() => boardMove(s.t, { role_id: t2, to: 'queued' }), /needs Claude to verify and score it/);
  assert.throws(() => boardMove(s.t, { role_id: t2, to: 'scored' }), /needs Claude to verify and score it/);
  boardMove(s.t, { role_id: t2, to: 'applied' });
  // A refused move writes nothing.
  assert.equal(s.t.roleRow(s.found)?.status, 'found');
  assert.equal(s.t.roleDetail({ role_id: s.found }).events.length, eventsBefore);
});

test('moves that need Claude, no-op moves and malformed bodies are refused', () => {
  const s = seeded();
  assert.throws(() => boardMove(s.t, { role_id: s.scored, to: 'verified', reason: 'r' }), /needs Claude/);
  assert.throws(() => boardMove(s.t, { role_id: s.scored, to: 'found', reason: 'r' }), /needs Claude/);
  assert.throws(() => boardMove(s.t, { role_id: s.queued, to: 'queued', reason: 'r' }), /already queued/);
  assert.throws(() => boardMove(s.t, null), ToolError);
  assert.throws(() => boardMove(s.t, { role_id: '1', to: 'dropped', reason: 'r' }), /role_id must be an integer/);
  assert.throws(() => boardMove(s.t, { role_id: s.found, to: 'nowhere', reason: 'r' }), /to must be one of/);
  assert.throws(() => boardMove(s.t, { role_id: s.found, to: 'dropped', reason: 'r', actor: 'pipeline' }), /Unknown field: actor/);
  assert.throws(() => boardMove(s.t, { role_id: s.found, to: 'dropped', reason: 7 }), /reason must be a string/);
});

test('a move without a reason records the board default; a given reason wins', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.scored, to: 'queued' });
  assert.equal(lastEvent(s, s.scored)?.reason, 'Moved on the board');
  boardMove(s.t, { role_id: s.queued, to: 'closed', outcome: 'withdrawn', reason: '  ' });
  assert.equal(lastEvent(s, s.queued)?.reason, 'Moved on the board');
  boardMove(s.t, { role_id: s.scored, to: 'dropped', evidence: `rule:${s.rule}`, reason: 'Agency, not the employer' });
  assert.equal(lastEvent(s, s.scored)?.reason, 'Agency, not the employer');
  assert.equal(lastEvent(s, s.scored)?.evidence, `rule:${s.rule}`);
});

test('a note adds the user\'s own reason without changing the status', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.scored, to: 'queued' });
  boardNote(s.t, { role_id: s.scored, reason: 'Great team, apply this week' });
  const ev = lastEvent(s, s.scored);
  assert.equal(ev?.status, null);
  assert.equal(ev?.actor, 'user');
  assert.equal(ev?.reason, 'Great team, apply this week');
  assert.equal(s.t.roleRow(s.scored)?.status, 'queued');
  assert.throws(() => boardNote(s.t, { role_id: s.scored, reason: '   ' }), /reason is required/);
  assert.throws(() => boardNote(s.t, { role_id: s.scored, reason: 'x', status: 'offer' }), /Unknown field: status/);
  assert.throws(() => boardNote(s.t, { role_id: 9999, reason: 'x' }), /No role 9999/);
});

test('the user can mark a role applied on the board without confirmation text', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.queued, to: 'applied' });
  const ev = lastEvent(s, s.queued);
  assert.equal(ev?.status, 'applied');
  assert.equal(ev?.actor, 'user');
  assert.equal(ev?.evidence, null);
});

test('the model still cannot record applied without confirmation, even as the user', async () => {
  const s = seeded();
  const viaTransition = await callTool(s, 'transition', { role_id: s.queued, to: 'applied', reason: 'Submitted' });
  assert.equal(viaTransition.isError, true);
  assert.match(viaTransition.content[0].text, /applied needs evidence/);
  const viaRecord = await callTool(s, 'record', { role_id: s.queued, status: 'applied', reason: 'User said so', actor: 'user' });
  assert.equal(viaRecord.isError, true);
  assert.match(viaRecord.content[0].text, /applied needs evidence/);
  assert.equal(s.t.roleRow(s.queued)?.status, 'queued');
  // Only the board's own path may skip it, and only as the user.
  assert.throws(() => s.t.transition({ role_id: s.queued, to: 'applied', reason: 'r' }, { selfReported: true }), /self-reported/);
});

test('board-reported applications are listed in the report and do not fail the audit', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.queued, to: 'applied' });
  const day = new Date().toISOString().slice(0, 10);
  const report = renderReport(s.t, { date: day }).markdown;
  assert.match(report, /Fabrikam\*\*, Staff Engineer\. Marked applied by you on the board, without confirmation text\./);
  assert.ok(!runAudit(s.t, { date: day }).failures.some((f) => f.check === 'applied_without_confirmation'));
});

test('board drops are listed in the report as the user\'s and do not fail the audit', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.scored, to: 'dropped' });
  const day = new Date().toISOString().slice(0, 10);
  assert.match(renderReport(s.t, { date: day }).markdown, /- by you on the board: Contoso \(Moved on the board\)/);
  assert.ok(!runAudit(s.t, { date: day }).failures.some((f) => f.check === 'drop_without_evidence'));
});

// A row an older release left for the same posting as an existing role, written straight to the tables.
function legacyDuplicate(s: ReturnType<typeof seeded>, of: number, id: number, history: [ts: string, status: string, outcome?: string][]) {
  const status = history.at(-1)?.[1] ?? null;
  s.t.run("INSERT INTO roles(id, company_id, title, first_seen, updated_at, status) VALUES(?, ?, 'Staff Engineer', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?)", id, s.t.mustRole(of).company_id, status);
  for (const [ts, st, outcome] of history) s.t.run("INSERT INTO events(role_id, ts, status, outcome, question, actor, reason) VALUES(?, ?, ?, ?, ?, 'import', 'Legacy row')", id, ts, st, outcome ?? null, st === 'queued' ? 'Old question?' : null);
  return id;
}
const LINK = { reason: 'Same posting tracked twice', evidence: 'Both rows link to https://jobs.ashbyhq.com/fabrikam/3' };

test('a linked duplicate is one card on the board, in open items and in the summary', () => {
  const s = seeded();
  const dup = legacyDuplicate(s, s.queued, 100, [['2026-01-01T00:00:00Z', 'found'], ['2026-01-02T00:00:00Z', 'queued']]);
  s.t.run("INSERT INTO interviews(role_id, stage, created_at) VALUES(?, 'screen', '2026-01-02T00:00:00Z')", dup);
  s.t.linkDuplicateRole({ canonical_role_id: s.queued, duplicate_role_id: dup, ...LINK });
  assert.deepEqual(boardView(s.t).roles.map((r) => r.id).sort(), [s.found, s.scored, s.queued].sort());
  const items = s.t.openItems();
  assert.deepEqual(items.queue.map((q) => [q.id, q.question]), [[s.queued, 'Is a quarterly week in Lisbon OK?']]);
  const summary = s.t.pipelineSummary();
  assert.equal(summary.counts.queued, 1);
  assert.deepEqual(summary.queue.map((q) => q.id), [s.queued]);
  // The duplicate's old interview belongs to the card, which is still queued, so the booking stays visible once.
  assert.deepEqual(items.interviews_to_book.map((i) => [i.role_id, i.title]), [[dup, 'Staff Engineer']]);
  s.t.transition({ role_id: s.queued, to: 'closed', outcome: 'role_closed', reason: 'Posting gone' });
  assert.deepEqual(s.t.openItems().interviews_to_book, [], 'the card is closed, whatever the duplicate row says');
  assert.deepEqual(s.t.openItems().queue, []);
});

test('rejections and counts show a linked group once', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.queued, to: 'applied' });
  boardMove(s.t, { role_id: s.queued, to: 'closed', outcome: 'rejected' });
  legacyDuplicate(s, s.queued, 100, [['2026-01-01T00:00:00Z', 'applied'], ['2026-01-09T00:00:00Z', 'closed', 'rejected']]);
  s.t.linkDuplicateRole({ canonical_role_id: s.queued, duplicate_role_id: 100, ...LINK });
  const summary = s.t.pipelineSummary();
  assert.equal(summary.counts.closed, 1);
  assert.deepEqual(summary.rejections.map((r) => r.id), [s.queued]);
});

test('board moves and notes sent with an old id land on the canonical card', () => {
  const s = seeded();
  const dup = legacyDuplicate(s, s.queued, 100, [['2026-01-01T00:00:00Z', 'found'], ['2026-01-02T00:00:00Z', 'scored']]);
  s.t.linkDuplicateRole({ canonical_role_id: s.queued, duplicate_role_id: dup, ...LINK });
  // The duplicate row says scored, but the card is queued.
  assert.throws(() => boardMove(s.t, { role_id: dup, to: 'queued' }), /already queued/);
  boardMove(s.t, { role_id: dup, to: 'applied' });
  boardNote(s.t, { role_id: dup, reason: 'Applied through a referral' });
  assert.equal(s.t.mustRole(s.queued).status, 'applied');
  assert.equal(s.t.mustRole(dup).status, 'scored');
  assert.deepEqual(s.t.roleDetail({ role_id: s.queued }).events.slice(-2).map((e) => [e.role_id, e.status]), [[s.queued, 'applied'], [s.queued, null]]);
});

test('the board view carries the open items a card needs from the user', () => {
  const s = seededRich();
  const byId = new Map(boardView(s.t).roles.map((r) => [r.id, r]));
  assert.deepEqual(byId.get(s.queued)?.needs, [{ kind: 'question', text: 'Is a quarterly week in Lisbon OK?' }]);
  assert.deepEqual(byId.get(s.interviewing)?.needs.map((n) => n.kind).sort(), ['draft_unverified', 'interview_to_book']);
  assert.deepEqual(byId.get(s.scored)?.needs, []);
  assert.equal(boardView(s.t).stats.needs_action, 2);
  assert.ok(byId.get(s.interviewing)?.next_interview, 'the scheduled screen is the next interview');
  assert.equal(byId.get(s.scored)?.next_interview, null);
});

test('the stats count lanes, applications this week, replies and upcoming interviews', () => {
  const s = seededRich();
  const { stats } = boardView(s.t);
  assert.deepEqual({ ...stats.counts }, { found: 1, verified: 0, scored: 2, queued: 1, applied: 1, interviewing: 1, offer: 1, dropped: 1, closed: 1 });
  // Tailspin and Adventure Works were applied to this week; Proseware 20 days ago.
  assert.equal(stats.applied_this_week, 2);
  // Applied: Tailspin, Adventure Works, Proseware, and Wide World (an offer needs an application). Answered: all but Tailspin.
  assert.equal(stats.applied_total, 4);
  assert.equal(stats.replied, 3);
  assert.equal(stats.reply_rate, 0.75);
  assert.deepEqual(stats.upcoming_interviews.map((i) => [i.company, i.stage, i.tz, i.role_id]), [['Adventure Works', 'Hiring manager screen', 'Europe/Berlin', s.interviewing]]);
  // The week is a moving window.
  const later = boardView(s.t, Date.now() + 8 * 864e5).stats;
  assert.equal(later.applied_this_week, 0);
});

test('stats for an empty board have no reply rate and no interviews', () => {
  const s = seeded();
  const { stats } = boardView(s.t);
  assert.equal(stats.reply_rate, null);
  assert.equal(stats.applied_total, 0);
  assert.equal(stats.applied_this_week, 0);
  assert.deepEqual(stats.upcoming_interviews, []);
  assert.equal(stats.counts.found, 1);
});

test('a withdrawn or user-rejected role is not an employer reply', () => {
  const s = seeded();
  boardMove(s.t, { role_id: s.queued, to: 'applied' });
  boardMove(s.t, { role_id: s.queued, to: 'closed', outcome: 'withdrawn' });
  const { stats } = boardView(s.t);
  assert.equal(stats.applied_total, 1);
  assert.equal(stats.replied, 0);
  assert.equal(stats.reply_rate, 0);
});

test('role detail lists the timeline newest first, interviews, artifacts and links', () => {
  const s = seededRich();
  const d = boardRole(s.t, s.interviewing);
  assert.equal(d.id, s.interviewing);
  assert.equal(d.company?.name, 'Adventure Works');
  assert.equal(d.role.title, 'Staff Platform Engineer');
  assert.equal(d.role.status, 'interviewing');
  assert.equal(d.role.url, 'https://jobs.ashbyhq.com/adventure/11');
  assert.deepEqual(d.moves, ['scored', 'queued', 'applied', 'offer', 'dropped', 'closed']);
  // Newest first: the note, then the interview updates, then applied, scored, verified, found.
  assert.equal(d.events[0]?.reason, 'Recruiter said the team is small and remote friendly');
  assert.equal(d.events.at(-1)?.status, 'found');
  assert.deepEqual(d.events.filter((e) => e.status).map((e) => e.status), ['interviewing', 'applied', 'scored', 'verified', 'found']);
  assert.deepEqual(d.interviews.map((i) => [i.stage, i.state, i.people, i.link]), [['Hiring manager screen', 'scheduled', 'Dana Whitfield', 'https://meet.example.com/abc'], ['System design', 'pending', null, null]]);
  assert.deepEqual(d.artifacts.map((a) => [a.kind, a.verified, a.ref]), [['cover_note', false, null], ['gmail_draft', false, 'draft-123']]);
  assert.match(d.artifacts[0]?.content ?? '', /platform migration/);
  assert.equal(d.artifacts[0]?.lint_errors, 0);
  assert.deepEqual(d.urls.map((u) => u.url), ['https://jobs.ashbyhq.com/adventure/11']);
  assert.deepEqual(d.needs.map((n) => n.kind).sort(), ['draft_unverified', 'interview_to_book']);
  // Only named fields go to the page.
  assert.deepEqual(Object.keys(d.events[0] ?? {}).sort(), ['actor', 'blocked_by', 'category', 'evidence', 'id', 'outcome', 'question', 'reason', 'status', 'ts']);
});

test('role detail carries the queued question and cuts very long artifact text', () => {
  const s = seededRich();
  assert.equal(boardRole(s.t, s.queued).question, 'Is a quarterly week in Lisbon OK?');
  assert.equal(boardRole(s.t, s.scored).question, null);
  s.t.addArtifact({ role_id: s.scored, kind: 'note', content: 'x'.repeat(9000) });
  const long = boardRole(s.t, s.scored).artifacts[0];
  assert.equal(long?.content?.length, 4000);
  assert.equal(long?.content_truncated, true);
  assert.equal(boardRole(s.t, s.interviewing).artifacts[0]?.content_truncated, false);
});

test('role detail for an unknown role is a not-found, and a duplicate shows its canonical card', () => {
  const s = seeded();
  assert.throws(() => boardRole(s.t, 9999), BoardNotFound);
  legacyDuplicate(s, s.queued, 100, [['2026-01-01T00:00:00Z', 'found'], ['2026-01-02T00:00:00Z', 'scored']]);
  s.t.linkDuplicateRole({ canonical_role_id: s.queued, duplicate_role_id: 100, ...LINK });
  const d = boardRole(s.t, 100);
  assert.equal(d.id, s.queued);
  assert.equal(d.requested_role_id, 100);
  assert.deepEqual(d.duplicates.map((x) => x.role_id), [100]);
  // The duplicate's own history is part of the card's timeline.
  assert.ok(d.events.some((e) => e.reason === 'Legacy row'));
});
