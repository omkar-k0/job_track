#!/usr/bin/env node
// Builds the public website into web-dist/: four pages (home, how it works, install, live demo) and a 404, in
// the board's visual language, with no framework and no external requests. The live demo is the board page,
// unchanged, plus a shim that answers its API from made-up data in the browser. Page sources are in
// dev/web-site/. Vercel runs this (vercel.json); so can you: `node dev/build-web.mjs`.
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
const SITE = join(REPO, 'dev', 'web-site');
const OUT = join(REPO, 'web-dist');

const BANNER = '<p class="demo-banner" role="note">Demo with made-up data. Laufbahn runs locally on your machine — <a href="https://github.com/omkar-k0/laufbahn" rel="noopener">Install from GitHub</a></p>';

// Each edit must match exactly once, so a change to index.html fails the build instead of shipping a page
// without the shim (which would show "This link has no token").
function replaceOnce(html, find, replacement) {
  const parts = html.split(find);
  if (parts.length !== 2) throw new Error(`build-web: expected exactly one ${JSON.stringify(find)} in board/index.html, found ${parts.length - 1}.`);
  return parts.join(replacement);
}

// The site's pages. `out` is the file written to web-dist/; vercel.json sets "cleanUrls", so `href` is what
// the navbar links to and what the host serves it as (/install for install.html).
const PAGES = [
  { src: 'home', out: 'index.html', href: '/', nav: 'Home', title: 'Laufbahn: a calm job-search assistant', description: 'Laufbahn is a calm job-search assistant for Claude Code, built by a master\'s student in Germany as an open-source project. It runs on your own machine.' },
  { src: 'how-it-works', out: 'how-it-works.html', href: '/how-it-works', nav: 'How does it work?', title: 'How Laufbahn works', description: 'From setup to the daily sweep, applying, tracking and the daily report: how Laufbahn runs a job search, and the safety hooks that keep you in charge.' },
  { src: 'install', out: 'install.html', href: '/install', nav: 'Install', title: 'Install Laufbahn', description: 'The one-time steps to install the Laufbahn plugin in Claude Code (or Hermes Agent), and the commands you use after setup.' },
  // The demo page is the board itself (built below), listed here only for the navbar.
  { src: null, out: 'demo.html', href: '/demo', nav: 'Live demo' },
];
const NOT_FOUND = { src: '404', out: '404.html', href: null, title: 'Page not found | Laufbahn', description: 'This page does not exist. Go back to the Laufbahn home page.' };

const escapeHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function navItems(current, indent) {
  return PAGES.map((p) => `${indent}<li><a href="${p.href}"${p.href === current ? ' aria-current="page"' : ''}>${escapeHtml(p.nav)}</a></li>`).join('\n');
}

function renderPage(page) {
  const layout = readFileSync(join(SITE, 'layout.html'), 'utf8');
  const content = readFileSync(join(SITE, 'pages', `${page.src}.html`), 'utf8').trimEnd();
  const values = {
    title: escapeHtml(page.title),
    description: escapeHtml(page.description),
    nav: navItems(page.href, '        '),
    footnav: navItems(page.href, '        '),
    content,
  };
  // One pass over the layout, so a "{{...}}" inside a page body is never mistaken for a placeholder.
  return layout.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`build-web: unknown placeholder {{${key}}} in dev/web-site/layout.html.`);
    return values[key];
  });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const page of [...PAGES.filter((p) => p.src), NOT_FOUND]) writeFileSync(join(OUT, page.out), renderPage(page));
copyFileSync(join(SITE, 'site.css'), join(OUT, 'site.css'));
copyFileSync(join(SITE, 'site.js'), join(OUT, 'site.js'));

let html = readFileSync(join(BOARD, 'index.html'), 'utf8');
html = replaceOnce(html, '<title>Laufbahn</title>', '<title>Laufbahn (demo)</title>\n<meta name="description" content="A read-only demo of the Laufbahn job-search board, with made-up data.">');
html = replaceOnce(html, '<link rel="stylesheet" href="/board.css">', '<link rel="stylesheet" href="/board.css">\n<link rel="stylesheet" href="/demo.css">');
// Module scripts run in document order, so the shim patches fetch and sets the token before board.js starts.
html = replaceOnce(html, '<script type="module" src="/board.js"></script>', '<script type="module" src="/demo.js"></script>\n<script type="module" src="/board.js"></script>');
html = replaceOnce(html, '<header>', `${BANNER}\n<header>`);
// A way back to the site, in the board's own header row (before the theme button), styled in demo.css.
html = replaceOnce(html, '<button type="button" id="theme"', '<a class="site-back" href="/">&larr; Back to site</a>\n    <button type="button" id="theme"');
writeFileSync(join(OUT, 'demo.html'), html);

for (const f of ['board.css', 'board.js']) copyFileSync(join(BOARD, f), join(OUT, f));
copyFileSync(join(DEMO, 'demo.js'), join(OUT, 'demo.js'));
copyFileSync(join(DEMO, 'demo.css'), join(OUT, 'demo.css'));
// Served as .js: some static servers do not know the .mjs type, and a module script needs a JavaScript one.
copyFileSync(join(DEMO, 'fixtures.mjs'), join(OUT, 'fixtures.js'));

process.stderr.write(`build-web: wrote ${OUT}\n`);
