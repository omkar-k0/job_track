# Changelog

## Unreleased

- **Renamed to Laufbahn.** The plugin is now `laufbahn`: install with `/plugin marketplace add
  omkar-k0/laufbahn` and `/plugin install laufbahn@laufbahn`, and the commands are `/laufbahn:setup`,
  `/laufbahn:sweep` and so on. Tracker tools appear as `mcp__plugin_laufbahn_tracker__<tool>`, and the hooks
  match the new names. The repository moves to `omkar-k0/laufbahn` (GitHub redirects the old URL).
- **New data folder `~/.laufbahn`, with a fallback.** If `~/.laufbahn` is missing and `~/.job-tracker`
  exists, the plugin keeps using the old folder and prints to stderr how to move it; it never moves your data.
  The variables are now `LAUFBAHN_HOME`, `LAUFBAHN_DB` and `LAUFBAHN_NODE`; the old `JOB_TRACKER_*` names still
  work. The Hermes and DeepSeek Harness installers remove the old `job-tracker` link, skills and profile block.
- **Board restyled as Laufbahn.** The board page has a new name and an editorial look: a framed italic "L"
  monogram, Times New Roman throughout with small-caps labels and tabular figures, ivory, ink and oxblood with
  a matching dark theme, per-status colours, hairline rules and 2px corners, and one inline outline icon set.
  Every text colour pair in both themes meets WCAG AA. The bundled web fonts are gone, so the server serves only
  the page, its stylesheet and its script, and the CSP no longer allows fonts. Features and keyboard use are
  unchanged.

## 0.6.0

First release of this repository as an independent project.

- **Imported from upstream 0.5.1.** The code was imported from
  [job-tracker-mcp](https://github.com/adamwardecki/job-tracker-mcp) 0.5.1 by Adam Wardecki (MIT) as a
  plain copy, not a GitHub fork, and is maintained separately. Both copyright notices are kept in
  [LICENSE](LICENSE). The marketplace, install commands and links now point to `omkar-k0/job_track`.
- **Telemetry removed.** No usage analytics, no crash reports, no phone-home. The `set_usage_analytics` tool,
  the setup step that asked for it and the marketing website are gone; migration 11 deletes any stored
  analytics consent and install id. A test fails if a network call or analytics code comes back.
- **New tools.** `follow_ups` (applications with no reply, interviews with no outcome recorded),
  `funnel_stats` (stage conversion, reply rate by source, applications per week) and `export_data` (roles,
  companies, events and interviews as JSON or CSV in `~/.job-tracker/exports/`). All read-only on the
  pipeline and local.
- **Board.** Search and filters (status, source, work mode, score) kept in the URL fragment, a sortable table
  view of every role, a details drawer per role (`GET /api/role/:id`), a stats header, dark mode, and
  keyboard shortcuts (`/` to search, arrows to move, Enter to open, Esc to close).
- **German and EU early-career support.** Werkstudent, internship, Pflichtpraktikum, thesis and first-job
  searches: new config keys `filters.employment_types`, `filters.weekly_hours`, `filters.enrolled`,
  `filters.languages` (CEFR levels) and `writing.language` (`auto`, `de`, `en`); German sources; Anschreiben
  conventions and a German stock-phrase check in the prose linter; drop categories `language` and
  `employment_type`. See [docs/germany.md](docs/germany.md).
- **German safety-hook patterns.** The personal-data, consent and submit gates now recognise German labels
  (Geburtsdatum, Staatsangehörigkeit, Familienstand, Steuer-ID, Matrikelnummer; Einwilligung, Talentpool,
  Newsletter; "Bewerbung absenden", "Jetzt bewerben" and others), with umlauts or ae/oe/ue/ss spellings.
- **Faster tests.** The Node test suite runs in about 25 s instead of about 480 s; the headless-Chrome tests
  share one probe and skip quickly where Chrome cannot render.
