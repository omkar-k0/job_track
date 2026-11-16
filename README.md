# Job Tracker

[![CI](https://github.com/omkar-k0/job_track/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/omkar-k0/job_track/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/omkar-k0/job_track)](LICENSE)
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
- Submit an application unless you enabled `autonomy.auto_apply` during setup or typed `/job-tracker:approve <role_id>` in the same session. Review first is the default.
- Create accounts, enter passwords, solve visible CAPTCHAs, tick consent boxes, or fill personal-data
  fields (passport, nationality, age, gender, marital status, ID numbers).
- Auto-apply at volume.

## Requirements

- **Claude Code 2.1.295 or newer** (the Desktop app or the CLI), or **Hermes Agent**.
- **Node.js 22.18 or newer.** If it is missing, `/job-tracker:setup` offers to install it on macOS and
  Windows. The tracker uses the built-in `node:sqlite`, and Node runs the plugin's TypeScript directly.
  There are no runtime npm dependencies.
- **Recommended connectors:** Gmail and Google Calendar.
- **Recommended browser:** Claude in Chrome or the host's built-in browser.
- **Optional:** a LinkedIn MCP server (read-only use: job search and inbox).

Full setup and usage instructions: [docs/usage.md](docs/usage.md)

## Install

Claude Code:

```
/plugin marketplace add omkar-k0/job_track
/plugin install job-tracker@job_track
/job-tracker:setup
```

Hermes Agent:

```bash
git clone https://github.com/omkar-k0/job_track.git
cd job_track
plugin/scripts/hermes-install.sh
```

Restart Hermes and type `/job-tracker:setup`. Details:
[docs/hermes.md](docs/hermes.md).

## Commands

| Command | What it does |
|---|---|
| `/job-tracker:setup` | Guided setup; resumable. |
| `/job-tracker:sweep [--limit N]` | The daily run. Applies only when you enabled `autonomy.auto_apply`; otherwise never submits. |
| `/job-tracker:apply [role-id]` | Verify, write, fill, read back, then submit automatically if enabled or wait for your approval. |
| `/job-tracker:approve <role-id>` | You type this on the filled form to allow one submit attempt. |
| `/job-tracker:triage <source>` | Reconcile and clean a tracker board with the delete guard. |
| `/job-tracker:prep <company>` | Interview prep from your stories. |
| `/job-tracker:status` | Pipeline summary and open items. |
| `/job-tracker:board` | Board in your browser: kanban or table, search and filters, a stats header, a details drawer per role, dark mode and keyboard shortcuts. |
| `/job-tracker:cover-letter <role-id>` | Cover letter, optionally as a one-page PDF. |
| `/job-tracker:correct` | Turn your override into a rule with a reason and example. |

## Insight tools

Besides the pipeline tools, the tracker answers three read-only questions locally ([reference](docs/tracker-api.md)):
`follow_ups` (applications with no reply, interviews with no outcome recorded), `funnel_stats` (conversion per
stage, reply rate by source, applications per week) and `export_data` (the roles, companies, events and interviews
as JSON or CSV files in `~/.job-tracker/exports/`, only when you ask).

## Your data

The tracker runs locally. A stdio server on `~/.job-tracker/tracker.db`. No network listener, no token.
The directory is owner-only (`0700`), database is `0600`. **The plugin sends no telemetry:** no usage
analytics, no crash reports, no phone-home of any kind. All plugin data stays local in `~/.job-tracker`.

See the [privacy policy](PRIVACY.md).

## Hooks (hard gates)

| Gate | Rule |
|---|---|
| Send | Email/LinkedIn sends blocked in every session. |
| Submit | Needs saved `autonomy.auto_apply: true` or `/job-tracker:approve`, and a passing `gate_check`. Automatic submission also needs one matching scored, queued role with no open question. |
| Board delete | Needs a fresh `JOBHUNT_TRIAGE_GUARD` with `ok: true`. |
| Personal data and consent | Passport, nationality, age, DOB, gender, marital, ID fields denied; consent boxes stay unticked unless you allow them. |
| Stop | A sweep session cannot end until every role has an event and the report was rendered. |

## Development

```
npm run setup   # dev only: TypeScript, the Node types and Biome, installed into dev/
npm test        # tsc, then the Node and Python tests
```

The code is TypeScript that Node runs directly (type stripping), so there is no build step and nothing to
install at runtime.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Design choices

1. **Local only.** The tracker is SQLite behind a stdio server in `~/.job-tracker`.
2. **The daily run is a local scheduled task.**
3. **LinkedIn is read-only and optional.** Send and connect tools are blocked by a hook.
4. **Voice.** `write-note` uses an installed humanizer or writing-style skill when present, else its own rules.
5. **Templates ship neutral.** Your own values go in through setup.

## Origin

Job Tracker started as a copy of [job-tracker-mcp](https://github.com/adamwardecki/job-tracker-mcp) by
Adam Wardecki, which is released under the MIT license. This repository is an independent copy, maintained
separately by omkar, with the website and usage analytics removed. Both copyright notices are kept in
[LICENSE](LICENSE).

## License

[MIT](LICENSE)
