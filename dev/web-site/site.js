// Laufbahn website script (dev/build-web.mjs): theme toggle, copy buttons and the mobile menu. Loaded in
// <head> without defer so the saved theme is applied before the first paint. No requests, no storage beyond
// the light or dark choice. The pages work without it (the menu stays open, copy buttons are hidden).
(() => {
  // Same key as the board (board.js), so a choice made on the demo page carries over to the site and back.
  const THEME_KEY = 'laufbahn-board-theme';
  const root = document.documentElement;
  const recall = () => {
    try {
      return window.localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };
  const keep = (value) => {
    try {
      window.localStorage.setItem(THEME_KEY, value);
    } catch {
      // Private windows and blocked storage: the choice just lasts until the page is closed.
    }
  };

  const saved = recall();
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  root.classList.add('js');

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);

  function initTheme() {
    const btn = document.getElementById('theme');
    if (!btn) return;
    const paint = () => {
      const dark = isDark();
      btn.setAttribute('aria-pressed', String(dark));
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    };
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      keep(next);
      paint();
    });
    systemDark.addEventListener('change', paint);
    paint();
  }

  function initMenu() {
    const btn = document.getElementById('menu-btn');
    const nav = document.getElementById('site-nav');
    if (!btn || !nav) return;
    const set = (open) => {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!nav.classList.contains('open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        set(false);
        btn.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !btn.contains(e.target)) set(false);
    });
  }

  // Copy with the async clipboard API where it exists (https and localhost), else a hidden selection and
  // execCommand, else select the text so Ctrl+C or Cmd+C finishes the job.
  async function copyText(text, source) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return 'copied';
      } catch {
        // Permission refused or no focus: fall through.
      }
    }
    const range = document.createRange();
    range.selectNodeContents(source);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      if (document.execCommand('copy')) return 'copied';
    } catch {
      // Leave the selection in place.
    }
    return 'selected';
  }

  function initCopy() {
    for (const btn of document.querySelectorAll('.copy')) {
      const label = btn.textContent;
      const code = btn.closest('.code')?.querySelector('code');
      if (!code) continue;
      let timer;
      btn.addEventListener('click', async () => {
        const result = await copyText(code.textContent.trim(), code);
        btn.classList.toggle('done', result === 'copied');
        btn.textContent = result === 'copied' ? 'Copied' : 'Press Ctrl+C';
        const live = document.getElementById('copy-status');
        if (live) live.textContent = result === 'copied' ? 'Copied to clipboard.' : 'Selected. Press Ctrl+C or Cmd+C to copy.';
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.textContent = label;
          btn.classList.remove('done');
          if (live) live.textContent = '';
        }, 2000);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMenu();
    initCopy();
  });
})();
