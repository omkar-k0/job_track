---
description: Short job-hunt status (live processes, interviews, queue, what needs the user).
---

Show the user a short job-hunt status.

**If the tracker tools are missing** (search for them first if tools are deferred), or a hook error says `node` could not start: Node.js, which the plugin runs on, is missing or too old. Tell the user that in one sentence, offer to run `/laufbahn:setup` (it installs Node.js), and stop.

1. Call `pipeline_summary` and `open_items`. Rules: load `reporting` (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../templates/rules.md`). Apply them to what you show.
2. Reply in this order, omitting empty sections, one line per item:
   - **Needs you**: numbered, each with the single blocking question.
   - **Interviews**: upcoming (local time, stage, people), then links still to book.
   - **Live processes**: company, role, current status, days since last event.
   - **Queue**: queued roles with company, title, score and the ready-to-type command, e.g. `/laufbahn:apply 42`. Never a `<id>` placeholder: the user does not know the ids.
   - **Unverified drafts**: say they are not confirmed in Gmail yet.
   - Counts by status in one line.
3. Lead with the most urgent item. No recap, no closing summary.
4. If the user asks for more than this summary: `funnel_stats` gives the funnel and conversion counts, `follow_ups` lists applications that are due a nudge, and `export_data` exports the tracker. Offer them by name in one line; do not call them unprompted.

Read only. Do not change any state.
