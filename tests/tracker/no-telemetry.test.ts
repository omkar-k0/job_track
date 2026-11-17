// The plugin makes no outbound network calls of its own: no analytics, no crash reports. The only HTTP it speaks
// is to the local board on loopback (board-launch.ts health check, and the board page calling its own /api/).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const plugin = fileURLToPath(new URL('../../plugin/', import.meta.url));
const TEXT = /\.(ts|js|mjs|cjs|py|json|md|ya?ml|html|css|sh|txt)$/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
    return TEXT.test(e.name) ? [p] : [];
  });
}

const sources = files(plugin).map((p) => ({ path: relative(plugin, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));
const LOOPBACK = /^[`'"]https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])[:/]/;

test('the plugin tree is scanned (sanity check for the tests below)', () => {
  assert.ok(sources.some((s) => s.path === 'servers/tracker/src/tracker.ts'));
  assert.ok(sources.some((s) => s.path === 'hooks/gates.ts'));
});

test('no file under plugin/ mentions PostHog', () => {
  const hits = sources.filter((s) => /posthog/i.test(s.text)).map((s) => s.path);
  assert.deepEqual(hits, []);
});

test('no file under plugin/ sends to a non-loopback host with fetch', () => {
  const bad: string[] = [];
  for (const { path, text } of sources) {
    for (const m of text.matchAll(/\bfetch\(\s*([^,)]*)/g)) {
      const arg = (m[1] ?? '').trim();
      if (LOOPBACK.test(arg)) continue;
      // The board page's api() helper: a relative path, so the browser sends it to the page's own loopback origin.
      if (path === 'servers/tracker/src/board/board.js' && arg === 'path') continue;
      bad.push(`${path}: fetch(${arg}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("the board page's api() helper is only ever called with its own /api/ paths", () => {
  const board = sources.find((s) => s.path === 'servers/tracker/src/board/board.js');
  assert.ok(board);
  const calls = [...board.text.matchAll(/\bapi\(\s*([^,)]*)/g)].map((m) => (m[1] ?? '').trim()).filter((a) => a !== 'path');
  assert.ok(calls.length > 0);
  // A literal or template path that starts with /api/: same origin, so the board's own loopback server.
  for (const arg of calls) assert.match(arg, /^(['`])\/api\/[a-z]/);
});

test('no node:http(s) client, socket or beacon is used under plugin/', () => {
  const hits = sources.filter((s) => /\bfrom 'node:https'|\bhttps?\.request\(|\bhttps?\.get\(|\bnet\.connect\(|\bsendBeacon\(|\bnew WebSocket\(|\bXMLHttpRequest\b/.test(s.text)).map((s) => s.path);
  assert.deepEqual(hits, []);
});
