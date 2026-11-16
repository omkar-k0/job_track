// Runs skills/triage-tracker/guard.js against the synthetic board in headless Chrome (AC8).
// Skips when no Chrome that can render is installed (tests/chrome.ts, shared with tracker/board-ui.test.ts).

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dumpDom, pickChrome } from './chrome.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const board = readFileSync(join(root, 'tests/fixtures/jobcopilot-board.html'), 'utf8');
const guard = readFileSync(join(root, 'plugin/skills/triage-tracker/guard.js'), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'guard-'));
after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));

// One probe decides for the whole file (see chrome.ts).
const { chrome: CHROME, skip: SKIP } = await pickChrome(dir);

// The parts of the JOBHUNT_TRIAGE_GUARD output these tests read.
interface GuardOut {
  ok: boolean;
  problems: string[];
  count?: number;
  protected: Record<string, { count: number; checked: number }>;
  extra: string[];
  delete_controls: { label: string }[];
}

// check: [[column, title], ...] boxes to tick before running the guard.
async function runGuard(input: Record<string, unknown>, check: [string, string][]): Promise<GuardOut> {
  assert.ok(CHROME, 'Chrome not found');
  const script = `
    window.onerror = (msg, src, line, col) => { const e = document.createElement('pre'); e.id = 'err'; e.textContent = msg + ' @' + line + ':' + col; document.body.appendChild(e); };
    for (const [col, title] of ${JSON.stringify(check)}) {
      const column = [...document.querySelectorAll('.at-card')].find((c) => c.querySelector('.at-title').textContent === col);
      const job = [...column.querySelectorAll('.job')].find((j) => j.querySelector('.job-title').textContent === title);
      job.querySelector('input').checked = true;
    }
    const line = ${guard.replace('__JOBHUNT_GUARD_INPUT__', JSON.stringify(input))};
    const pre = document.createElement('pre'); pre.id = 'out'; pre.textContent = line; document.body.appendChild(pre);`;
  const file = join(dir, `case-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, board.replace('</body>', `<script>${script}</script></body>`));
  // Chrome launches have exceeded 30s on CI; allow more time on slow runners.
  const dom = await dumpDom(CHROME, `file://${file}`, 120000, { profileDir: dir });
  const m = dom.match(/<pre id="out">JOBHUNT_TRIAGE_GUARD (\{.*?\}) JOBHUNT_END<\/pre>/s);
  assert.ok(m, `guard produced no output: ${(dom.match(/<pre id="err">[^<]*/) || [dom.slice(-300)])[0]}`);
  // &amp; goes last, so a title containing "&lt;" is not decoded twice.
  return JSON.parse(m[1]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

const base = { column: 'Saved', protectedColumns: ['Applied'], allColumns: ['Applied', 'Saved', 'Interviewing', 'Offer', 'Rejected'] };

test('AC8 guard: resolves Saved by header text even though Applied is the first .at-card', { skip: SKIP }, async () => {
  const r = await runGuard({ ...base, intended: ['Backend Engineer', 'Frontend Lead'], expectedCounts: { Applied: 5 } }, [['Saved', 'Backend Engineer'], ['Saved', 'Frontend Lead']]);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.count, 4);
  assert.deepEqual(r.protected.Applied, { count: 5, checked: 0 });
  assert.equal(r.delete_controls[0]?.label, 'Delete selected');
});

test('AC8 guard: a checked card in Applied (identical markup) fails', { skip: SKIP }, async () => {
  const r = await runGuard({ ...base, intended: ['Senior Engineer'] }, [['Saved', 'Senior Engineer'], ['Applied', 'Senior Engineer']]);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /protected column "Applied" has 1 checked/.test(p)));
});

test('AC8 guard: selection must equal the intended list exactly', { skip: SKIP }, async () => {
  const r = await runGuard({ ...base, intended: ['Backend Engineer'] }, [['Saved', 'Backend Engineer'], ['Saved', 'Product Engineer']]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.extra, ['Product Engineer']);
});

test('AC8 guard: a changed protected count fails', { skip: SKIP }, async () => {
  const r = await runGuard({ ...base, intended: ['Backend Engineer'], expectedCounts: { Applied: 6 } }, [['Saved', 'Backend Engineer']]);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /count changed: expected 6, now 5/.test(p)));
});
