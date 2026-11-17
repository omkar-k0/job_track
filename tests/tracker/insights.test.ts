// follow_ups, funnel_stats and export_data: read-only views over the local history, and an owner-only export.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { test } from 'node:test';
import { openDb } from '../../plugin/servers/tracker/src/db.ts';
import { csvCell, exportData, toCsv } from '../../plugin/servers/tracker/src/export.ts';
import { followUps } from '../../plugin/servers/tracker/src/followups.ts';
import { funnelStats, median } from '../../plugin/servers/tracker/src/funnel.ts';
import type { RpcResponse } from '../../plugin/servers/tracker/src/mcp.ts';
import { makeHandler } from '../../plugin/servers/tracker/src/mcp.ts';
import { Tracker } from '../../plugin/servers/tracker/src/tracker.ts';

function fresh(ctx: TestContext) {
  const db = openDb(':memory:');
  ctx.after(() => db.close());
  return new Tracker(db);
}

function onDisk(ctx: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'jh-export-'));
  const dbPath = join(dir, 'tracker.db');
  const db = openDb(dbPath);
  ctx.after(() => db.close());
  return { t: new Tracker(db, { dbPath }), dir };
}

function call(t: Tracker) {
  const handle = makeHandler(t);
  return async (name: string, args: Record<string, unknown>) => {
    const res = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as RpcResponse;
    const r = res.result as { isError: boolean; content: [{ text: string }]; structuredContent?: Record<string, unknown> };
    return { error: r.isError ? String(JSON.parse(r.content[0].text).error) : '', data: r.structuredContent };
  };
}

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

// A role with its found event moved back to `found_at` and first_seen with it.
function role(t: Tracker, company: string, source: string | null, found_at: string): number {
  const { role } = t.upsertRole({ company, title: 'Engineer', source });
  t.run('UPDATE events SET ts = ?, received_at = ? WHERE role_id = ?', found_at, found_at, role.id);
  t.run('UPDATE roles SET first_seen = ? WHERE id = ?', found_at, role.id);
  return role.id;
}
const applyAt = (t: Tracker, role_id: number, ts: string) => t.insertEvent({ role_id, status: 'applied', actor: 'user', reason: 'Applied', evidence: 'Thanks for applying', ts });

// ---------- follow_ups ----------

test('follow_ups lists applications with no employer reply and no recent activity, oldest wait first', (ctx) => {
  const t = fresh(ctx);
  const silent = role(t, 'Silent Co', 'linkedin', ago(40));
  applyAt(t, silent, ago(20));
  const older = role(t, 'Older Co', 'ats', ago(40));
  applyAt(t, older, ago(30));
  const replied = role(t, 'Replied Co', null, ago(40));
  applyAt(t, replied, ago(20));
  t.insertEvent({ role_id: replied, actor: 'employer', reason: 'Recruiter wrote back', ts: ago(15) });
  const recent = role(t, 'Recent Co', null, ago(40));
  applyAt(t, recent, ago(3));
  const chased = role(t, 'Chased Co', null, ago(40));
  applyAt(t, chased, ago(20));
  t.insertEvent({ role_id: chased, actor: 'user', reason: 'Sent a follow-up email', ts: ago(2) });

  const r = followUps(t);
  assert.equal(r.after_days, 7);
  assert.deepEqual(r.applications.map((a) => a.role_id), [older, silent]);
  assert.equal(r.applications[0]?.days_waiting, 30);
  assert.equal(r.applications[1]?.days_since_activity, 20);
  assert.equal(r.applications[1]?.company, 'Silent Co');
  // A follow-up two days ago restarts the wait; a shorter one lists it again.
  assert.ok(followUps(t, { after_days: 1 }).applications.some((a) => a.role_id === chased));
  assert.ok(!followUps(t, { after_days: 1 }).applications.some((a) => a.role_id === replied));
});

test('follow_ups ignores roles that moved on and counts a linked duplicate toward its card', (ctx) => {
  const t = fresh(ctx);
  const card = role(t, 'Acme', null, ago(40));
  applyAt(t, card, ago(20));
  const rejected = role(t, 'Nope Co', null, ago(40));
  applyAt(t, rejected, ago(20));
  t.insertEvent({ role_id: rejected, status: 'closed', outcome: 'rejected', actor: 'employer', reason: 'Rejected', evidence: 'Not this time', ts: ago(10) });
  assert.deepEqual(followUps(t).applications.map((a) => a.role_id), [card]);
  // An employer reply on a duplicate row of the same posting is a reply to the card.
  const dup = t.upsertRole({ company: 'Acme', title: 'Engineer (copy)' }).role.id;
  t.run('INSERT INTO role_links(canonical_role_id, duplicate_role_id, reason, evidence, created_at) VALUES(?, ?, ?, ?, ?)', card, dup, 'same', 'same url', ago(1));
  t.run('UPDATE events SET ts = ? WHERE role_id = ?', ago(30), dup);
  t.insertEvent({ role_id: dup, actor: 'employer', reason: 'Reply on the other thread', ts: ago(9) }, { projectStatus: false });
  assert.deepEqual(followUps(t).applications, []);
});

test('follow_ups lists interviews that are over with nothing recorded since', (ctx) => {
  const t = fresh(ctx);
  const a = role(t, 'Acme', null, ago(40));
  applyAt(t, a, ago(30));
  // Recorded after the fact (a late calendar sync): its own interviewing and change events do not count as an outcome.
  const done = t.addInterview({ role_id: a, stage: 'Screen', starts_at: ago(3), tz: 'UTC' });
  const b = role(t, 'Beta', null, ago(40));
  applyAt(t, b, ago(30));
  t.addInterview({ role_id: b, stage: 'Screen', starts_at: ago(4), tz: 'UTC' });
  t.insertEvent({ role_id: b, actor: 'user', reason: 'Went well, waiting on feedback', ts: ago(2) });
  const c = role(t, 'Gamma', null, ago(40));
  applyAt(t, c, ago(30));
  t.addInterview({ role_id: c, stage: 'Screen', starts_at: ago(5), tz: 'UTC' });
  t.addInterview({ role_id: c, stage: 'Onsite', starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), tz: 'UTC' });
  const d = role(t, 'Delta', null, ago(40));
  applyAt(t, d, ago(30));
  t.addInterview({ role_id: d, stage: 'Screen', starts_at: new Date(Date.now() - 3 * 3600e3).toISOString(), tz: 'UTC' });

  const r = followUps(t);
  assert.deepEqual(r.interviews.map((i) => i.interview_id), [done.interview_id]);
  assert.equal(r.interviews[0]?.days_since, 3);
  assert.equal(r.interviews[0]?.stage, 'Screen');
  // With no grace the three-hour-old one is listed too.
  assert.equal(followUps(t, { interview_after_days: 0 }).interviews.length, 2);
});

test('follow_ups rejects day counts out of range', async (ctx) => {
  const t = fresh(ctx);
  const c = call(t);
  assert.match((await c('follow_ups', { after_days: -1 })).error, /after_days must be a whole number of days from 0 to 365/);
  assert.match((await c('follow_ups', { interview_after_days: 1000 })).error, /interview_after_days/);
  assert.equal((await c('follow_ups', {})).error, '');
});

// ---------- funnel_stats ----------

function funnelFixture(t: Tracker) {
  const a = role(t, 'Alpha', 'LinkedIn', '2026-10-01T09:00:00.000Z');
  applyAt(t, a, '2026-10-05T09:00:00.000Z');
  t.insertEvent({ role_id: a, actor: 'employer', reason: 'Recruiter replied', ts: '2026-10-07T09:00:00.000Z' });
  t.insertEvent({ role_id: a, status: 'interviewing', actor: 'employer', reason: 'Screen booked', ts: '2026-10-10T09:00:00.000Z' });
  const b = role(t, 'Beta', 'linkedin', '2026-10-01T09:00:00.000Z');
  applyAt(t, b, '2026-10-05T12:00:00.000Z');
  const c = role(t, 'Gamma', 'ats', '2026-10-02T09:00:00.000Z');
  applyAt(t, c, '2026-10-14T09:00:00.000Z');
  t.insertEvent({ role_id: c, status: 'closed', outcome: 'rejected', actor: 'employer', reason: 'Rejected', evidence: 'Not this time', ts: '2026-10-18T09:00:00.000Z' });
  const d = role(t, 'Delta', null, '2026-10-03T09:00:00.000Z');
  t.transition({ role_id: d, to: 'dropped', reason: 'Onsite only', evidence: 'Location: "Onsite in Springfield" https://jobs.example.test/delta/1' });
  return { a, b, c, d };
}

test('funnel_stats counts stages, conversions, reply timing, sources and weeks from the history', (ctx) => {
  const t = fresh(ctx);
  funnelFixture(t);
  const s = funnelStats(t);
  assert.deepEqual(s.status_counts, { interviewing: 1, applied: 1, closed: 1, dropped: 1 });
  assert.deepEqual(s.reached, { found: 4, verified: 3, scored: 3, queued: 3, applied: 3, interviewing: 1, offer: 0 });
  assert.deepEqual(s.conversion[0], { from: 'found', to: 'verified', from_count: 4, to_count: 3, rate: 0.75 });
  assert.deepEqual(s.conversion.at(-1), { from: 'interviewing', to: 'offer', from_count: 1, to_count: 0, rate: 0 });
  assert.deepEqual(s.applied, { count: 3, replied: 2, reply_rate: 0.667, interviewed: 1, interview_rate: 0.333, median_days_to_first_reply: 3, median_days_to_interview: 5 });
  assert.deepEqual(s.reply_rate_by_source, [
    { source: 'linkedin', applied: 2, replied: 1, interviewed: 1, reply_rate: 0.5, interview_rate: 0.5 },
    { source: 'ats', applied: 1, replied: 1, interviewed: 0, reply_rate: 1, interview_rate: 0 },
  ]);
  assert.deepEqual(s.weekly_applied, [{ week_start: '2026-10-05', applied: 2 }, { week_start: '2026-10-12', applied: 1 }]);
});

test('funnel_stats since/until bound it by local day in filters.timezone', async (ctx) => {
  const t = fresh(ctx);
  funnelFixture(t);
  const s = funnelStats(t, { since: '2026-10-10' });
  assert.equal(s.applied.count, 1);
  assert.deepEqual(s.status_counts, {});
  assert.deepEqual(funnelStats(t, { until: '2026-10-05' }).weekly_applied, [{ week_start: '2026-10-05', applied: 2 }]);
  // Beta applied at 12:00 UTC on the 5th, which is already the 6th in Auckland.
  t.saveConfig({ section: 'filters', data: { work_mode: ['remote'], residence_country: 'NZ', timezone: 'Pacific/Auckland', pay_floor: { amount: 1, currency: 'NZD' } } });
  assert.equal(funnelStats(t, { since: '2026-10-05', until: '2026-10-05' }).applied.count, 1);
  const c = call(t);
  assert.match((await c('funnel_stats', { since: '2026-10-12', until: '2026-10-01' })).error, /since .* must be on or before until/);
  assert.match((await c('funnel_stats', { since: '10/01/2026' })).error, /date must be YYYY-MM-DD/);
});

test('funnel_stats on an empty tracker returns zeros and nulls, not NaN', (ctx) => {
  const s = funnelStats(fresh(ctx));
  assert.equal(s.applied.count, 0);
  assert.equal(s.applied.reply_rate, null);
  assert.equal(s.applied.median_days_to_first_reply, null);
  assert.equal(s.conversion[0]?.rate, null);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

// ---------- export_data ----------

test('export_data json writes one owner-only file under exports/ with every table and row counts', { skip: process.platform === 'win32' }, async (ctx) => {
  const { t, dir } = onDisk(ctx);
  funnelFixture(t);
  t.addInterview({ role_id: 1, stage: 'Screen', starts_at: '2099-01-01T10:00:00Z', tz: 'UTC' });
  const { error, data } = await call(t)('export_data', { format: 'json', name: 'backup-1' });
  assert.equal(error, '');
  const path = join(dir, 'exports', 'backup-1.json');
  assert.equal(data?.path, path);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(join(dir, 'exports')).mode & 0o777, 0o700);
  const body = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(body.tables), ['roles', 'companies', 'events', 'interviews']);
  assert.deepEqual(data?.counts, { roles: 4, companies: 4, events: body.tables.events.length, interviews: 1 });
  assert.equal(body.tables.companies[0].name, 'Alpha');
  // A name that exists is refused, never overwritten.
  const again = await call(t)('export_data', { format: 'json', name: 'backup-1' });
  assert.match(again.error, /already exists/);
});

test('export_data csv writes one file per chosen table, quoted and safe to open in a spreadsheet', { skip: process.platform === 'win32' }, async (ctx) => {
  const { t, dir } = onDisk(ctx);
  t.upsertRole({ company: '=HYPERLINK("http://evil.example.test")', title: 'Engineer, "Platform"\nRemote' });
  const r = exportData(t, { format: 'csv', tables: ['companies', 'roles', 'companies'] });
  assert.deepEqual(r.files.map((f) => [f.table, f.rows]), [['companies', 1], ['roles', 1]]);
  assert.deepEqual(readdirSync(join(dir, 'exports')).length, 2);
  const roles = readFileSync(r.files[1]!.path, 'utf8');
  assert.ok(roles.startsWith('id,company_id,title,url,'));
  assert.ok(roles.includes('"Engineer, ""Platform""\nRemote"'));
  const companies = readFileSync(r.files[0]!.path, 'utf8');
  assert.ok(companies.includes(`"'=HYPERLINK(""http://evil.example.test"")"`));
  for (const f of r.files) assert.equal(statSync(f.path).mode & 0o777, 0o600);
});

test('export_data refuses names that are paths, unknown tables and formats, and in-memory trackers', async (ctx) => {
  const { t, dir } = onDisk(ctx);
  const c = call(t);
  for (const name of ['../escape', '/tmp/x', 'a/b', '..', '.hidden', 'x.json', '']) {
    const { error } = await c('export_data', { format: 'json', name });
    assert.match(error, /name must be|name is required|Invalid arguments/, name);
  }
  assert.ok(!existsSync(join(dir, 'escape.json')));
  assert.match((await c('export_data', { format: 'xlsx' })).error, /format must be json or csv/);
  assert.match((await c('export_data', { format: 'csv', tables: ['rules'] })).error, /Unknown table "rules"/);
  assert.match((await c('export_data', { format: 'csv', tables: [] })).error, /at least one/);
  assert.match((await call(fresh(ctx))('export_data', { format: 'json' })).error, /runs in memory/);
});

test('export_data does not write through a symlink planted at the export path', { skip: process.platform === 'win32' }, (ctx) => {
  const { t, dir } = onDisk(ctx);
  const target = join(dir, 'outside.txt');
  writeFileSync(target, 'keep');
  exportData(t, { format: 'json', name: 'first' });
  symlinkSync(target, join(dir, 'exports', 'planted.json'));
  assert.throws(() => exportData(t, { format: 'json', name: 'planted' }), /already exists/);
  assert.equal(readFileSync(target, 'utf8'), 'keep');
});

test('csv cells: nulls are empty, numbers stay numbers, leading formula characters on text are neutralised', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(toCsv(['a', 'b'], [{ a: 1, b: null }]), 'a,b\r\n1,\r\n');
});
