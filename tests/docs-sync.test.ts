// The usage docs (docs/usage.md): stays in sync with the plugin's package.json and commands.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const readRepo = (p: string) => readFileSync(join(REPO, p), 'utf8');

const pkg = JSON.parse(readRepo('plugin/package.json'));
const docs = readRepo('docs/usage.md');

test('docs page cites the Node.js engine requirement from package.json', () => {
  const engine = pkg.engines.node; // e.g. ">=22.18"
  assert.ok(engine, 'package.json has engines.node');
  // Strip the leading ">>=" or ">=" to get the version digits for the regex
  const version = engine.replace(/^>=\s*/, '');
  assert.match(docs, new RegExp(`Node\\.js\\s+${version.replace('.', '\\.')}`), 'docs mentions Node version');
});

test('docs page lists every shipped command', () => {
  const commandFiles = readdirSync(join(REPO, 'plugin', 'commands'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''));

  for (const name of commandFiles) {
    // Commands ship as /job-tracker:<name> in the docs
    assert.match(
      docs,
      new RegExp(`/job-tracker:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      `docs mentions /job-tracker:${name}`,
    );
  }
});

test('docs page has expected sections', () => {
  const sections = ['Requirements', 'Install', 'Setup walkthrough', 'Commands', 'Your data', 'Developer docs'];
  for (const title of sections) {
    assert.ok(docs.includes(`\n## ${title}\n`), `docs has a "## ${title}" section`);
    assert.ok(docs.includes(`](#${title.toLowerCase().replace(/ /g, '-')})`), `docs table of contents links to ${title}`);
  }
});

test('docs page links to the GitHub repo', () => {
  assert.ok(
    docs.includes('github.com/omkar-k0/job_track'),
    'docs links to GitHub repo',
  );
});

test('docs page links to privacy policy', () => {
  assert.ok(
    docs.includes('../PRIVACY.md'),
    'docs links to privacy policy',
  );
});

test('docs page links to developer docs in the repo', () => {
  assert.ok(docs.includes('../README.md'), 'docs links to README');
  assert.ok(docs.includes('../CONTRIBUTING.md'), 'docs links to CONTRIBUTING');
});

test('docs page install steps match the marketplace manifest', () => {
  const market = JSON.parse(readRepo('.claude-plugin/marketplace.json'));
  assert.ok(docs.includes(`/plugin install job-tracker@${market.name}`), 'docs install line uses the marketplace name');
  assert.ok(docs.includes('/plugin marketplace add omkar-k0/job_track'), 'docs marketplace add line');
});
