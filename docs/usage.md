# Setup and usage

- [Requirements](#requirements)
- [Install](#install)
- [Setup walkthrough](#setup-walkthrough)
- [Commands](#commands)
- [Your data](#your-data)
- [Developer docs](#developer-docs)

Job Tracker is a Claude Code and Hermes Agent plugin for a disciplined job search. It finds roles that fit
your hard filters, verifies each one on the employer's own posting, and prepares tailored applications. It
submits only through the employer's official apply flow, using your saved auto-apply choice or your approval
for each application.

Searching for a Werkstudent job, an internship, a thesis or a first job in Germany or the EU? Read
[germany.md](germany.md) for the employment-type, hours, enrolment and language filters, German sources,
the Anschreiben conventions and the German form rules.

## Requirements

- **Claude Code 2.1.295 or newer** (Desktop app or CLI), or **Hermes Agent**.
- **Node.js 22.18 or newer.** If it is missing, `/job-tracker:setup` offers to install it on macOS and
  Windows. The tracker uses built-in `node:sqlite` and runs TypeScript directly, with no runtime npm
  dependencies.
- **Recommended:** Gmail and Google Calendar connectors for recruiter replies, interview invites and reply
  drafts.
- **Recommended browser:** Claude in Chrome or the host's built-in browser, for logged-in job boards,
  employer pages and application forms.
- **Optional:** a LinkedIn MCP server (read-only: job search and inbox).

## Install

### Claude Desktop

1. Open the [Claude desktop app](https://claude.com/download) and sign in. Choose **Code**, select
   **Local**, then choose a folder for your job search.
2. Next to the message box, open **+ → Plugins → Add plugin**. Add the repository as a marketplace, then
   install **job-tracker** for your user account. The repository URL is
   `https://github.com/omkar-k0/job_track`.
3. Start a new chat and type `/job-tracker:setup` to begin.

### Claude Code (CLI)

```
/plugin marketplace add omkar-k0/job_track
/plugin install job-tracker@job_track
```

Then run `/job-tracker:setup` inside Claude Code.

### Hermes Agent

```bash
git clone https://github.com/omkar-k0/job_track.git
cd job_track
plugin/scripts/hermes-install.sh
```

Restart Hermes and type `/job-tracker:setup`. Details and differences from Claude Code are in the
[Hermes guide](hermes.md). A DeepSeek Harness install is described in [dsh.md](dsh.md).

## Setup walkthrough

`/job-tracker:setup` walks through CV import, hard filters, preferences, writing rules, accounts (including
which calendar your invites land on), connectors, browser check, sources, autonomy and the daily schedule,
then runs a 5-result calibration sweep.

- Every "no, because..." becomes a rule.
- You can stop at any point and run `/job-tracker:setup` again to resume.
- Already tracking in a markdown table? `/job-tracker:import <folder>` brings in an `applied-log.md`,
  preferences, queue notes, and your profile.

## Commands

| Command | What it does |
|---|---|
| `/job-tracker:setup` | Guided setup; resumable. |
| `/job-tracker:sweep [--limit N]` | The daily run: inbox, sourcing, verify, score, prepare, report, audit. Submits only when you enabled `autonomy.auto_apply`; otherwise never submits. |
| `/job-tracker:apply [role-id]` | Interactive apply: verify, write, fill, read back, then submit automatically if enabled or wait for your approval. |
| `/job-tracker:approve <role-id>` | **You** type this on the filled form to allow one submit attempt for that role and page. |
| `/job-tracker:triage <source>` | Reconcile and clean a tracker board with the delete guard. |
| `/job-tracker:prep <company>` | Interview prep from your stories. |
| `/job-tracker:status` | Pipeline summary and open items. |
| `/job-tracker:board` | Board in your browser. Drag a card to any lane to move a role; see [The board](#the-board). |
| `/job-tracker:cover-letter <role-id>` | Cover letter, optionally as a one-page PDF. |
| `/job-tracker:correct` | Turn your override into a rule with a reason and example. |
| `/job-tracker:allow-consent` | Approve consent boxes for a specific application form. |
| `/job-tracker:import <folder>` | Import an existing markdown tracker. |

### The board

`/job-tracker:board` opens a local page in your browser, titled **Laufbahn**: an editorial look in the system serif
(Times New Roman), ivory and ink with an oxblood accent, hairline rules and inline icons. It loads no fonts,
scripts or images from anywhere else.

- **Stats header:** roles per lane, applications this week and in all, reply rate, cards that need you, and
  upcoming interviews.
- **Search and filters:** search company, title and stack; filter by status, source, work mode and score
  range. They are kept in the link, so a reload or a bookmark keeps the view.
- **Kanban or table:** drag cards between lanes, or switch to a sortable table of every role, including
  ones Claude has found but not yet scored.
- **Details drawer:** click a card (or press Enter) for the role, its pay, history, interviews, drafts and
  linked duplicates.
- **Dark mode:** follows your system setting; the toggle overrides it in that browser. Both themes meet WCAG AA
  text contrast.
- **Keyboard:** `/` to search, arrow keys to move between cards or rows, Enter to open, Esc to close.

### Insight tools

Ask Claude for these in any chat; they read your local tracker only:

- **`follow_ups`:** applications with no reply after a week (configurable) and interviews with no outcome recorded.
- **`funnel_stats`:** how many roles reached each stage, conversion between stages, reply rate by source and
  applications per week, optionally for a date range.
- **`export_data`:** writes your roles, companies, events and interviews as JSON (one file) or CSV (one file per
  table) to `~/.job-tracker/exports/`. Only when you ask: the files hold your personal data.

See [tracker-api.md](tracker-api.md) for the full reference.

## Your data

The tracker runs locally, always. `.mcp.json` starts a stdio server on `~/.job-tracker/tracker.db`. There is
no network listener and no token. The directory is created owner-only (`0700`) and the database is `0600`,
because it holds your CV summary, pay floor and application history. Setup keeps a copy of your CV file next
to it, in `~/.job-tracker/cv/` (`0600`), for forms and email attachments.

The board (`/job-tracker:board`) is the one exception: when you start it, it listens on `127.0.0.1` only,
with a new token in each link, and stops after 30 idle minutes.

The plugin sends no telemetry: no usage analytics, no crash reports, nothing to the plugin's author. All data
stays on your computer. See the [privacy policy](../PRIVACY.md) for what is stored, what leaves your machine
(only what your AI provider and connected services see during a session) and how to delete it.

## Developer docs

- [README.md](../README.md): overview, hard gates and install.
- [CONTRIBUTING.md](../CONTRIBUTING.md): how to contribute.
- [SPEC.md](SPEC.md): the original design spec.
- [tracker-api.md](tracker-api.md): the tracker tool reference.
- [germany.md](germany.md): the German and EU early-career guide.
