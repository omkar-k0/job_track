---
name: setup
description: Drives the job-hunt plugin's setup conversation (CV import, hard filters including employment types and language levels, preferences, writing rules, accounts, connectors, browser check, sources, autonomy, schedule, calibration run). Use when the user runs /job-tracker:setup, says they want to start or reconfigure the job hunt, or when setup_status shows red items before a run.
---

# Setup

The skill drives the conversation. The tracker tools validate and persist. Every step is resumable: `setup_status` shows progress, and each step saves as soon as the user confirms it.

## Hard rules

- **Ask, don't infer, for anything that gates applications.** Echo each section back as a one-screen summary and save only after the user confirms. Why: a wrong hard filter silently drops or approves roles for weeks.
- **Use multiple-choice questions** (the host's question tool, e.g. AskUserQuestion) wherever the answer has a small option set. One topic per question. When the question asks the user to confirm something (a draft, a summary, a set of filters), print that content in the message first; never put it only in the question or leave it out.
- **Never ask for passwords, tokens for job sites, or ID numbers.** Never create job-site accounts.
- **The Node.js installer asks for the computer's password in the operating system's own window.** Never ask for it in chat, never run `sudo`, and never work around a checksum or signature failure from the installer scripts.
- **Tell the user where personal data lives** before saving any of it: the tracker database (a local file in `~/.job-tracker`, readable only by their OS account), and any connector they add.
- Templates in `${CLAUDE_PLUGIN_ROOT}/templates/` (Hermes: `${HERMES_SKILL_DIR}/../../templates/`) are the shape for documents and config. Never pre-fill them with example values as if they were the user's.
- Each step ends with a `save_config` or `save_document` call, or a `record_setup_decision` call (item key and the user's decision in their words) when the user chooses to skip or accept an amber item. If `save_config` returns field errors, fix them with the user, do not drop the fields.
- **Before each `save_config`, read that section in `templates/settings.example.yaml`** and use its field names and types exactly. Do not invent fields (`remote`, `locations`, `role_types` do not exist). Common mappings: where they can work from → `filters.work_authorisation`; contract types → `filters.pay_floor.contract_type` and `prefs.contract_ok`; target roles → `prefs.titles` and `prefs.seniority`; roles to avoid → `filters.excluded_role_shapes`. If an answer fits no field, tell the user and offer `add_rule`. Never drop it silently. On a validation error, the error lists the section's expected fields: fix the call from that list.
- **Legal and immigration questions are surfaced, never decided.** For work-hour limits, enrolment status, internship pay rules, minimum wage and student work permits, the plugin lists what the user should confirm (with their university, employer, health insurer or Ausländerbehörde) and never states a legal conclusion. Why: the answer depends on the contract and the person, and a wrong "that is fine" is worse than a question.

## Steps

Start with step 0 (Runtime), then `setup_status`. Then resume at the first step that is not green.

### 0. Runtime
The tracker and the safety hooks run on Node.js 22.18 or newer (23.x needs 23.4 or newer). Without it there are no tracker tools, and the hooks block mail, LinkedIn and browser tools. This step comes before `setup_status`, which is itself a tracker tool.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/` (Hermes: `${HERMES_SKILL_DIR}/../../scripts/`).

1. If the tracker tools are listed (use tool search if tools are deferred) and `setup_status` answers, this step is green. Go on to `setup_status`.
2. Otherwise run the check with the shell tool. Its exit code says which step comes next (0, 1 or 3):
   - macOS: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.sh" --check`
   - Windows: there is no script. Run `node -p "process.versions.node + ' ' + process.execPath"`. If it prints a version that is 22.18 or newer (23.4 or newer on 23.x), treat it as exit 0 with the printed path. If `node` is not found, or the version is older, run the same command with `"C:\Program Files\nodejs\node.exe"` in place of `node` (PowerShell needs `& ` before a quoted path): a new enough version there is exit 0 with that path when `node` was not found, and exit 3 when an older `node` was found first. Anything else is exit 1. Why: a PowerShell installer script in the plugin held the directory submission for policy review; winget, built into Windows, installs and verifies Node.js instead.
   - Linux: the macOS command. The script does not install on Linux, so if it exits 1, skip the question in step 5 and give the "I'll install it myself" instructions (step 7).
3. **Exit 3** (an older copy of Node.js is in the way): show the script's message. Explain in plain words that there is an older copy of Node.js on this computer that the plugin would use instead of the new one, and that it has to be removed or updated, by them or by someone technical; after that, quit and reopen the app and type `/job-tracker:setup`. Stop. Do not offer the installer: installing again would not fix this.
4. **Check passes (exit 0)**: Node.js is there but the tracker is not running. Ask (multiple choice): "Have you quit and reopened the app since Node.js was installed?"
   - **No**: ask them to quit the app completely (not just close the window), reopen it, and type `/job-tracker:setup`. Stop.
   - **Yes**: run the tracker once, with empty input, using the exact Node path the check printed:
     - macOS: `"<path>" --no-warnings "${CLAUDE_PLUGIN_ROOT}/servers/tracker/src/index.ts" < /dev/null`
     - Windows (PowerShell): `$null | & "<path>" --no-warnings "${CLAUDE_PLUGIN_ROOT}/servers/tracker/src/index.ts"` (from Git Bash, use the macOS form with the same path)
     If it prints `stdio ready`, tell the user that Node.js works but the app cannot see it, name the path, and say this needs a quick look from someone technical or a report to the plugin author (https://github.com/omkar-k0/job_track). Stop, and do not suggest another restart. If it prints an error, show the error to the user and stop.
5. **Check fails (exit 1)**: tell the user, in one or two sentences, that the plugin needs a free program called Node.js to keep their job-hunt data on this computer, that it comes from nodejs.org (the official site), and that nothing about them is sent anywhere. Then ask (multiple choice):
   - Install it now (macOS: open the official installer; Windows: install it with winget, the package manager built into Windows)
   - I'll install it myself
   - Not now
6. **Install it now**: run the command for the platform, with a 10-minute timeout on the shell tool (its default is shorter, and the download can take a few minutes):
   - macOS: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/install-node.sh"`, then wait for the user to say the installer finished.
   - Windows: `winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements`. Tell the user first that Windows will ask them to allow it. winget checks the package against its manifest hash. If `winget` is not found, say nothing was installed and give the "install it myself" route. Otherwise go to step 9 whatever the exit code: a non-zero code can also mean "already installed" or "restart needed", and the check tells.
   For the macOS script, relay its last line; if it exits non-zero, show its message and offer the "install it myself" route. Never work around a checksum or signature failure.
7. **I'll install it myself**, or no shell tool is available: on Windows, say: open Terminal or PowerShell and run `winget install OpenJS.NodeJS.LTS`, or download the LTS installer from https://nodejs.org/en/download. Elsewhere, give https://nodejs.org/en/download and say: choose the LTS installer for your computer, run it. Then: quit and reopen this app and type `/job-tracker:setup`.
8. **Not now**: say that nothing else in the plugin works until Node.js is installed, and stop setup.
9. After an install, run the check again. When it passes (exit 0), say: "Node.js is installed. Quit Claude completely and reopen it, then type /job-tracker:setup to carry on." Stop here: the tracker only starts when the app starts. If it still fails, show its message and stop; do not offer the installer again in this setup run.

### 1. CV import
A `cv_file` item in `setup_status` that is not green resumes at this step.
- Ask how they want to give the CV, offering these in order:
  1. **Give the file's full path.** Before asking, tell the user in the chat message (not inside the question tool, which only shows the question) how to copy it:
     - macOS: in Finder, select the CV file and press Option+Command+C (or right-click it, hold Option, and choose Copy "<file name>" as Pathname). Then paste it into the chat.
     - Windows: in File Explorer, select the CV file and press Ctrl+Shift+C (or Shift+right-click it and choose "Copy as path"). Then paste it into the chat.
     Call `save_cv` with the pasted path. Windows wraps it in double quotes: strip the quotes first. Expand a leading `~` to the home folder. Why: the tracker can only copy a file it can open on the user's computer.
  2. **Paste the text.** Use it for the profile only, and tell the user that applications and emails need the file, so `cv_file` stays open until they give its path. If they want to finish setup without a file, offer `record_setup_decision` for `cv_file` with their words. Why: otherwise setup loops back to the red item every time.
- Do not offer dropping or attaching the file in the chat, and do not search for an attached file with a shell. If the user attaches it anyway, use its text for the profile and still ask for the path as in option 1. If the attachment shows a path, you may try `save_cv` with it once; on "No file at", explain why and ask for the path. Why: in a cloud chat session an attached file is uploaded to the cloud, not saved on the user's computer, and a shell there searches the cloud machine too, so the tracker on the user's computer never sees the file.
- `save_cv` copies the file into `cv/` in the tracker's folder (`~/.job-tracker/cv/` by default) and records the copy. Tell the user the path it returns. Why: a download can be temporary or get moved, and every application and email needs the file. A copy does not follow edits to the original: to replace the CV, give the new file's path again. Pass `copy: false` only if the user asks to keep using the file where it is.
- `save_cv` errors say what is wrong (not found, not a PDF or Word file, over 25 MB). Relay them in plain words and ask again.
- Read the CV's text from the file (or the paste) to draft the profile.
- Draft the `profile` document using `templates/profile.md`. For **every role**, write a **Tools and skills** line listing the tools, technologies, systems, methods and credentials used in that role, taken from the CV text for that role.
- **Early-career CVs** (students, graduates, few or no jobs): treat each project, thesis, course project, hackathon, research assistant post or open-source contribution as a block in the template's Projects section, with its own **Tools and skills** line, and record the degree programme, university, expected end and relevant courses under Education. Languages go in with a CEFR level (A1 to C2 or native) when the CV gives one; ask for the level when it does not, because `filters.languages` is built from it.
- Mark anything inferred (not literally in the CV) with `(inferred)` and ask the user to confirm or remove each one.
- Add the note from the template that summary lines are not exhaustive. Why: a skills summary was once read as the whole record and a technology the user had used for years was scored as a gap.
- Show the full draft in chat, as message text, before asking to save. Then ask: save, or edit first. Why: the question tool only shows the question, so a user asked to approve a profile they cannot see is approving it blind.
- `save_document` with `name: "profile"`.
- When `setup_status` shows `cv_file` amber (the CV changed since it was saved), re-read the file, update the profile with the user, then call `save_cv` again with the path `get_cv` returns. Why: the profile is what scoring and writing trust, so it must describe the CV the forms receive.

### 2. Hard filters (`filters`)
Ask, in order: work mode (remote, hybrid, onsite; multi-select); for hybrid, max days per week and acceptable cities; residence country; timezone and acceptable overlap window; work authorisation (where no sponsorship is needed); **employment types**; pay floor (amount, currency, period, gross or net, and contract type); the equity rule (default: floor unchanged, equity may justify a "negotiable" answer inside the band); excluded industries; excluded role shapes (e.g. for engineers backend-only, forward-deployed or people manager; for other fields, ask which kinds of role they never want); culture red lines; **languages**.
- Explain the band rule: a role drops on pay only if the band **maximum** is below the floor; straddling bands are kept and flagged.
- **Employment types** (multi-select, with "No preference" as the first option, which leaves the list empty): `werkstudent`, `internship`, `pflichtpraktikum`, `freiwilliges_praktikum`, `full_time`, `part_time`, `contract`, `thesis`. Say in one line what each means: Pflichtpraktikum is an internship the study regulations require, freiwilliges Praktikum is a voluntary one, thesis is a Bachelor or Master thesis written with a company. If the list holds `werkstudent`, `pflichtpraktikum` or `thesis`, also ask: are you currently enrolled (`enrolled`: true or false), and how many hours per week can you work (`weekly_hours`, as a minimum and maximum), and print the legal-questions notice below.
- **Pay floor for hourly work.** For Werkstudent and internship searches ask for the floor per hour, gross, and save it with `period: "hour"` and `contract_type` naming the type. Why: the pay check annualises an hourly floor with full-time hours, so a monthly posting compared with an hourly floor gives a wrong verdict unless both use the same period (see `score-role`). Do not state the statutory minimum wage; tell the user to look up the current figure from an official source if it matters to them.
- **Languages.** Ask which languages the user can work in (read and write a job, speak in interviews) and the level for each, as CEFR A1 to C2 or native. Offer the language question with German and English first, plus "Other". Echo the list back: a posting that requires a listed language above that level, or a language not listed, will be dropped as a hard filter. Why: a "fließend" or "verhandlungssicher" requirement is a gate, and the level is the user's own statement, never inferred from the CV.
- **Student work permit.** For student searches ask once (yes or no): "Does your right to work here depend on a student residence permit?" On yes, `add_rule` with `types` `scoring`, text "For every Werkstudent, internship and thesis role add the Confirm yourself item about the yearly working-day allowance", the user's words as the reason. Do not ask for nationality, permit numbers or dates.
- **Notice for student searches** (print it in the message, then continue): "I will flag these for you to confirm, and I will not decide them: how many hours a Werkstudent may work in lecture periods, whether an internship must be paid and at what rate, whether your internship is a Pflichtpraktikum for your degree, and, if you are not an EU citizen, how many days a year your residence permit allows you to work. Ask your university, the employer, your health insurer or your Ausländerbehörde."
- Echo all filters back on one screen, then `save_config` with `section: "filters"`.
- Fields: `work_mode`, `hybrid`, `residence_country`, `timezone`, `overlap_window`, `work_authorisation`, `pay_floor`, `pay_rule_with_equity`, `band_rule`, `excluded_industries`, `excluded_role_shapes`, `culture_red_lines`, `employment_types`, `weekly_hours` (`min`, `max`), `enrolled`, `languages` (a list of `language` and `level`).

### 3. Soft preferences (`prefs`)
Titles (for German markets include German and English forms, e.g. "Werkstudent Data Science" and "working student data science"), seniority (entry, junior, intern, working student, thesis), company stage, tools and skills they want and avoid (saved as `stack_want` and `stack_avoid`; any profession, e.g. Epic and wound care, or Figma and design systems), domains they like, contract openness, availability date. These only affect the score. `save_config` with `section: "prefs"`.
- Fields: `titles`, `seniority`, `stage`, `stack_want`, `stack_avoid`, `domains_like`, `contract_ok`, `availability`.

### 4. Writing rules (`writing`)
- Offer to learn the user's voice from 2 to 5 samples they wrote (emails, cover letters, posts). If they agree, summarise the voice (sentence length, register, words they use and avoid) and `save_document` with `name: "voice"`.
- Confirm defaults: humanizer on, cover note word limit (default 200), never volunteer gaps, signature style name-only (no bare URLs in email signatures, Gmail rewrites them into redirect links).
- **Application language.** Ask: write each application in the language of the posting (`auto`, the default), always German (`de`), or always English (`en`). Explain that German letters use the formal Sie, a Betreff line and "Mit freundlichen Grüßen" (details in `write-note`). If the user's German level in `filters.languages` is below B2, warn that `auto` will draft German letters for German postings they may not be able to defend in an interview, and ask whether to keep `auto`.
- Show the list of **personal fields the plugin will never fill**: passport, nationality or citizenship, age or date of birth, marital status, gender, ethnicity, disability, veteran status, religion, sexual orientation, national ID, tax or social security numbers, photos, passwords. The German names are on the same list: Geburtsdatum, Staatsangehörigkeit, Familienstand, Geschlecht, Konfession, Schwerbehinderung, Steuer-ID, Sozialversicherungsnummer, Matrikelnummer, Bewerbungsfoto. Also: consent boxes (Einwilligung, Talentpool, Newsletter) stay on the privacy-preserving option unless the user allows them per role. Say that a German CV traditionally carries a photo, date of birth and marital status, that none is required, and that the plugin never adds them: the user decides and adds them to their own CV file.
- Seed `reusable-answers` from `templates/reusable-answers.md` with the user's answers to the common fields (notice period, salary answer wording, work authorisation statement, how they heard). For German forms also the earliest start date (Eintrittstermin), weekly hours (Wochenstunden), the pay expectation per hour or month (Gehaltsvorstellung) and how to word enrolment (Studiengang, Hochschule, Semester). `save_document` with `name: "reusable-answers"`.
- `save_config` with `section: "writing"`.
- Fields: `voice_profile`, `humanizer`, `max_words_cover_note`, `never_volunteer_gaps`, `signature_style`, `language` (`auto`, `de` or `en`).

### 5. Accounts (`accounts`)
- Ask which of the user's own inboxes recruiters actually write to (`job_inbox_email`), and **which calendar interview invites land on** (`invite_calendar`). Both are required. Store the address or a label such as `personal` or `work`.
- Compare with the connected Google account(s) and record the connected one as `connected_calendar`. If the connected calendar is a different account, warn plainly: invites will not be visible to the pipeline, and colleagues may book over interviews. Offer to connect the right account. Why: interviews once sat on a personal calendar the pipeline could not see.
- Ask whether the browser autofills a different (e.g. work) email into forms; record it as `chrome_autofill_risk`.
- `save_config` with `section: "accounts"`. Job-site logins are not accounts: they go in `sources.need_login` in step 8.
- Fields: `job_inbox_email`, `invite_calendar`, `connected_calendar`, `chrome_autofill_risk`.

### 6. Connectors
- Search the connector registry (or the host's connector suggestion tool) and suggest: Gmail, Google Calendar, and LinkedIn (read-only use: job search and inbox). The tracker is already connected: it ships with the plugin.
- Explain what each one is used for and that send tools are blocked by a hook: the plugin only creates drafts.
- Do a cheap read call on each connected one to confirm it works.
- A connector the user declines (e.g. LinkedIn): `record_setup_decision` with their words.

### 7. Browser check
- Detect Claude in Chrome, the built-in browser, or Hermes `browser_*` tools (check the tool list; use tool search if tools are deferred). If neither is present, show install steps and move on. The browser is optional.
- If one is present: open a harmless page, then check which job sites are logged in (Wellfound, LinkedIn, YC Work at a Startup, Welcome to the Jungle, XING and JobTeaser for German searches, Glassdoor if `filters.work_authorisation` includes the US, any tracker boards). Use the start URLs in the `source-roles` reference for those sites, and URLs from the user or from emails for anything else. A login redirect on a **guessed** URL is not proof of being logged out.
- Capabilities are recorded by `start_run`; no `save_config` needed. Note logged-in sites for step 8. No browser at all: `record_setup_decision` (key from `setup_status`) with the user's choice, e.g. "no browser, connectors only".

### 8. Sources
1. Show the catalogue from the `source-roles` skill in the message as one table: ID, source, mode, whether it needs a browser, whether it needs a login, and the one-line quirk. Include the retired sources at the bottom, marked retired.
2. Let the user pick with **multi-select** questions, one per catalogue group (General; German job boards; Student and early-career boards; European tech and startup boards; Startup and remote boards; US job boards; Brokers and trackers). A question holds at most 4 options, so split a larger group into two questions (e.g. US job boards 1 and 2), and use a second question call if there are more questions than one call allows. Each option's label is the source name and its description is the mode plus the login note. Say in the question text that a retired source can be typed under "Other".
3. Order and recommend by market. If `filters.residence_country` is `DE`, or `filters.employment_types` holds `werkstudent`, `pflichtpraktikum` or `thesis`, put German job boards and Student and early-career boards first and mark them recommended; say that `arbeitsagentur` and `stellenwerk` need no login. If `filters.work_authorisation` includes the US or `filters.residence_country` is `US`, put US job boards first and mark them recommended. Otherwise still offer the other market's group, and say in the question that most of its roles need work authorisation there (US) or German language skills (German boards).
4. Echo the picks back on one screen (enabled, which of them need a login, which need a browser) before saving. A picked browser source with no browser from step 7 stays enabled; say it will be skipped until a browser is connected. A picked source that needs a login the user is not logged in to goes in `need_login`; tell them which site to log in to.
5. If they enable `ats_boards`, ask for the job board URLs of companies they want to watch (e.g. `https://jobs.ashbyhq.com/<company>`, a Greenhouse or Lever board, `https://<company>.jobs.personio.de`, a SmartRecruiters or Workday career site, or a university career-service page); without at least one, leave `ats_boards` disabled. The other sources start from fixed URLs in the `source-roles` reference: do not ask for those.
6. Save with `save_config` (`section: "sources"`) using the catalogue IDs: `enabled` is the picks, `disabled` is every other catalogue ID. Call `set_source_status` with `disabled` for each disabled source.
- Fields: `enabled`, `need_login`, `disabled`, `boards`.

### 9. Autonomy (`autonomy`)
Ask whether to review each application or apply automatically to matching roles. Default to review first. Echo the choice and save only after the user confirms, using `save_config` with `section: "autonomy"` and `data.auto_apply: false` (review first) or `true` (automatic). Read `get_profile` back to confirm the saved value. Why: a durable, explicit choice must control future runs; silence and older settings must never opt someone in.
- unattended: search, verify, score, draft note, draft email, record
- submission: automatic only when `autonomy.auto_apply` is exactly `true`; otherwise the user approves each submit
- always needs the user: send, delete, consent, personal data, account login
Explain that automatic applications still require a verified, scored, queued role, no live application at the company, and no unresolved question. Forms needing consent, personal data, login, or a visible CAPTCHA come back to the user. Hooks enforce those limits in either mode. The legacy `unattended` and `needs_user` lists do not grant submit permission; keep their defaults and use `auto_apply` for this choice.
Tell the user they can turn automatic applications off by asking to update this setting; save `auto_apply: false` and read it back. Why: the submit hook reads the current preference before every attempt, including in running sessions.

### 10. Schedule (`schedule`)
- Ask when the computer is usually on with Claude open. Create a weekday **local** scheduled task inside that window that runs `/job-tracker:sweep`, using the host's local scheduling (a Claude Desktop or Claude Code local scheduled task, or a Hermes cron job created with the `cronjob` tool with skill `job-tracker:sweep` attached and the prompt "Run today's job-hunt sweep.", or on DeepSeek Harness a launchd or cron job that runs `dsh headless "/job-tracker:sweep"`). In Claude Desktop, turn the task's **Require this computer** option on. Why: without it the task can run in the cloud, which cannot reach the browser or the local tracker. Do not schedule it in the cloud for the same reason. If no scheduling tool is available, give the user the exact steps and the prompt text.
- Say plainly that the task only runs while the machine is awake and the app is open, and save the window as `desktop_usually_on`.
- Ask how the daily report should arrive: as the run's output (`artifact`), a file in the local folder (`file`, desktop runs only), or a Gmail draft to themselves (`email_draft`). Save it as `report_delivery`.
- `save_config` with `section: "schedule"`.
- Fields: `daily` (`days`, `time`, `tz`), `desktop_usually_on`, `report_delivery`.

### 11. Calibration run
- Run the sweep procedure from `/job-tracker:sweep` with `--limit 5 --calibration`.
- Show the 5 results with the verdict and the one-line reason for each. For queued ones, add the ready-to-type command with the real id, e.g. `/job-tracker:apply 42`, never a `<id>` placeholder.
- Before adding rules, Rules: load all types (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../../templates/rules.md`). A new rule must not repeat or contradict one. For each "no, because..." from the user, call `add_rule` with the text, the user's reason, the example and the `types` of the consumers it affects (omit for global). For each "yes, but you dropped it", follow `/job-tracker:correct`, which also governs deactivation and free-text preferences.
- Offer `/job-tracker:import` if the user has a legacy pipeline.

## Exit

Call `setup_status`. Done when `all_green`, or every amber item has a decision recorded with `record_setup_decision`. Tell the user what will happen tomorrow morning and how to see it (`/job-tracker:status`).
