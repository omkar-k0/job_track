---
name: interview-prep
description: Builds an interview prep sheet for one company and stage from the user's own STAR stories, profile and the role's posting, plus research on the company and the interviewers, with questions to ask. Has an early-career mode (projects, thesis and coursework as stories, typical Werkstudent and internship questions) and a German-language option. Use for /job-tracker:prep, when an interview is booked or a booking link arrives, or when the user asks how to prepare for a specific interview.
---

# Interview prep

Help the user walk in with the right stories ready. Everything they will say must be true and theirs.

## Hard rules

- **No invented claims.** Every story, number and technology in the prep comes from the `stories` or `profile` document (or `reusable-answers`). If a likely question has no honest story behind it, say so to the user in a "Thin spots" section with an honest way to answer. Never draft a fictional example.
- **Use the user's words.** Adapt their stories; do not rewrite them into a different voice or add drama.
- **Research is cited.** Each company fact carries its source (URL). Mark anything older than a year.
- **Stage-aware.** A recruiter screen, a hiring-manager call, a system design round and a final with a founder need different prep. Ask the stage if the tracker does not have it.
- **Short.** One screen per section. The user reads this before a call, not instead of preparing.
- Interviewer research is limited to professional, public information (role, team, public talks or posts about the work). Nothing personal.
- **Early-career mode never inflates.** A course project is a course project, a thesis is a thesis, a Werkstudent job is a Werkstudent job. Say what the user did, not what the team did. If the user has no story for a typical question, say so in Thin spots; offer to help them turn a real project into a story by asking questions, and save it to `stories` only after they confirm every line.
- **Legal and immigration questions are surfaced, never answered.** Hour limits during lectures, internship pay and minimum wage, and student work permits go on the sheet as "Confirm with the employer / your university / the Ausländerbehörde", with no legal conclusion.

## Inputs

- `find_company` and `open_items`: the role, the interview (`starts_at`, `tz`, `stage`, `people`, `link`, `notes`).
- The role's posting (employer page), `score_notes`, the cover note and form answers sent (artifacts), and any recruiter emails in the thread.
- `get_document`: `stories`, `profile`, `reusable-answers`.
- Rules: load `inbox`, plus `writing` if you draft any text for the employer (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../../templates/rules.md`).
- Web search and fetch: the company site, product docs, changelog or blog, recent funding or launches, engineering blog, public talks by the interviewers.

## Procedure

0. **Choose the mode.** Early-career mode when the role's type is `werkstudent`, `internship`, `pflichtpraktikum`, `freiwilliges_praktikum` or `thesis` (see `score_notes`), or the posting says junior or entry level, or the Experience section of `profile` has little or no paid work, or the user asks for it. Then read `reference.md` (typical questions, story sources, German phrases). **Language:** the interview is in German when the posting or the recruiter's mails are German, or the user says so. Then write the questions and the answer wording in German, check the user's level in `filters.languages`, and see the German section of `reference.md`.
1. **Pin the interview.** Company, role, stage, time in the user's timezone, people, format (video, take-home, live coding, system design, case, portfolio review, work sample, panel, teaching demo, Kennenlerngespräch, Assessment Center).
2. **Re-read what was sent.** The cover note and answers the employer has seen. The interview will probe them; the prep must be consistent with them.
3. **Research the company** (10 to 15 minutes of reading, not more):
   - What the product does, for whom, and how it makes money.
   - Stage, size, funding, recent launches.
   - How the work is done there: for engineering, stack, how they ship and public incidents or write-ups; for other fields, the tools, methods, standards or regulators and public work that apply.
   - The interviewers' roles and what they have written or said publicly about the work.
4. **Predict the questions.** From the posting's requirements and responsibilities, the stage, and the company's current problems. 8 to 12 questions, most likely first. In early-career mode add the usual student questions from `reference.md` (hours and timetable, start date, study progress, why a Werkstudent or internship role here), and take technical topics from the posting's own requirements.
5. **Map stories to questions** with STAR. For each predicted question pick the best story from `stories`, and write:
   - **Situation** (one line), **Task** (one line), **Action** (the user's own actions, 2 to 3 lines), **Result** (with the number if the story has one).
   - Which requirement in the posting it answers.
   - The likely follow-up and the honest short answer.
   A story can serve several questions; note which angle to lead with for each.
6. **Thin spots.** Requirements with no strong story. Early-career: also a typical question with no project, course or job behind it. For each: the closest true experience, and a plain honest answer if asked directly. Gaps are answered honestly when asked; they are not raised unprompted.
7. **Questions to ask** (5 to 7), specific to this company and stage. In early-career mode bring one or two about mentoring, the first weeks' tasks, thesis supervision or the chance of continuing after the internship, plus the open items from `score_notes` under `Confirm yourself:` worded as questions. Prefer questions about how the work happens (how decisions get made, what the first 90 days look like, how they ship and measure, what is hard right now) over things the website answers. Include one about whatever made the user want the role.
8. **Logistics.** Time in the user's timezone, link, who is on the call, what to have open (CV, the posting, the cover note), and the booking state on the invite calendar. For a student role also: the semester timetable and exam dates the user mentioned, and the Immatrikulationsbescheinigung, which the user supplies.
9. Save the sheet with `add_artifact` (`kind: "note"`, `ref: "prep:<stage>"`) and show it.

## Sheet layout

```
# <Company>, <Role>: <stage>, <day time tz>
People: ... | Link: ... | Format: ...

## The company in five lines
## Why you (two lines, from the cover note)
## Likely questions → stories (STAR)
## Thin spots and honest answers
## Questions to ask
## Confirm yourself (only when score_notes has items)
## Logistics
```

## System design and technical rounds

- Pull the user's real systems from `profile` and `stories` that resemble the company's product, and list the trade-offs they actually made.
- Suggest a short practice outline (requirements, API, data model, scaling, failure modes) using the company's own domain as the example.
- Do not invent architecture the user did not build.
