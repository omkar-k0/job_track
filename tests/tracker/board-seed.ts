// Made-up roles in the states the board cares about, for the board tests and a manual look at the page.

import { boardMove, boardNote } from '../../plugin/servers/tracker/src/board-api.ts';
import { openDb } from '../../plugin/servers/tracker/src/db.ts';
import { Tracker } from '../../plugin/servers/tracker/src/tracker.ts';

export function seeded(path = ':memory:') {
  const t = new Tracker(openDb(path), { dbPath: path === ':memory:' ? null : path });
  const add = (company: string, title: string, slug: string, pay = {}) => t.upsertRole({ company, title, url: `https://jobs.ashbyhq.com/${slug}`, source: 'ashby', ...pay }).role.id;
  const verify = (id: number) => t.transition({ role_id: id, to: 'verified', reason: 'Checked ATS', evidence: 'https://jobs.ashbyhq.com/x: "Remote (EU)"', location_line: 'Remote (EU)', location_type: 'remote' });
  const found = add('Northwind', 'Backend Engineer', 'northwind/1');
  const scored = add('Contoso', 'Platform Engineer', 'contoso/2', { comp_min: 90000, comp_max: 120000, comp_currency: 'EUR', comp_period: 'year' });
  verify(scored);
  t.transition({ role_id: scored, to: 'scored', reason: 'Fits the stack', score: 8 });
  const queued = add('Fabrikam', 'Staff Engineer', 'fabrikam/3');
  verify(queued);
  t.transition({ role_id: queued, to: 'scored', reason: 'Strong fit', score: 9 });
  t.transition({ role_id: queued, to: 'queued', reason: 'Top pick', question: 'Is a quarterly week in Lisbon OK?', blocked_by: 'user' });
  const { rule_id: rule } = t.addRule({ text: 'Skip staffing agencies', reason: 'User preference' });
  return { t, found, scored, queued, rule };
}

// A fuller search for the page tests and screenshots: every lane, interviews, artifacts, notes, a role that needs the
// user, and company names that try to be markup. Nothing here is a real company or person.
export function seededRich(path = ':memory:') {
  const s = seeded(path);
  const { t } = s;
  const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
  const add = (company: string, title: string, slug: string, extra: Record<string, unknown> = {}) => t.upsertRole({ company, title, url: `https://jobs.ashbyhq.com/${slug}`, source: 'ashby', ...extra }).role.id;
  const scoreTo = (id: number, score: number, mode = 'remote', line = 'Remote (EU)') => {
    t.transition({ role_id: id, to: 'verified', reason: 'Checked ATS', evidence: 'https://jobs.ashbyhq.com/x: "Remote (EU)"', location_line: line, location_type: mode });
    t.transition({ role_id: id, to: 'scored', reason: 'Fits the stack', score });
  };
  const user = (id: number, to: string, reason?: string, outcome?: string) => boardMove(t, { role_id: id, to, reason, outcome });

  const applied = add('Tailspin Toys', 'Senior Backend Engineer', 'tailspin/10', { source: 'linkedin', stack: 'TypeScript, Postgres', industry: 'Games', comp_min: 110000, comp_max: 140000, comp_currency: 'USD', comp_period: 'year' });
  scoreTo(applied, 8.5, 'hybrid', 'Berlin (3 days in office)');
  user(applied, 'applied', 'Applied through the careers page');
  const interviewing = add('Adventure Works', 'Staff Platform Engineer', 'adventure/11', { source: 'greenhouse', stack: 'Go, Kubernetes', comp_min: 150000, comp_max: 180000, comp_currency: 'EUR', comp_period: 'year' });
  scoreTo(interviewing, 9);
  user(interviewing, 'applied');
  s.t.addArtifact({ role_id: interviewing, kind: 'cover_note', content: 'Hello team,\n\nI would like to help with the platform migration. I built a similar control plane last year and cut deploy time by half.\n\nThanks,\nAlex' });
  s.t.addArtifact({ role_id: interviewing, kind: 'gmail_draft', ref: 'draft-123' });
  t.addInterview({ role_id: interviewing, stage: 'Hiring manager screen', starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), tz: 'Europe/Berlin', people: 'Dana Whitfield', link: 'https://meet.example.com/abc', notes: 'Prepare the migration story' });
  t.addInterview({ role_id: interviewing, stage: 'System design' });
  boardNote(t, { role_id: interviewing, reason: 'Recruiter said the team is small and remote friendly' });
  const offer = add('Wide World Importers', 'Principal Engineer', 'wwi/12', { source: 'ashby', comp_min: 200000, comp_currency: 'USD', comp_period: 'year' });
  scoreTo(offer, 9.5, 'remote', 'Remote (US)');
  user(offer, 'offer', 'Verbal offer on the call');
  const dropped = add('Litware', 'Contract Developer', 'litware/13', { source: 'indeed' });
  scoreTo(dropped, 4, 'onsite', 'Munich');
  user(dropped, 'dropped', 'Staffing agency');
  const closed = add('Proseware', 'Engineering Manager', 'proseware/14', { source: 'linkedin' });
  scoreTo(closed, 7, 'remote');
  user(closed, 'applied');
  user(closed, 'closed', 'No answer after a month', 'rejected');
  // Back-dated histories, so "applied this week" and "reply rate" have something to count and the timeline has a span.
  const backdate = (id: number, when: Record<string, number>) => {
    for (const [status, n] of Object.entries(when)) t.run('UPDATE events SET ts = ?, received_at = ? WHERE role_id = ? AND status = ?', days(n), days(n), id, status);
  };
  backdate(closed, { found: 26, verified: 25, scored: 25, applied: 20, closed: 5 });
  backdate(interviewing, { found: 5, verified: 4, scored: 4, applied: 2 });
  const hostile = add('<img src=x onerror="document.title=\'pwned\'">Evil Corp', '<script>document.title="pwned"</script>Engineer', 'evil/15', { source: '"><b>ashby</b>', stack: '<svg onload=alert(1)>' });
  scoreTo(hostile, 6, 'remote', '<b>Nowhere</b>');
  t.record({ role_id: hostile, reason: '<img src=x onerror=alert(2)> note', actor: 'user' });
  return { ...s, applied, interviewing, offer, dropped, closed, hostile };
}
