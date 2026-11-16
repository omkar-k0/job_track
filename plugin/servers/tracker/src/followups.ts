// follow_ups: what is waiting on the user to chase. open_items covers the queue, drafts, interviews to book and
// upcoming interviews; this covers the two things it leaves out, both read from local history only:
// - applications still at applied with no reply from the employer since applying and no activity at all for
//   after_days (a follow-up the user sent, recorded as a note, restarts the wait);
// - scheduled interviews that are over by interview_after_days with nothing recorded on the role since they started
//   (recording the interview itself, its interviewing move and its change log, is not an outcome).

import { ToolError } from './errors.ts';
import type { ArgsFor } from './tools.ts';
import type { Tracker } from './tracker.ts';
import { canonicalOf, groupOf, isCard } from './tracker.ts';

export const FOLLOW_UP_AFTER_DAYS = 7;
export const INTERVIEW_OUTCOME_AFTER_DAYS = 1;
const DAY_MS = 864e5;
// The same employer-side events funnel_stats counts as a reply.
const REPLY = `(e.actor = 'employer' OR e.status IN ('interviewing', 'offer') OR (e.status = 'closed' AND e.outcome = 'rejected'))`;

function dayCount(name: string, v: number | null | undefined, fallback: number): number {
  const n = v ?? fallback;
  if (!Number.isInteger(n) || n < 0 || n > 365) throw new ToolError(`${name} must be a whole number of days from 0 to 365, got ${n}.`);
  return n;
}

export function followUps(t: Tracker, { after_days, interview_after_days }: ArgsFor<'follow_ups'> = {}) {
  const wait = dayCount('after_days', after_days, FOLLOW_UP_AFTER_DAYS);
  const grace = dayCount('interview_after_days', interview_after_days, INTERVIEW_OUTCOME_AFTER_DAYS);
  const nowMs = Date.now();
  const since = (iso: string) => Math.floor((nowMs - Date.parse(iso)) / DAY_MS);

  type Waiting = { role_id: number; company: string; title: string; url: string | null; source: string | null; applied_at: string; last_activity_at: string };
  const waiting = t.q<Waiting>(`
    SELECT * FROM (
      SELECT r.id AS role_id, c.name AS company, r.title, r.url, r.source,
        (SELECT MIN(e.ts) FROM events e WHERE e.role_id IN ${groupOf('r.id')} AND e.status = 'applied') AS applied_at,
        (SELECT MAX(e.ts) FROM events e WHERE e.role_id IN ${groupOf('r.id')}) AS last_activity_at
      FROM roles r JOIN companies c ON c.id = r.company_id
      WHERE r.status = 'applied' AND ${isCard('r.id')}
    ) w
    WHERE w.applied_at IS NOT NULL AND w.last_activity_at <= ?
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.role_id IN ${groupOf('w.role_id')} AND e.ts > w.applied_at AND ${REPLY})`,
    new Date(nowMs - wait * DAY_MS).toISOString());
  const applications = waiting
    .map((w) => ({ ...w, days_waiting: since(w.applied_at), days_since_activity: since(w.last_activity_at) }))
    .sort((a, b) => b.days_since_activity - a.days_since_activity || b.days_waiting - a.days_waiting || a.role_id - b.role_id);

  type Past = { interview_id: number; role_id: number; company: string; title: string; stage: string | null; starts_at: string };
  const past = t.q<Past>(`
    SELECT i.id AS interview_id, r.id AS role_id, c.name AS company, r.title, i.stage, i.starts_at
    FROM interviews i JOIN roles r ON r.id = ${canonicalOf('i.role_id')} JOIN companies c ON c.id = r.company_id
    WHERE i.state = 'scheduled' AND i.starts_at IS NOT NULL AND i.starts_at <= ? AND r.status NOT IN ('closed', 'dropped')
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.role_id IN ${groupOf('r.id')} AND e.ts > i.starts_at AND e.category IS NOT 'interview_changed' AND e.status IS NOT 'interviewing')
      AND NOT EXISTS (SELECT 1 FROM interviews j WHERE j.id <> i.id AND ${canonicalOf('j.role_id')} = r.id AND j.state <> 'cancelled' AND (j.starts_at > i.starts_at OR (j.starts_at IS NULL AND j.created_at > i.starts_at)))`,
    new Date(nowMs - grace * DAY_MS).toISOString());
  const interviews = past.map((p) => ({ ...p, days_since: since(p.starts_at) })).sort((a, b) => b.days_since - a.days_since || a.interview_id - b.interview_id);

  return { after_days: wait, interview_after_days: grace, applications, interviews };
}
