#!/usr/bin/env node
// Builds the public web demo into web-dist/: the board page, unchanged, plus a shim that answers its API
// from made-up data in the browser. Vercel runs this (vercel.json); so can you: `node dev/build-web.mjs`.
// Plain JS with no dependencies, so any Node can run it without type stripping or an install step.
//
// Why a shim and not the real server: the board's server is part of a local plugin (stdio MCP server on
// node:sqlite, listening on 127.0.0.1 only), so it cannot run on a static host, and it must never hold real
// data anywhere public.

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = join(REPO, 'plugin', 'servers', 'tracker', 'src', 'board');
const DEMO = join(REPO, 'dev', 'web-demo');
const OUT = join(REPO, 'web-dist');

const BANNER = '<p class="demo-banner" role="note">Demo with made-up data. Laufbahn runs locally on your machine — <a href="https://github.com/omkar-k0/laufbahn" rel="noopener">Install from GitHub</a></p>';

// Each edit must match exactly once, so a change to index.html fails the build instead of shipping a page
// without the shim (which would show "This link has no token").
function replaceOnce(html, find, replacement) {
  const parts = html.split(find);
  if (parts.length !== 2) throw new Error(`build-web: expected exactly one ${JSON.stringify(find)} in board/index.html, found ${parts.length - 1}.`);
  return parts.join(replacement);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let html = readFileSync(join(BOARD, 'index.html'), 'utf8');
html = replaceOnce(html, '<title>Laufbahn</title>', '<title>Laufbahn (demo)</title>\n<meta name="description" content="A read-only demo of the Laufbahn job-search board, with made-up data.">');
html = replaceOnce(html, '<link rel="stylesheet" href="/board.css">', '<link rel="stylesheet" href="/board.css">\n<link rel="stylesheet" href="/demo.css">');
// Module scripts run in document order, so the shim patches fetch and sets the token before board.js starts.
html = replaceOnce(html, '<script type="module" src="/board.js"></script>', '<script type="module" src="/demo.js"></script>\n<script type="module" src="/board.js"></script>');
html = replaceOnce(html, '<header>', `${BANNER}\n<header>`);
writeFileSync(join(OUT, 'index.html'), html);

for (const f of ['board.css', 'board.js']) copyFileSync(join(BOARD, f), join(OUT, f));
copyFileSync(join(DEMO, 'demo.js'), join(OUT, 'demo.js'));
copyFileSync(join(DEMO, 'demo.css'), join(OUT, 'demo.css'));
// Served as .js: some static servers do not know the .mjs type, and a module script needs a JavaScript one.
copyFileSync(join(DEMO, 'fixtures.mjs'), join(OUT, 'fixtures.js'));

process.stderr.write(`build-web: wrote ${OUT}\n`);
