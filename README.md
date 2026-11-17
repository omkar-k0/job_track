# Laufbahn

[![CI](https://github.com/omkar-k0/laufbahn/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/omkar-k0/laufbahn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/omkar-k0/laufbahn)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757?logo=claude&logoColor=white)](docs/usage.md)
[![Hermes Agent](https://img.shields.io/badge/Hermes_Agent-supported-6E56CF)](docs/hermes.md)
[![Runtime deps: 0](https://img.shields.io/badge/runtime_deps-0-brightgreen)](package.json)

A Claude Code (and Hermes Agent) plugin that runs a disciplined job search for one person.
Every weekday it finds roles that fit your hard filters, verifies each one on the employer's own posting,
dedupes against everything you have touched, and prepares tailored applications. It submits only through
the employer's official apply flow, using your saved auto-apply choice or your approval for each application. It tracks replies and interviews and
writes one short daily report.

The design follows one principle: **fewer, better applications.**

Setup and usage docs: [docs/usage.md](docs/usage.md)

Looking for a Werkstudent job, an internship or a first job in Germany? See [docs/germany.md](docs/germany.md).

> **Status: early, and in active development.** Expect rough edges, and expect the source adapters to
> break when job sites change. Issues and pull requests are welcome.

## What it won't do

- Send email or LinkedIn messages. It writes drafts only, and a hook blocks every send tool.
- Submit an application unless you enabled `autonomy.auto_apply` during setup or typed `/laufbahn:approve <role_id>` in the same session. Review first is the default.
- Create accounts, enter passwords, solve visible CAPTCHAs, tick consent boxes, or fill personal-data
  fields (passport, nationality, age, gender, marital status, ID numbers).
- Auto-apply at volume.

## Requirements

- **Claude Code 2.1.295 or newer** (the Desktop app or the CLI), or **Hermes Agent**.
- **Node.js 22.18 or newer.** If it is missing, `/laufbahn:setup` offers to install it on macOS and
  Windows. The tracker uses the built-in `node:sqlite`, and Node runs the plugin's TypeScript directly.
  There are no runtime npm dependencies.
- **Recommended connectors:** Gmail and Google Calendar.
- **Recommended browser:** Claude in Chrome or the host's built-in browser.
- **Optional:** a LinkedIn MCP server (read-only use: job search and inbox).

Full setup and usage instructions: [docs/usage.md](docs/usage.md)

## Install

Claude Code:

```
/plugin marketplace add omkar-k0/laufbahn
/plugin install laufbahn@laufbahn
/laufbahn:setup
```

Hermes Agent:

```bash
git clone https://github.com/omkar-k0/laufbahn.git
cd laufbahn
plugin/scripts/hermes-install.sh
```

Restart Hermes and type `/laufbahn:setup`. Details:
[docs/hermes.md](docs/hermes.md).

## Commands

| Command | What it does |
|---|---|
| `/laufbahn:setup` | Guided setup; resumable. |
| `/laufbahn:sweep [--limit N]` | The daily run. Applies only when you enabled `autonomy.auto_apply`; otherwise never submits. |
| `/laufbahn:apply [role-id]` | Verify, write, fill, read back, then submit automatically if enabled or wait for your approval. |
| `/laufbahn:approve <role-id>` | You type this on the filled form to allow one submit attempt. |
| `/laufbahn:triage <source>` | Reconcile and clean a tracker board with the delete guard. |
| `/laufbahn:prep <company>` | Interview prep from your stories. |
| `/laufbahn:status` | Pipeline summary and open items. |
| `/laufbahn:board` | Board in your browser (Laufbahn): kanban or table, search and filters, a stats header, a details drawer per role, dark mode and keyboard shortcuts. |
| `/laufbahn:cover-letter <role-id>` | Cover letter, optionally as a one-page PDF. |
| `/laufbahn:correct` | Turn your override into a rule with a reason and example. |

## Insight tools

Besides the pipeline tools, the tracker answers three read-only questions locally ([reference](docs/tracker-api.md)):
`follow_ups` (applications with no reply, interviews with no outcome recorded), `funnel_stats` (conversion per
stage, reply rate by source, applications per week) and `export_data` (the roles, companies, events and interviews
as JSON or CSV files in `~/.laufbahn/exports/`, only when you ask).

## Your data

The tracker runs locally. A stdio server on `~/.laufbahn/tracker.db`. No network listener, no token.
The directory is owner-only (`0700`), database is `0600`. **The plugin sends no telemetry:** no usage
analytics, no crash reports, no phone-home of any kind. All plugin data stays local in `~/.laufbahn`.

See the [privacy policy](PRIVACY.md).

## Hooks (hard gates)

| Gate | Rule |
|---|---|
| Send | Email/LinkedIn sends blocked in every session. |
| Submit | Needs saved `autonomy.auto_apply: true` or `/laufbahn:approve`, and a passing `gate_check`. Automatic submission also needs one matching scored, queued role with no open question. |
| Board delete | Needs a fresh `JOBHUNT_TRIAGE_GUARD` with `ok: true`. |
| Personal data and consent | Passport, nationality, age, DOB, gender, marital, ID fields denied; consent boxes stay unticked unless you allow them. |
| Stop | A sweep session cannot end until every role has an event and the report was rendered. |

## Website and web demo

A small static site, with a navbar and four pages: **Home** (what Laufbahn does and won't do), **How does it
work?**, **Install** (the one-time steps, with copy buttons) and **Live demo**. The live demo is a read-only
copy of the board on made-up companies and roles; its moves and notes live only in your browser tab until you
reload. The real Laufbahn runs on your own machine; the site shares only the board's page, not the plugin or
any data. It uses no framework, web fonts, analytics or outside requests.

Build it with `node dev/build-web.mjs` (no install needed). The pages come from `dev/web-site/`; the build
copies the board into `web-dist/` as the demo page and adds a small script that answers the board's API from
the fixtures in `dev/web-demo/`. To deploy it on Vercel, see [docs/deploy.md](docs/deploy.md).

## Development

```
npm run setup   # dev only: TypeScript, the Node types and Biome, installed into dev/
npm test        # tsc, then the Node and Python tests
```

The code is TypeScript that Node runs directly (type stripping), so there is no build step and nothing to
install at runtime.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Design choices

1. **Local only.** The tracker is SQLite behind a stdio server in `~/.laufbahn`.
2. **The daily run is a local scheduled task.**
3. **LinkedIn is read-only and optional.** Send and connect tools are blocked by a hook.
4. **Voice.** `write-note` uses an installed humanizer or writing-style skill when present, else its own rules.
5. **Templates ship neutral.** Your own values go in through setup.

## Origin

Laufbahn started as a copy of [job-tracker-mcp](https://github.com/adamwardecki/job-tracker-mcp) by
Adam Wardecki, which is released under the MIT license. This repository is an independent copy, maintained
separately by omkar, with the website and usage analytics removed. Both copyright notices are kept in
[LICENSE](LICENSE).

## License

[MIT](LICENSE)
