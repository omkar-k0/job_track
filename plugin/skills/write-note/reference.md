# German-language applications

Read this before writing German text for an employer. The general rules in `SKILL.md` (no volunteered gaps, nothing overstated, field limits, humanizer pass) apply unchanged. This file adds the conventions that differ. Everything here is about wording and layout: the safety rules in the hooks and in `fill-form` still win, including the personal-data and consent rules.

## What `lint_prose` does and does not check in German

- It does flag em dashes, en dashes, spaced hyphens used as dashes, and text over `max_words`. German typography often uses a Gedankenstrich (an en dash with spaces): do not. Use a comma, a colon, a full stop or parentheses.
- Its volunteered-gap, "not X but Y", fake-candid and stock-phrase patterns are English only. For German run the checks below yourself on the final text.

**German gap check.** Remove or rewrite any sentence that matches these shapes:
- "leider habe ich (noch) keine Erfahrung mit ...", "ich habe keine / kaum / wenig Erfahrung", "mir fehlt ...", "ich bin neu in ...", "ich muss mich erst einarbeiten".
- "zwar ... aber ..." used to admit a shortfall ("Zwar habe ich noch nicht mit X gearbeitet, aber ...").
- "auch wenn ich noch nicht ...", "obwohl ich nicht ...", "meine Kenntnisse in X sind begrenzt".
- A closing paragraph of caveats.

**German humanizer list.** Avoid: "hochmotiviert", "begeistert", "brenne für", "Teamplayer", "dynamisch", "innovativ" as self-description, "ich bin die perfekte Besetzung", "mit großem Interesse habe ich Ihre Anzeige gelesen", "hiermit bewerbe ich mich", "über eine Einladung zu einem persönlichen Gespräch freue ich mich sehr", "Ihr renommiertes Unternehmen". Prefer plain verbs ("ich habe gebaut", "ich arbeite mit"), concrete nouns and numbers from `profile`. Do not translate English idioms word for word.

## The Anschreiben (cover letter)

Default length: the same word cap as English (`writing.max_words_cover_note`, 200 unless changed). German takes more words for the same idea, so write the idea shorter, not the cap longer. One A4 page.

**Formal Sie.** Use Sie and Ihr throughout. The posting addressing readers with "du" does not change that: keep Sie and use a modern, neutral greeting (below). The user can edit the draft if they want to mirror a startup's tone.

**Anrede (salutation):**
- A named contact in the posting or the recruiter's mail: "Sehr geehrte Frau Müller," or "Sehr geehrter Herr Schmidt," with any title as the posting gives it (Dr., Prof.). When the name does not reveal the form of address and the posting gives none, use the full name without guessing: "Guten Tag Alex Kim,". Never infer gender from a first name.
- No named contact: "Guten Tag," or "Sehr geehrtes Team der <Firma>,". Do not use "Sehr geehrte Damen und Herren," when a named contact exists. When none exists it is acceptable but stiff; prefer the two forms above unless the posting itself is formal (public sector, law, banking).

**Betreff (subject line):** one line, no "Betreff:" label, mirrors the posting's title including "(m/w/d)" or "(w/m/d)" as written, plus the reference number if the posting has one. Example shape: `Bewerbung als Werkstudent Data Science (m/w/d), Kennziffer 12345`. No dash between the parts: use a comma.

**Body, in this order:**
1. Einstieg: why this company or this task, from the employer's own page, in one or two sentences. No flattery.
2. Hauptteil: one or two concrete experiences from `profile` or `stories`, with what was built, with which tools, and what came out of it. For early-career applicants a project, thesis, course project or Werkstudent job. The study programme, university and semester are facts and go here or in the next part.
3. Schluss: earliest start date (Eintrittstermin) and hours per week (Wochenstunden) from `prefs.availability`, `filters.weekly_hours` and the posting, in one sentence. Pay expectation only when the posting asks for it ("Bitte nennen Sie Ihre Gehaltsvorstellung"): then give the figure from `reusable-answers`, gross, in the unit the posting names (per hour, per month). No generic closing sentence.

**Grußformel:** "Mit freundlichen Grüßen" and a blank line, then the user's name. In an e-mail body "Viele Grüße" is acceptable when the recruiter's own mails use it; the PDF letter keeps "Mit freundlichen Grüßen". Signature: name only (`writing.signature_style`).

**Anlagen (enclosures):** add the line `Anlagen: Lebenslauf` only for files that will really be attached. The CV comes from `get_cv`. An Immatrikulationsbescheinigung or Zeugnisse are the user's own files: name them under Anlagen only when the user has said they will upload them; otherwise leave them out and list them in the hand-off summary.

**Layout for the PDF** (DIN 5008, approximately; nobody checks it with a ruler, but the order matters), top to bottom on one A4 page:
1. Sender block: name, email, phone (if in `profile`), city and country. Add the street only if the user's `profile` has it. No photo, no date of birth.
2. Recipient block: company, the named person or "Personalabteilung" or the team, the address if the posting gives one.
3. Place and date on the right, e.g. `Berlin, 16. November 2026`, or the date alone when no city is in `profile`.
4. Betreff, in bold.
5. Anrede, then the body, then Grußformel, then the name, then Anlagen.
Margins about 25 mm left and 20 mm right, 11 to 12 pt sans-serif or serif, single line spacing, a blank line between paragraphs.

## Free-text form answers and salary fields

- Answer in the form's language. A German form with an English CV link still gets German text unless `writing.language` says otherwise.
- **Gehaltsvorstellung:** use the unit the field names ("brutto pro Stunde", "brutto pro Monat", "Jahresbruttogehalt"). For a Werkstudent role convert the user's hourly figure to a monthly one only with hours the posting states. No stated hours and a monthly field: ask the user. A free-text field may take "nach Vereinbarung" only if `reusable-answers` says the user wants that.
- **Eintrittstermin / frühester Starttermin:** from `prefs.availability`; a date, "ab sofort" or "zum 1. Oktober" as the user phrased it. Never invent a date.
- **Wochenstunden / gewünschte Arbeitszeit:** from `filters.weekly_hours` or the posting's own range. If the posting states a range, answer inside it. A Werkstudent hours answer above 20 per week during lectures is the user's decision: put the question to them (see `fill-form`).
- **Studiengang, Hochschule, Semester:** from `profile` Education. Immatrikulationsbescheinigung upload: not stored by the plugin, left for the user.
- **Wie haben Sie von uns erfahren:** the true source for the role, never a made-up one.
- **Deutschkenntnisse / Englischkenntnisse (level dropdown or text):** the level from `filters.languages` or `profile` Languages. Never rate higher than the user stated. A self-rating screening question is a direct question: it gets the honest level.

## Reply drafts to German recruiters

Plain, short, formal Sie, Betreff as "Re:" thread subject where the connector threads it, "Mit freundlichen Grüßen" and the name. A recruiter who writes "du" and a first-name signature is still answered with Sie unless the user says to mirror. Booking link present: no draft (see `inbox-and-calendar`).

## Lebenslauf notes (only when the user asks for CV advice)

The plugin never edits the user's CV file. If asked for notes, give these as suggestions:
- Tabular, reverse chronological, one page for a student, two at most. Dates as MM/JJJJ.
- Sections that fit early-career: Kontakt, Ausbildung (programme, university, expected end, relevant courses, thesis topic), Praktische Erfahrung (Werkstudent jobs, internships), Projekte (with the tools used), Kenntnisse (IT, languages with CEFR levels), Engagement.
- Date of birth, nationality, marital status and a photo have been customary on German CVs. None is required. They are personal data: the plugin never adds them and never fills them in a form; whether the user's own CV carries them is their decision.
- No explanations of gaps unless the user decides to add one.
- Zeugnisse and the Immatrikulationsbescheinigung are separate attachments, supplied by the user.
