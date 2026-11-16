// funnel_stats: conversion numbers from the local event history. Read-only, computed here, nothing leaves the machine.
//
// One card per linked group (duplicates count toward their canonical role). A card "reached" a stage when its
// current status or any status event in its group is that stage or a later one on the main line, so a card
// recorded straight to applied still counts as found, verified, scored and queued. A reply is the first event after
// applying that came from the employer: any employer event, an interviewing or offer status, or a rejection.

import { ToolError } from './errors.ts';
import { dayBounds, localDate } from './time.ts';
import type { ArgsFor } from './tools.ts';
import type { Tracker } from './tracker.ts';
import { canonicalOf, isCard } from './tracker.ts';

export const FUNNEL_STAGES = ['found', 'verified', 'scored', 'queued', 'applied', 'interviewing', 'offer'] as const;
const RANK = new Map<string, number>(FUNNEL_STAGES.map((s, i) => [s, i]));
const DAY_MS = 864e5;

interface Card {
  id: number;
  status: string | null;
  source: string | null;
  first_seen: string;
}
interface Ev {
  card: number;
  ts: string;
  status: string | null;
  outcome: string | null;
  actor: string;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  // mid and mid - 1 are in range: s has at least one element, and two when its length is even.
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

const rate = (n: number, of: number): number | null => (of ? Math.round((n / of) * 1000) / 1000 : null);
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS;
const isReply = (e: Ev) => e.actor === 'employer' || e.status === 'interviewing' || e.status === 'offer' || (e.status === 'closed' && e.outcome === 'rejected');

// Monday of the local week that instant iso falls in, as YYYY-MM-DD.
function weekStart(iso: string, tz: string): string {
  const [y = 0, m = 0, d = 0] = localDate(Date.parse(iso), tz).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

export function funnelStats(t: Tracker, { since, until }: ArgsFor<'funnel_stats'> = {}) {
  const tz = t.timezone();
  const from = since != null ? dayBounds(since, tz)[0] : null;
  const to = until != null ? dayBounds(until, tz)[1] : null;
  if (from && to && from >= to) throw new ToolError(`since (${since}) must be on or before until (${until}).`);
  const inWindow = (ts: string) => (!from || ts >= from) && (!to || ts < to);

  const cards = t.q<Card>(`SELECT r.id, r.status, r.source, r.first_seen FROM roles r WHERE ${isCard('r.id')} ORDER BY r.id`);
  const byCard = new Map<number, Ev[]>(cards.map((c) => [c.id, []]));
  for (const e of t.q<Ev>(`SELECT ${canonicalOf('e.role_id')} AS card, e.ts, e.status, e.outcome, e.actor FROM events e ORDER BY e.ts, e.id`)) byCard.get(e.card)?.push(e);

  // Stage counts cover cards first seen in the window.
  const status_counts: Record<string, number> = {};
  const reached: Record<string, number> = Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0]));
  // Reply and interview numbers cover cards that applied in the window.
  const replyDays: number[] = [];
  const interviewDays: number[] = [];
  const bySource = new Map<string, { applied: number; replied: number; interviewed: number }>();
  const weekly = new Map<string, number>();
  let applied = 0;
  let replied = 0;
  let interviewed = 0;

  for (const card of cards) {
    const evs = byCard.get(card.id) ?? [];
    if (inWindow(card.first_seen)) {
      const st = card.status ?? 'none';
      status_counts[st] = (status_counts[st] ?? 0) + 1;
      let top = card.status ? (RANK.get(card.status) ?? -1) : -1;
      for (const e of evs) if (e.status) top = Math.max(top, RANK.get(e.status) ?? -1);
      // A card with any history was found, even one whose only events are notes.
      if (top < 0 && (evs.length || card.status)) top = 0;
      for (let i = 0; i <= top; i++) reached[FUNNEL_STAGES[i] as string]! += 1;
    }
    const appliedAt = evs.find((e) => e.status === 'applied')?.ts;
    if (!appliedAt || !inWindow(appliedAt)) continue;
    applied++;
    const week = weekStart(appliedAt, tz);
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
    const source = card.source?.trim().toLowerCase() || 'unknown';
    const s = bySource.get(source) ?? { applied: 0, replied: 0, interviewed: 0 };
    s.applied++;
    const after = evs.filter((e) => e.ts > appliedAt);
    const reply = after.find(isReply);
    if (reply) {
      replied++;
      s.replied++;
      replyDays.push(days(appliedAt, reply.ts));
    }
    const interview = after.find((e) => e.status === 'interviewing');
    if (interview) {
      interviewed++;
      s.interviewed++;
      interviewDays.push(days(appliedAt, interview.ts));
    }
    bySource.set(source, s);
  }

  const conversion = FUNNEL_STAGES.slice(1).map((stage, i) => {
    // i indexes the previous stage, which exists for every stage after the first.
    const prev = FUNNEL_STAGES[i]!;
    return { from: prev, to: stage, from_count: reached[prev] ?? 0, to_count: reached[stage] ?? 0, rate: rate(reached[stage] ?? 0, reached[prev] ?? 0) };
  });
  return {
    window: { since: since ?? null, until: until ?? null, timezone: tz, from_utc: from, to_utc: to },
    status_counts,
    reached,
    conversion,
    applied: {
      count: applied,
      replied,
      reply_rate: rate(replied, applied),
      interviewed,
      interview_rate: rate(interviewed, applied),
      median_days_to_first_reply: median(replyDays),
      median_days_to_interview: median(interviewDays),
    },
    reply_rate_by_source: [...bySource.entries()]
      .map(([source, s]) => ({ source, ...s, reply_rate: rate(s.replied, s.applied), interview_rate: rate(s.interviewed, s.applied) }))
      .sort((a, b) => b.applied - a.applied || a.source.localeCompare(b.source)),
    weekly_applied: [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week_start, n]) => ({ week_start, applied: n })),
  };
}
