// The board page in headless Chrome against the real board server: filters from the URL hash, the table view, the role
// drawer, and that scraped text (company names, titles, notes) is shown as text and never becomes markup.
// Skips when no Chrome that can render is installed, probed once and briefly so a sandboxed container with a hanging
// Chrome skips in seconds instead of timing out test by test. CI does not probe: a slow runner must fail loudly.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createBoardServer } from '../../plugin/servers/tracker/src/board-server.ts';
import { dumpDom, pickChrome } from '../chrome.ts';
import { seededRich } from './board-seed.ts';

const TOKEN = 'c'.repeat(64);
const dir = mkdtempSync(join(tmpdir(), 'jh-board-ui-'));
after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

// One probe decides for the whole file (see ../chrome.ts, shared with guard.test.ts).
const { chrome, skip: SKIP } = await pickChrome(dir);

async function boardPage(setup?: (s: ReturnType<typeof seededRich>) => void) {
  const s = seededRich();
  setup?.(s);
  const server = createBoardServer({ tracker: s.t, token: TOKEN, idleMs: 120_000, onIdle: () => {} });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const dom = (hash: string) => {
    assert.ok(chrome);
    return dumpDom(chrome, `http://127.0.0.1:${addr.port}/#t=${TOKEN}${hash ? `&${hash}` : ''}`, 30_000, { profileDir: dir, extraArgs: ['--virtual-time-budget=4000'] });
  };
  const close = () =>
    new Promise<void>((done) => {
      server.closeAllConnections();
      server.close(() => done());
    });
  return { ...s, dom, close };
}

// A tag whose attribute list (names, then quoted values) has an on... attribute; text inside a value does not count.
const HANDLER = /<[a-z][a-z0-9]*(?:\s+[\w:-]+(?:="[^"]*")?)*\s+on[a-z]+=/i;
const count = (dom: string, re: RegExp) => (dom.match(re) ?? []).length;
const cards = (dom: string) => count(dom, /<article class="card/g);
const rows = (dom: string) => count(dom, /<tr data-id=/g);

test('the page lists every lane card and the stats header', { skip: SKIP, timeout: 60_000 }, async () => {
  const b = await boardPage();
  try {
    const dom = await b.dom('');
    // found is counted, not a lane: 9 roles, 8 on the board.
    assert.equal(cards(dom), 8);
    assert.match(dom, /Applied this week<\/dt>/);
    assert.match(dom, /Reply rate<\/dt><dd><span class="big">75%<\/span>/);
    assert.match(dom, /Upcoming interviews<\/dt><dd><span class="big">1<\/span>/);
    assert.match(dom, /id="count" aria-live="polite">9 roles</);
  } finally {
    await b.close();
  }
});

test('search, filters and sort come from the URL hash and apply without a reload', { skip: SKIP, timeout: 60_000 }, async () => {
  const b = await boardPage();
  try {
    assert.equal(cards(await b.dom('q=contoso')), 1);
    assert.equal(cards(await b.dom('q=platform%20engineer')), 2, 'every term must match: Contoso and Adventure Works');
    assert.equal(cards(await b.dom('q=zzz')), 0);
    assert.match(await b.dom('q=zzz'), /No roles match/);
    assert.equal(rows(await b.dom('view=table&status=queued')), 1);
    assert.equal(rows(await b.dom('view=table&smin=8.5')), 4);
    assert.equal(rows(await b.dom('view=table&smin=8&smax=9')), 4, 'a score range is inclusive');
    assert.equal(rows(await b.dom('view=table&need=1')), 2, 'a question and a booking to make');
    assert.equal(rows(await b.dom('view=table&mode=hybrid')), 1);
    assert.equal(rows(await b.dom('view=table&source=linkedin')), 2);
    assert.equal(rows(await b.dom('view=table&status=found')), 1, 'roles still in the sweep are listed in the table');
    assert.match(await b.dom('status=found'), /still in the sweep/);
    const sorted = await b.dom('view=table&sort=company&dir=asc');
    const names = [...sorted.matchAll(/<td class="company-cell"><button class="row-open"[^>]*>([^<]*)</g)].map((m) => m[1] ?? '');
    assert.deepEqual(names, [...names].sort((a, c) => a.localeCompare(c)));
    assert.match(sorted, /<th scope="col" aria-sort="ascending">/);
  } finally {
    await b.close();
  }
});

test('the role drawer shows the posting, interviews, artifacts and the timeline', { skip: SKIP, timeout: 60_000 }, async () => {
  const b = await boardPage();
  try {
    const dom = await b.dom(`role=${b.interviewing}`);
    const drawer = dom.slice(dom.indexOf('<aside id="drawer"'));
    assert.match(drawer, /<h2 [^>]*id="drawer-title"[^>]*>Adventure Works<\/h2>/);
    assert.match(drawer, /Hiring manager screen/);
    assert.match(drawer, /href="https:\/\/meet\.example\.com\/abc"[^>]*rel="noopener noreferrer"/);
    assert.match(drawer, /Cover note/);
    assert.match(drawer, /Gmail draft/);
    assert.match(drawer, /Recruiter said the team is small/);
    assert.match(drawer, /Book the System design interview/);
    assert.match(drawer, /<select name="to">/);
  } finally {
    await b.close();
  }
});

test('scraped text is shown as text: names, titles, notes and sources never become markup', { skip: SKIP, timeout: 60_000 }, async () => {
  const b = await boardPage();
  try {
    for (const hash of ['', 'view=table', `role=${b.hostile}`, `view=table&role=${b.hostile}`]) {
      const dom = await b.dom(hash);
      assert.match(dom, /<title>Job Tracker board<\/title>/, `title untouched (${hash})`);
      assert.doesNotMatch(dom, /<img\b/i, `no <img> element made from data (${hash})`);
      assert.doesNotMatch(dom, /<svg onload/i);
      assert.doesNotMatch(dom, /<script>document/i);
      assert.doesNotMatch(dom, HANDLER, `no event-handler attribute (${hash})`);
      assert.match(dom, /&lt;img src=x onerror=/, `the text itself is there (${hash})`);
    }
    assert.match(await b.dom(`role=${b.hostile}`), /&lt;img src=x onerror=alert\(2\)&gt; note/, 'a note is text in the timeline');
  } finally {
    await b.close();
  }
});

test('only http and https links are made clickable', { skip: SKIP, timeout: 60_000 }, async () => {
  const b = await boardPage((s) => {
    s.t.run("UPDATE roles SET url = 'javascript:alert(1)' WHERE id = ?", s.scored);
    s.t.run("UPDATE interviews SET link = 'javascript:alert(3)' WHERE role_id = ?", s.interviewing);
  });
  try {
    for (const hash of ['', `role=${b.scored}`, `role=${b.interviewing}`]) {
      const dom = await b.dom(hash);
      assert.doesNotMatch(dom, /href="javascript:/i, hash);
      assert.match(dom, /<article class="card[^>]*aria-label="Contoso/);
    }
    assert.match(await b.dom(`role=${b.interviewing}`), /javascript:alert\(3\)/, 'shown as text so the user can see it');
  } finally {
    await b.close();
  }
});
