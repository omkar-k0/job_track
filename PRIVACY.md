# Privacy policy

Effective 16 November 2026.

This policy covers the Job Tracker plugin in this repository. Job Tracker is open-source software
maintained by omkar ("we"). **The plugin sends no telemetry.** It has no usage analytics, no crash
reporting and no remote logging, and there is no setting to turn them on. We do not receive any of your
data, and we do not sell it.

## Data on your computer

Job Tracker stores your profile, job preferences, application history, drafts and interview details on
your computer, in `~/.job-tracker` (or your custom data folder if you set one). The folder is owner-only
and the database is readable only by you. Setup also keeps a copy of your CV file there. Session records
are kept in the same place; on Hermes Agent they can include email and page content read during a session.
Files you create, such as cover letters, are saved separately wherever you choose.

The tracker is a local stdio server with no network listener. The one exception is the board
(`/job-tracker:board`): while you have it open, it listens on `127.0.0.1` only, with a new token in each
link, and stops after 30 idle minutes.

## Data shared with other services

The plugin itself makes no network calls to us or to any analytics service. Information used in a session
is shared with your AI provider (for example Anthropic when you use Claude Code). Optional connections to
email, calendars, job boards and other services handle data under their own privacy policies. Applications
you approve individually, or authorize through the saved automatic-application preference, are shared with
the employer and its application platform.

## Deleting your data

Local records stay until you delete them. To remove them, delete `~/.job-tracker`, or your custom data
folder. Uninstalling the plugin does not delete this data. Delete separately saved files and any drafts,
events or conversation history held by connected services where they are stored.

## Changes and contact

Updates will be published here with a new effective date. For questions, open a
[GitHub issue](https://github.com/omkar-k0/job_track/issues). Issues are public, so do not include
personal data.
