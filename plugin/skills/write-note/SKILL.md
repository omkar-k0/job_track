---
name: write-note
description: Writes outbound prose in the user's name (cover notes, German Anschreiben and English cover letters, form free-text answers, salary answers, recruiter reply drafts) in the language of the posting unless settings say otherwise, with a humanizer pass, no volunteered gaps, field-length checks and lint_prose before saving. Use whenever text will be read by an employer or recruiter, including /job-tracker:cover-letter, the prepare step of a sweep, and every free-text field in fill-form.
---

# Write note

Motivation and evidence, in the user's voice, sized to the field, and true.

## Hard rules

- **Never volunteer gaps.** No "the gap is", "what I don't have", "where I'd be learning", no closing paragraph of caveats, in anything sent in the user's name: cover notes, form answers, emails, messages. Why: a note that named a gap matching a required bullet was rejected in 38 minutes. Gaps go in the role's internal notes (`score_notes` or a `record` note), never to the employer.
- **Never overstate.** Every claim must trace to the `profile` or `stories` document (or `reusable-answers`, which is the user's own words). No inflated titles, scope, numbers or durations. Omitting a weakness is fine; asserting a strength that is not real is not.
- **Direct questions get honest answers**, including the gap. "What's your experience with X?" is answered truthfully. Multi-select skill boxes: tick only what the CV supports.
- **If a gap feels dishonest to leave out, that is a scoring signal.** Stop and raise it with the user instead of writing around it.
- **Check `maxLength` before drafting.** Every free-text field's limit is read from the form first. Long-form goes in the cover-letter field when there is one. Why: essays were once set into 255-character single-line inputs; programmatic value setting bypasses `maxlength` and the server truncates.
- **Respect the employer's AI policy.** If the form or posting says not to use AI for answers, leave those fields empty for the user and put raw material (facts, angle, relevant stories) in a `record` note for the role. If the employer invites LLM drafting, still leave questions that assess the user's own prompting or judgement to the user.
- **Run `lint_prose` before saving** any text (`add_artifact`, `create_draft`, `update_draft`, or a form field). Fix every issue and lint again. A hook lints Gmail draft bodies and denies em/en dashes and volunteered gaps; the auditor re-lints artifacts.
- **Salary answers use the field's currency and period.** Read the label for both (e.g. "gross, in $", "monthly"). Convert the user's band with the day's rate, looked up, never guessed. Submitted forms usually cannot be edited.
- **Write in the posting's language** unless `writing.language` is `de` or `en` (see Language below). German text has the same rules as English text: no volunteered gaps, nothing overstated, no dashes. `lint_prose` knows English phrases only, so for German you do the gap check yourself with the list in `reference.md`. Why: a German letter that says "leider habe ich keine Erfahrung mit X" passes the linter and fails the user.
- **Never put personal-data fields into a letter or CV note on your own.** Photo, date of birth, nationality, marital status, gender and ID numbers are never added, in any language. A German CV traditionally carries some of them: that is the user's call on their own CV file, not the plugin's.

## Inputs

- The role: title, employer page, `score_notes`, the form's questions and limits (from `fill-form` step 1 when filling).
- `get_document`: `profile`, `stories`, `reusable-answers`, and `voice` if present.
- `get_profile`: `writing` (word limit, humanizer, signature style, `language`), `filters.pay_floor`, `filters.pay_rule_with_equity`, `filters.languages`, `filters.weekly_hours`, `prefs.availability`.
- Rules: load `writing` (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../../templates/rules.md`). Apply every active one.

## Language

1. `writing.language` `de` or `en` wins. Missing or `auto`: use the language the posting's description is written in (not the site's menu language). A bilingual posting, or an English posting from a German company, gets English unless the posting asks for German documents ("Bewerbung bitte auf Deutsch"). A form field is answered in the form's language.
2. Check the user's level for that language in `filters.languages`. Below B2, or the language not listed: tell the user in one line and ask which language to use before drafting. Never write German for a user whose German is not good enough to defend it in an interview.
3. Same posting, same language for the note, the form answers and any reply drafts in that thread.
4. German conventions (Anschreiben layout, Anrede, Betreff, closing, salary and start-date wording, the German gap check, CV notes) are in `reference.md`. Read it before writing German.

## Cover note shape

150 to 200 words (or `writing.max_words_cover_note`).

1. **Why this company or role.** One specific thing about their product, problem or way of working, taken from their own page. Not their adjectives.
2. **One or two concrete experiences** from `profile`/`stories` that connect to it. Specifics: what was built, for whom, at what scale.
3. **Location and availability**, one line.
4. Sign-off.

Never echo the job description back. Never restate the CV; the CV carries the credentials, the note carries the reason.

**Early-career notes** (little or no work history): the concrete experience is a project, thesis, course project, hackathon or Werkstudent job from `profile` or `stories`, told as what was built, with which tools, and what came out of it. The study programme and semester, and the availability (start date, hours per week), go in the location and availability line. Never inflate a course project into professional experience, and never list a skill the `profile` does not carry.

## Free-text form answers

- Prefer adapting from `reusable-answers` for recurring questions ("tell us about yourself", "most complex thing you built", "how do you use AI tools").
- Write to the field's limit. A 255-character field gets one or two sentences, not a trimmed essay.
- "How did you hear about us": the true source.
- Availability and notice: from `prefs.availability` and `reusable-answers`.

## Salary answers

1. Read the field label: currency, period (year, month, day, hour), gross or net, number-only or text.
2. Take the user's band from `filters.pay_floor` and `reusable-answers`.
3. Convert if the currency differs: look up today's rate (central bank reference rate or similar), write the converted figure, and note the rate and source in the role's notes. Convert the period too (annual vs monthly).
4. Equity: follow `filters.pay_rule_with_equity`. A text field may take "negotiable depending on the equity package" when equity is offered.
5. A **number-only** field with equity on offer: ask the user for the figure. It is their money and the anchor sticks.
6. Part-time and student roles: answer in the unit the field asks for (per hour or per month, gross) and convert with the hours the posting states, never with assumed ones. If the field asks for a monthly figure and no hours are stated, ask the user. German salary and start-date fields (Gehaltsvorstellung, Eintrittstermin, Wochenstunden) are in `reference.md`.

## Emails and reply drafts

- Plain, short, answers the question asked.
- Signature: name only (`writing.signature_style`). No bare URLs; Gmail rewrites them into redirect links. Say "CV attached, with links on it" only when the CV will be attached (see `inbox-and-calendar` step 4). Why: a draft that says attached and is not makes the user look careless if they send it unchanged.
- Never propose availability when the recruiter sent a booking link (see `inbox-and-calendar`).

## Humanizer pass

If the `anthropic-skills:humanizer` skill or another writing-style skill is available, load it and apply it to every piece of outbound prose. Also apply the `voice` document if present. Whether or not a skill is available, check these:

- No em dashes or en dashes. Use commas, colons, full stops or parentheses.
- No "not X but Y" / "it's not just X, it's Y" constructions.
- No fake-candid openers: "Honestly?", "Here's the thing", "To be frank", "Where I'm honest about...".
- No forced groups of three.
- No sales language or inflated claims ("passionate", "thrilled", "world-class", "cutting-edge", "seamless").
- No generic positive endings ("I look forward to the opportunity to contribute...").
- Plain verbs: "is", "has", "built", "ran". Not "serves as", "boasts", "represents", "leverages", "spearheaded".
- No stock AI words ("delve", "tapestry", "landscape", "testament", "pivotal", "foster").
- Vary sentence length. Prefer the active voice.
- Curly quotes and decorative symbols are fine in moderation; dashes are not.
- German text follows the same list. Use the German equivalents in `reference.md`.

## Save

1. `lint_prose` with `text` and `max_words` (for cover notes). Fix and repeat until `ok`. For German text it still catches dashes and length; the German gap and humanizer checks in `reference.md` are yours to run.
2. `add_artifact` with the right `kind` (`cover_note`, `form_answers`, `cover_letter_pdf`, `gmail_draft`) and `content`. Read the returned lint issues; if any, fix and save again.
3. Record internal reservations and gaps for this role in a `record` note (no status), never in the artifact.
