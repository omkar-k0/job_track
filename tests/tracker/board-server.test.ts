import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { request } from 'node:http';
import { test } from 'node:test';
import { createBoardServer } from '../../plugin/servers/tracker/src/board-server.ts';
import type { Tracker } from '../../plugin/servers/tracker/src/tracker.ts';
import { seeded, seededRich } from './board-seed.ts';

const TOKEN = 'a'.repeat(64);

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

async function board({ idleMs = 60_000, onIdle = () => {}, tracker, rich = false }: { idleMs?: number; onIdle?: () => void; tracker?: Tracker; rich?: boolean } = {}) {
  // The rich seed's extra ids are only used by tests that ask for it.
  const s = (rich ? seededRich() : seeded()) as ReturnType<typeof seededRich>;
  const server = createBoardServer({ tracker: tracker ?? s.t, token: TOKEN, idleMs, onIdle });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const port = addr.port;
  const send = (method: string, path: string, { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {}) =>
    new Promise<Reply>((done, fail) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
      });
      req.on('error', fail);
      req.end(body);
    });
  const auth = { authorization: `Bearer ${TOKEN}` };
  // What the board page's fetch sends on a write.
  const page = { ...auth, origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' };
  const json = { ...page, 'content-type': 'application/json' };
  const close = () =>
    new Promise<void>((done) => {
      server.closeAllConnections();
      server.close(() => done());
    });
  return { ...s, port, send, auth, page, json, close };
}

test('API calls without the token, or with a wrong one, get 401', async () => {
  const b = await board();
  try {
    assert.equal((await b.send('GET', '/api/board')).status, 401);
    assert.equal((await b.send('GET', '/api/health', { headers: { authorization: `Bearer ${'b'.repeat(64)}` } })).status, 401);
    assert.equal((await b.send('GET', '/api/health', { headers: { authorization: 'Bearer short' } })).status, 401);
  } finally {
    await b.close();
  }
});

test('a foreign Host header gets 421, even with the token (DNS rebinding)', async () => {
  const b = await board();
  try {
    assert.equal((await b.send('GET', '/', { headers: { host: `evil.example:${b.port}` } })).status, 421);
    assert.equal((await b.send('GET', '/api/board', { headers: { ...b.auth, host: `evil.example:${b.port}` } })).status, 421);
    assert.equal((await b.send('GET', '/api/health', { headers: { ...b.auth, host: `localhost:${b.port}` } })).status, 200);
  } finally {
    await b.close();
  }
});

test('the page is static, carries no data and sends a strict CSP', async () => {
  const b = await board();
  try {
    const page = await b.send('GET', '/');
    assert.equal(page.status, 200);
    assert.match(String(page.headers['content-security-policy']), /default-src 'none'; script-src 'self'/);
    assert.equal(page.headers['referrer-policy'], 'no-referrer');
    assert.equal(page.headers['access-control-allow-origin'], undefined);
    assert.doesNotMatch(page.body, /Northwind/);
    assert.match((await b.send('GET', '/board.js')).headers['content-type'] ?? '', /text\/javascript/);
    assert.match((await b.send('GET', '/board.css')).headers['content-type'] ?? '', /text\/css/);
    assert.equal((await b.send('GET', '/nope')).status, 404);
  } finally {
    await b.close();
  }
});

test('the board serves bundled fonts under its same-origin font policy', async () => {
  const b = await board();
  try {
    const page = await b.send('GET', '/');
    assert.match(String(page.headers['content-security-policy']), /font-src 'self';/);
    for (const family of ['geist', 'geist-mono', 'petrona', 'petrona-italic']) {
      for (const subset of ['latin', 'latin-ext']) {
        const font = await b.send('GET', `/fonts/${family}-${subset}.woff2`);
        assert.equal(font.status, 200);
        assert.equal(font.headers['content-type'], 'font/woff2');
        assert.ok(font.body.startsWith('wOF2'), 'serves a WOFF2 font');
      }
    }
    assert.equal((await b.send('GET', '/fonts/unknown.woff2')).status, 404);
  } finally {
    await b.close();
  }
});

test('the board data and moves go through the tracker rules', async () => {
  const b = await board();
  try {
    const view = JSON.parse((await b.send('GET', '/api/board', { headers: b.auth })).body);
    assert.ok(view.roles.some((r: { company: string }) => r.company === 'Northwind'));
    const ok = await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ role_id: b.scored, to: 'queued', reason: 'Moved on the board' }) });
    assert.equal(ok.status, 200);
    assert.equal(b.t.roleDetail({ role_id: b.scored }).events.at(-1)?.actor, 'user');
    const sweep = await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ role_id: b.found, to: 'applied', reason: 'r', evidence: 'e' }) });
    assert.equal(sweep.status, 400);
    assert.match(JSON.parse(sweep.body).error, /still in the sweep \(found\)/);
    const back = await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ role_id: b.scored, to: 'scored' }) });
    assert.equal(back.status, 200);
    const noEvidence = await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ role_id: b.scored, to: 'dropped' }) });
    assert.equal(noEvidence.status, 200);
    assert.equal(b.t.roleRow(b.scored)?.status, 'dropped');
    const verified = await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ role_id: b.queued, to: 'verified', reason: 'r' }) });
    assert.equal(verified.status, 400);
  } finally {
    await b.close();
  }
});

test('posts must be JSON, small and well formed', async () => {
  const b = await board();
  try {
    const body = JSON.stringify({ role_id: b.scored, to: 'queued', reason: 'r' });
    assert.equal((await b.send('POST', '/api/move', { headers: { ...b.page, 'content-type': 'text/plain' }, body })).status, 415);
    assert.equal((await b.send('POST', '/api/move', { headers: b.json, body: '{oops' })).status, 400);
    assert.equal((await b.send('POST', '/api/move', { headers: b.json, body: JSON.stringify({ reason: 'x'.repeat(70 * 1024) }) })).status, 413);
  } finally {
    await b.close();
  }
});

test('the idle timer fires after idleMs without an authenticated API call', async () => {
  let fired: () => void = () => {};
  const idle = new Promise<void>((done) => {
    fired = done;
  });
  const b = await board({ idleMs: 100, onIdle: () => fired() });
  try {
    await idle;
  } finally {
    await b.close();
  }
});

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

test('odd request targets are refused after the Host check, never a 500', async () => {
  const b = await board();
  try {
    assert.equal((await b.send('GET', '//')).status, 400);
    assert.equal((await b.send('GET', '//x/api/board', { headers: b.auth })).status, 400);
    assert.equal((await b.send('GET', '//', { headers: { host: `evil.example:${b.port}` } })).status, 421);
    assert.equal((await b.send('GET', '/api/health?x=1', { headers: b.auth })).status, 200);
  } finally {
    await b.close();
  }
});

test('the content type must be exactly application/json', async () => {
  const b = await board();
  try {
    const body = JSON.stringify({ role_id: b.scored, to: 'queued', reason: 'r' });
    assert.equal((await b.send('POST', '/api/move', { headers: { ...b.page, 'content-type': 'application/jsonp' }, body })).status, 415);
    assert.equal((await b.send('POST', '/api/move', { headers: { ...b.page, 'content-type': 'application/json; charset=utf-8' }, body })).status, 200);
  } finally {
    await b.close();
  }
});

test('no CORS headers, even on a preflight', async () => {
  const b = await board();
  try {
    const r = await b.send('OPTIONS', '/api/move', { headers: { ...b.auth, origin: 'https://evil.example' } });
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    assert.equal(r.headers['access-control-allow-methods'], undefined);
  } finally {
    await b.close();
  }
});

test('an internal failure answers a generic 500', async () => {
  const s = seeded();
  const broken = Object.create(s.t, {
    q: {
      value: () => {
        throw new Error('Northwind secret');
      },
    },
  }) as Tracker;
  const b = await board({ tracker: broken });
  try {
    const r = await b.send('GET', '/api/board', { headers: b.auth });
    assert.equal(r.status, 500);
    assert.equal(r.body, '{"error":"Internal error."}');
  } finally {
    await b.close();
  }
});

test('onIdle runs once, and only authenticated calls defer it', async () => {
  let calls = 0;
  const b = await board({ idleMs: 150, onIdle: () => calls++ });
  try {
    await sleep(100);
    await b.send('GET', '/api/health', { headers: b.auth });
    await sleep(100); // 200 ms since start: would have fired without the call
    assert.equal(calls, 0);
    await sleep(100);
    assert.equal(calls, 1);
    await b.send('GET', '/api/health', { headers: b.auth });
    await sleep(250);
    assert.equal(calls, 1);
  } finally {
    await b.close();
  }
});

test('unauthenticated probes do not defer onIdle', async () => {
  let calls = 0;
  const b = await board({ idleMs: 150, onIdle: () => calls++ });
  try {
    await sleep(100);
    assert.equal((await b.send('GET', '/api/health')).status, 401);
    await sleep(100);
    assert.equal(calls, 1);
  } finally {
    await b.close();
  }
});

test('a note is posted to /api/note and recorded as the user', async () => {
  const b = await board();
  try {
    const res = await b.send('POST', '/api/note', { headers: b.json, body: JSON.stringify({ role_id: b.queued, reason: 'Recruiter says remote is fine' }) });
    assert.equal(res.status, 200);
    const ev = b.t.roleDetail({ role_id: b.queued }).events.at(-1);
    assert.equal(ev?.reason, 'Recruiter says remote is fine');
    assert.equal(ev?.actor, 'user');
    assert.equal((await b.send('POST', '/api/note', { headers: b.json, body: JSON.stringify({ role_id: b.queued }) })).status, 400);
    assert.equal((await b.send('POST', '/api/note', { body: '{}' })).status, 401);
  } finally {
    await b.close();
  }
});

test('writes are accepted only from the board page itself', async () => {
  const b = await board();
  try {
    const body = JSON.stringify({ role_id: b.scored, to: 'queued' });
    const post = (headers: Record<string, string>) => b.send('POST', '/api/move', { headers: { ...b.auth, 'content-type': 'application/json', ...headers }, body });
    // A script with the token but no browser headers (curl, fetch from Node).
    const script = await post({});
    assert.equal(script.status, 403);
    assert.match(JSON.parse(script.body).error, /board page/);
    assert.equal((await post({ origin: 'http://evil.example' })).status, 403);
    assert.equal((await post({ origin: `http://127.0.0.1:${b.port}`, 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal(b.t.roleRow(b.scored)?.status, 'scored');
    // localhost is the same board, so its own origin is fine.
    assert.equal((await post({ host: `localhost:${b.port}`, origin: `http://localhost:${b.port}`, 'sec-fetch-site': 'same-origin' })).status, 200);
    // Reads stay open to any token holder.
    assert.equal((await b.send('GET', '/api/board', { headers: b.auth })).status, 200);
  } finally {
    await b.close();
  }
});

test('the role endpoint needs the token and the right host, and unknown or odd ids are 404', async () => {
  const b = await board({ rich: true });
  try {
    assert.equal((await b.send('GET', `/api/role/${b.queued}`)).status, 401);
    assert.equal((await b.send('GET', `/api/role/${b.queued}`, { headers: { ...b.auth, host: `evil.example:${b.port}` } })).status, 421);
    const ok = await b.send('GET', `/api/role/${b.interviewing}`, { headers: b.auth });
    assert.equal(ok.status, 200);
    const d = JSON.parse(ok.body);
    assert.equal(d.company.name, 'Adventure Works');
    assert.equal(d.interviews.length, 2);
    assert.ok(d.events.length > 3);
    assert.equal((await b.send('GET', '/api/role/9999', { headers: b.auth })).status, 404);
    assert.match(JSON.parse((await b.send('GET', '/api/role/9999', { headers: b.auth })).body).error, /No role 9999/);
    for (const path of ['/api/role/abc', '/api/role/', '/api/role/1/2', '/api/role/-1', '/api/role/1e3', `/api/role/${'9'.repeat(13)}`, '/api/role/%31']) assert.equal((await b.send('GET', path, { headers: b.auth })).status, 404, path);
    // Reading a role writes nothing, and a POST to it is not a route.
    assert.equal((await b.send('POST', `/api/role/${b.queued}`, { headers: b.json, body: '{}' })).status, 404);
    assert.equal(b.t.roleRow(b.queued)?.status, 'queued');
  } finally {
    await b.close();
  }
});

test('the board view carries the stats the header shows', async () => {
  const b = await board({ rich: true });
  try {
    const view = JSON.parse((await b.send('GET', '/api/board', { headers: b.auth })).body);
    assert.equal(view.stats.counts.applied, 1);
    assert.equal(view.stats.reply_rate, 0.75);
    assert.equal(view.stats.upcoming_interviews.length, 1);
  } finally {
    await b.close();
  }
});

test('a request that a browser marks as cross-site is refused even with the token, reads included', async () => {
  const b = await board({ rich: true });
  try {
    for (const site of ['cross-site', 'same-site']) {
      assert.equal((await b.send('GET', '/api/board', { headers: { ...b.auth, 'sec-fetch-site': site } })).status, 403, site);
      assert.equal((await b.send('GET', `/api/role/${b.queued}`, { headers: { ...b.auth, 'sec-fetch-site': site } })).status, 403, site);
      assert.equal((await b.send('GET', '/api/health', { headers: { ...b.auth, 'sec-fetch-site': site } })).status, 403, site);
    }
    for (const site of ['same-origin', 'none']) assert.equal((await b.send('GET', '/api/board', { headers: { ...b.auth, 'sec-fetch-site': site } })).status, 200, site);
    // The wrong token is still 401 first, so this does not reveal that a token would have worked.
    assert.equal((await b.send('GET', '/api/board', { headers: { authorization: 'Bearer nope', 'sec-fetch-site': 'cross-site' } })).status, 401);
  } finally {
    await b.close();
  }
});

test('writes from another origin, another port or a rebinding name are refused whatever else they send', async () => {
  const b = await board();
  try {
    const body = JSON.stringify({ role_id: b.scored, to: 'queued' });
    const post = (headers: Record<string, string>) => b.send('POST', '/api/move', { headers: { ...b.auth, 'content-type': 'application/json', ...headers }, body });
    // Another local service on 127.0.0.1 (another port) has a different origin.
    assert.equal((await post({ origin: `http://127.0.0.1:${b.port + 1}`, 'sec-fetch-site': 'same-site' })).status, 403);
    // A page on the rebinding name: Host and Origin agree with each other, but Host is not ours.
    assert.equal((await post({ host: `evil.example:${b.port}`, origin: `http://evil.example:${b.port}`, 'sec-fetch-site': 'same-origin' })).status, 421);
    // https or null origins are never the board.
    assert.equal((await post({ origin: `https://127.0.0.1:${b.port}`, 'sec-fetch-site': 'same-origin' })).status, 403);
    assert.equal((await post({ origin: 'null' })).status, 403);
    assert.equal((await post({ origin: `http://127.0.0.1:${b.port}`, 'sec-fetch-site': 'none' })).status, 403, 'a navigation is not a fetch from the page');
    assert.equal(b.t.roleRow(b.scored)?.status, 'scored');
    assert.equal((await post({ origin: `http://127.0.0.1:${b.port}`, 'sec-fetch-site': 'same-origin' })).status, 200);
  } finally {
    await b.close();
  }
});

test('every page and API answer says nothing else may embed, read or share a window with the board', async () => {
  const b = await board();
  try {
    for (const path of ['/', '/board.js', '/board.css', '/nope']) {
      const r = await b.send('GET', path);
      assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin', path);
      assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin', path);
      assert.equal(r.headers['x-frame-options'], 'DENY', path);
      assert.match(String(r.headers['content-security-policy']), /frame-ancestors 'none'/, path);
    }
    const api = await b.send('GET', '/api/board', { headers: b.auth });
    assert.equal(api.headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(api.headers['cache-control'], 'no-store');
    // No inline script or style may run: the CSP has no 'unsafe-inline' and no eval.
    assert.doesNotMatch(String(api.headers['content-security-policy']), /unsafe-/);
  } finally {
    await b.close();
  }
});

// A backstop for the Chrome tests in board-ui.test.ts, which skip when no browser renders: untrusted text must only
// reach the page through textContent and attribute setters.
test('the page source never builds markup, evaluates strings or uses inline handlers', () => {
  const dir = new URL('../../plugin/servers/tracker/src/board/', import.meta.url);
  const js = readFileSync(new URL('board.js', dir), 'utf8');
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  const css = readFileSync(new URL('board.css', dir), 'utf8');
  for (const sink of [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\b/, /\.srcdoc\b/, /setTimeout\(\s*['"`]/, /setInterval\(\s*['"`]/, /\.createContextualFragment/, /DOMParser/, /import\s*\(/, /setAttribute\(\s*['"]on/, /setAttribute\(\s*['"]style/]) {
    assert.doesNotMatch(js, sink, `board.js uses ${sink}`);
  }
  // Links built from data go through safeHref; nothing assigns href or src from a raw field.
  for (const m of js.matchAll(/\.(href|src)\s*=\s*([^;\n]+)/g)) assert.match(m[2] ?? '', /^(href|url\.href)\b|safeHref/, `unvetted ${m[0]}`);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'no inline script');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'no inline handler');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'no inline style attribute');
  assert.doesNotMatch(`${html}${css}${js}`, /https?:\/\/(?!www\.w3\.org\/2000\/svg)[a-z0-9.-]+\.[a-z]{2,}/i, 'no external host: no CDN, no remote font');
});
