# Germany and the EU: working students, internships and junior roles

This guide covers what the plugin does differently for the German and EU early-career market: Werkstudent, internship and thesis roles, German-language postings and applications, and German job boards. Nothing in it is specific to one person: everything is driven by the settings `/laufbahn:setup` asks for. General setup is in [usage.md](usage.md).

The plugin lists questions for you to confirm. It never gives legal, tax, insurance or immigration advice.

- [What setup asks](#what-setup-asks)
- [Sources](#sources)
- [Employment types and what is checked](#employment-types-and-what-is-checked)
- [Language requirements](#language-requirements)
- [Applications in German](#applications-in-german)
- [Interview prep](#interview-prep)
- [What the plugin will not decide](#what-the-plugin-will-not-decide)
- [Known limits](#known-limits)

## What setup asks

In the hard-filters step (and the writing step for the last row):

| Setting | Meaning | Effect |
|---|---|---|
| `filters.employment_types` | Any of `werkstudent`, `internship`, `pflichtpraktikum`, `freiwilliges_praktikum`, `full_time`, `part_time`, `contract`, `thesis`. Empty means no type filter | A role whose verified type is not in the list drops, with the employer's quote |
| `filters.weekly_hours` | `min` and `max` hours per week you can work | A posting that cannot fit drops |
| `filters.enrolled` | Whether you are enrolled | A role that requires enrolment drops if you are not |
| `filters.languages` | Languages you can work in, each with a level A1 to C2 or native | A posting that requires a language you lack, or a higher level, drops |
| `filters.pay_floor` | Your minimum. Use `period: hour` and `contract_type` for student roles | Checked with the pay tool, in the same unit as the posting |
| `writing.language` | `auto`, `de` or `en` | `auto` writes in the language of the posting |

## Sources

Each is a source ID you pick in setup. All are read-only: the plugin never clicks a board's own apply button and never creates an account. "Checked" means it was fetched on 2026-11-16 from one network, with the result stated; anything else is marked unverified, and a source that behaves differently for you is recorded as failing rather than guessed around.

| ID | Source | Login | How the employer's own posting is reached | State |
|---|---|---|---|---|
| `arbeitsagentur` | Bundesagentur für Arbeit Jobsuche | none | The posting text often ends with the employer's careers link; contact details sit behind a security question that is never solved | Search and detail pages checked. A public JSON API is reported by others but unverified here: not used |
| `stepstone` | StepStone.de | none to read | Follow the employer link; many postings use StepStone's own form, and then there may be no employer page | Search pages checked |
| `indeed_de` | Indeed Germany | none, browser needed | "Apply on company site" link, else search the employer | Plain fetch blocked (403); browser path unverified |
| `xing` | XING Jobs | only if already signed in, for details | Link in the posting or the company name | Search results checked logged out; apply flow not used |
| `stellenwerk` | Stellenwerk, the student-job portal | account only to apply | Employer named on the posting | Home page and cards checked |
| `absolventa` | Absolventa | browser | Employer link on the posting | Plain fetch refused (405); structure unverified |
| `jobteaser` | JobTeaser | your university login | Employer link on the offer | Plain fetch refused (403); structure unverified; runs only if you are already signed in |
| `eures` | EURES | none | National service or employer | Portal reachable; search flow unverified. Mirrors national services |
| `wearedevelopers` | WeAreDevelopers | none | Employer ATS link | Reachable; opened on the US filter from the check network, so the country is always set explicitly |
| `berlinstartupjobs` | Berlin Startup Jobs | none | The board's apply link goes to the employer | RSS feed checked |
| `linkedin` | LinkedIn through the connector, with German filters | connector | Employer ATS | Existing source; German notes added |
| `ats_boards` | Employer boards you give: Ashby, Greenhouse, Lever, Personio, SmartRecruiters, Workday | none | The board is the employer page | Ashby, Greenhouse, Lever, Personio, SmartRecruiters and Workday endpoints checked |

Employer boards go in as URLs, for example `https://<company>.jobs.personio.de`. Personio is common in the German Mittelstand: its XML feed at `https://<company>.jobs.personio.de/xml` was checked and lists each opening with its employment type, schedule and seniority. A university career-service page you supply is read as a plain careers page.

Searches run in German and English (for example `Werkstudent` and `working student`), because the same job is often listed in one language only.

## Employment types and what is checked

The type is read from the employer's own posting, never from a board tag. Then:

- **Werkstudent.** Enrolment is checked against `filters.enrolled`. Weekly hours are compared with `filters.weekly_hours`. A posting that asks for more than 20 hours a week without limiting the extra hours to semester breaks is kept but flagged, because 20 hours a week in lecture periods is the commonly cited reference for Werkstudent status. Pay is converted to your pay unit using the hours the posting states before it is compared with your floor. An hourly floor is never compared with a monthly figure.
- **Pflichtpraktikum and freiwilliges Praktikum.** If you list only one kind, a posting that excludes it drops. Duration, university paperwork and pay are listed as things to confirm. An internship stated as unpaid is compared with your floor like any other figure.
- **Thesis.** Topic, supervisor, duration, pay and any NDA or publication terms are listed as things to confirm.
- A posting that names no type is not dropped; the type is noted as unknown.

The minimum wage is not stored in the plugin. When a stated hourly pay looks low, the plugin tells you to verify the current statutory figure and whether it applies.

## Language requirements

The plugin reads the whole posting for language requirements, not only the title.

| Posting says | Treated as |
|---|---|
| A level written out (B2, C1) | Exactly that level |
| Grundkenntnisse | About A2 |
| gute Kenntnisse, Arbeitssprache | About B2 |
| sehr gute Kenntnisse, fließend, verhandlungssicher, business fluent | About C1 |
| Muttersprache, native | C2 or native |
| von Vorteil, wünschenswert, nice to have | Soft: moves the score a little, never drops |

Against your `filters.languages`: a language you do not list, an explicit level above yours, or wording two or more levels above yours drops the role with the quote. Wording one level above yours, or an unqualified "Deutschkenntnisse", becomes one question to you instead of a drop. A German posting with no stated requirement is flagged if your German is below B2. The mapping is a starting point and the quoted words are always shown so you can overrule it with `/laufbahn:correct`.

## Applications in German

- **Language.** `writing.language` decides; with `auto` the posting's language does, and a bilingual posting or an English posting from a German company gets English unless it asks for German. If your German level is below B2, the plugin asks before writing German.
- **Anschreiben.** One page, formal Sie, a Betreff line that mirrors the posting's title and reference number, no "Sehr geehrte Damen und Herren" when a named contact exists, no guessing of gender from a first name ("Guten Tag Alex Kim," instead), "Mit freundlichen Grüßen", and an Anlagen line only for files that will really be attached. The PDF layout follows DIN 5008 approximately. Earliest start date and weekly hours go in the last paragraph; a pay expectation only when the posting asks for one.
- **Lebenslauf.** The plugin does not edit your CV. If you ask, it gives notes on the usual German layout. A photo, date of birth, nationality and marital status are customary on some German CVs and required on none; they are personal data, so the plugin never adds them and never fills them in a form.
- **Forms.** It fills Eintrittstermin, Wochenstunden, Studiengang, Gehaltsvorstellung (in the unit the field names) and the CV upload. It hands over Anrede and Geschlecht, Geburtsdatum, Staatsangehörigkeit, Familienstand, Konfession, Schwerbehinderung, Steuer-ID, Matrikelnummer and the photo. The Immatrikulationsbescheinigung and Zeugnisse are your files: the plugin does not store them, so a required upload slot is left for you and the role is queued with that question.
- **Consent and submit.** Datenschutz and Einwilligung boxes stay unticked unless you type `/laufbahn:allow-consent <role-id>`. Buttons such as "Bewerbung absenden" and "Jetzt bewerben" are treated as submit buttons: nothing is submitted without your saved auto-apply choice or your `/laufbahn:approve`.

## Interview prep

`/laufbahn:prep` switches to early-career mode for student and junior roles: stories come from projects, a thesis, coursework or a short Werkstudent job, in your words, and are never inflated. The sheet adds the usual working-student questions (hours and timetable, start date, study progress) in English and German. When the interview is German it is written in German, after checking your level, with your own stories translated rather than embellished. Items from the role's "confirm yourself" notes appear as questions to ask.

## What the plugin will not decide

It lists these for you to settle with the employer, your university, your health insurer or your Ausländerbehörde, and never states a conclusion:

- How many hours a Werkstudent may work during lectures, and how a contract handles it.
- Whether an internship must be paid and at what rate, and whether yours counts as a Pflichtpraktikum for your degree.
- The current statutory minimum wage and its exceptions.
- If you are not an EU citizen: how many days a year your residence permit lets you work, and what counts toward them.
- Social-insurance questions that depend on your hours and contract.

## Known limits

- `filters.pay_floor` holds one floor. If a Pflichtpraktikum and a Werkstudent job need different floors, say so in a rule; the pay tool still uses the one floor.
- The safety hooks match English field labels and button names. On German forms the plugin follows the same rules from its instructions (personal-data fields, consent boxes, submit buttons), but a hook may not stop a German-labelled control by itself. Review the form before you approve.
- The prose check that blocks dashes and volunteered gaps knows English phrases only. For German text the plugin runs its own German checks.
- Board layouts change. The checked statements above are a snapshot from 2026-11-16.
