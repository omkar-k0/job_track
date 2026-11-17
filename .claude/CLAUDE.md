@../AGENTS.md

## Claude Code

- The plugin root is `plugin/`. Never put a `CLAUDE.md` there: it fails `claude plugin validate --strict`.
- This repo is itself a plugin. Edits here do not change the installed `laufbahn` plugin you may have
  loaded in this session; do not call its `mcp__plugin_laufbahn_tracker__*` tools to test changes. Use
  `npm test` or `npm run tracker -- --db <scratch path>` instead.
