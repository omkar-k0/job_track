// Headless Chrome for the page tests (guard.test.ts, tracker/board-ui.test.ts): one way to find it, run it and
// decide whether to skip.
//
// Chrome that is installed but cannot render (no display bus or network inside a sandboxed container) hangs on
// --dump-dom until each test's timeout. One short probe per test file decides for the whole file, so such a machine
// skips in seconds instead of failing test by test after minutes. CI does not probe: a slow runner must fail
// loudly, not skip.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Chrome {
  path: string;
  // chrome-headless-shell is headless already and rejects --headless=new.
  shell: boolean;
}

const PROBE_MS = 10_000;

// CHROME_PATH first, then Playwright's headless shell (fastest to start, and what a dev container usually has),
// then a desktop Chrome.
export function chromeCandidates(): Chrome[] {
  const found: Chrome[] = [];
  if (process.env.CHROME_PATH) found.push({ path: process.env.CHROME_PATH, shell: /headless[-_]shell/.test(process.env.CHROME_PATH) });
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(browsers)) {
    for (const d of readdirSync(browsers).filter((n) => n.startsWith('chromium_headless_shell'))) found.push({ path: join(browsers, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'), shell: true });
  }
  for (const p of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) found.push({ path: p, shell: false });
  return found.filter((c, i) => existsSync(c.path) && found.findIndex((o) => o.path === c.path) === i);
}

// Loads url and resolves with the DOM. Chrome on macOS prints the DOM but may not exit; stop it once the document is out.
export function dumpDom(chrome: Chrome, url: string, timeoutMs: number, { profileDir, extraArgs = [] }: { profileDir: string; extraArgs?: string[] }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Chrome's own sandbox can't start as root or inside another sandbox, and these tests load only local pages.
    const noSandbox = process.env.CI || process.getuid?.() === 0 ? ['--no-sandbox'] : [];
    const args = [...(chrome.shell ? [] : ['--headless=new']), ...noSandbox, '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(profileDir, `profile-${Math.random().toString(36).slice(2)}`)}`, ...extraArgs, '--dump-dom', url];
    const p = spawn(chrome.path, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`Chrome timed out after ${timeoutMs}ms; stderr: ${err.slice(-500) || '(none)'}`));
    }, timeoutMs);
    p.stderr.on('data', (d: Buffer) => {
      err += d;
    });
    p.stdout.on('data', (d: Buffer) => {
      buf += d;
      if (buf.includes('</html>')) {
        clearTimeout(timer);
        p.kill('SIGKILL');
        resolve(buf);
      }
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('exit', () => {
      clearTimeout(timer);
      resolve(buf);
    });
  });
}

// The first candidate that renders a page, or why the file's tests skip. profileDir is the test's own temp dir.
export async function pickChrome(profileDir: string): Promise<{ chrome?: Chrome; skip: string | false }> {
  const list = chromeCandidates();
  if (!list.length) return { skip: 'Chrome not found' };
  if (process.env.CI) return { chrome: list[0], skip: false };
  const file = join(profileDir, 'probe.html');
  writeFileSync(file, '<html><body><p id="probe">ok</p></body></html>');
  for (const chrome of list) {
    const dom = await dumpDom(chrome, `file://${file}`, PROBE_MS, { profileDir }).catch(() => '');
    if (dom.includes('id="probe"')) return { chrome, skip: false };
  }
  return { skip: `No Chrome that can render a page within ${PROBE_MS / 1000}s here (set CHROME_PATH to a working Chrome or chrome-headless-shell)` };
}
