# Form filling reference

Observed behaviour per ATS and widget. Treat each recipe as one option among several: the same ATS has behaved differently on different days. The rule that always holds is: set, read back, switch method if wrong.

## Input methods

| Method | How | Notes |
|---|---|---|
| `form_input` | Browser tool sets the value by ref | Can update the DOM without updating React state. If the DOM already holds the same string it fires no change and reports `previous: "<same>"`. Clear to `""` first, then set, and check `previous: ""`. |
| Keyboard entry | Click field (fresh ref), select all (cmd/ctrl+a), Delete, type | Most robust on React forms. Can drop or reorder characters in some search boxes; read back. |
| Native setter | `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)` then dispatch `input` and `change` | Works on plain inputs on some ATSs; ignored by React comboboxes. Never use dispatched events on a submit control. |
| Coordinate click | From a **fresh** screenshot only | Last resort for custom dropdown options. Never after a re-render without a new screenshot. |

## Ashby

- Single-line text inputs: sometimes reject `form_input` (submit says "Missing entry for required field" on fields that look filled) and need keyboard entry; on other days the reverse. Read back and switch.
- Textareas: `form_input` usually works.
- Country/location combobox: filter (type or `form_input` on the search box), then click the option row.
- Yes/No button pairs lose their selection when a nearby combobox is clicked. The underlying checkbox may report unchecked even when visually selected; verify by screenshot after the section.
- Check the board for a deadline field and application caps ("may not apply more than N times in 60 days"). If two reqs at one employer fit, which to file is the user's choice.
- A past "Deadline to apply" does not always mean closed; the form decides.

## Greenhouse

- Plain inputs accept a native setter plus `input`/`change` events.
- Country and location comboboxes need keyboard entry **and** an explicit click on the dropdown option. The hidden input may stay empty even when set; confirm visually.
- Questions are available by fetch at `boards-api.greenhouse.io/v1/boards/<token>/jobs/<id>?questions=true`.
- Required Degree or education fields: leave blank if the CV has no education section and flag it. Do not guess.

## Lever

- Mostly plain inputs; `form_input` usually works. Read back.
- "Additional information" is the cover-letter field.

## Workable

- Screening questions are often single-line inputs with small `maxlength` (e.g. 127 or 255). Write to the limit.
- Read every required question before writing anything.

## Personio, SmartRecruiters and other German-market ATS forms

- Personio career pages (`<company>.jobs.personio.de`), SmartRecruiters (`jobs.smartrecruiters.com/<company>`) and the German HR platforms (softgarden, rexx, d.vinci, Kenjo and similar) were not observed field by field. Use the general method: survey the form, set, read back, switch method.
- Many German forms ask for the documents as separate uploads (Lebenslauf, Anschreiben, Zeugnisse) and end with a privacy-notice box that is required to submit. That box is a consent: leave it and queue the role with the question.
- Date fields usually want `TT.MM.JJJJ`, decimals take a comma ("18,50"), thousands a dot ("45.000"): read the value back as the page shows it, and check the unit and period next to the field (brutto, netto, pro Stunde, pro Monat, pro Jahr).
- Cookie banners: "Alle ablehnen", "Nur notwendige" or "Ablehnen" are the decline buttons.

## German form fields: fill, hand over, or never

| Field label (typical) | Action |
|---|---|
| Vorname, Nachname, E-Mail, Telefon, Wohnort | Fill from `profile` / `reusable-answers`. Read the email back. Street and Postleitzahl only if `profile` has them |
| Anrede (Herr, Frau, Divers), Geschlecht | Leave for the user (gender) |
| Geburtsdatum, Geburtsort, Staatsangehörigkeit, Familienstand, Konfession, Schwerbehinderung, Foto | Never. List for the user |
| Matrikelnummer, Steuer-ID, Sozialversicherungsnummer, Ausweisnummer | Never. List for the user |
| Eintrittstermin, frühester Starttermin, verfügbar ab | Fill from `prefs.availability`; never invent a date |
| Wochenstunden, gewünschte Arbeitszeit | Fill from `filters.weekly_hours` inside the posting's range. More than 20 a week for a Werkstudent role in lecture periods: ask the user first |
| Gehaltsvorstellung | `write-note` salary rules, in the field's unit (brutto, pro Stunde, pro Monat) |
| Kündigungsfrist | From `reusable-answers`; if absent, leave and ask |
| Studiengang, Hochschule, Abschluss, Semester | From `profile` Education |
| Deutschkenntnisse, Englischkenntnisse | The level from `filters.languages` or `profile`, never higher |
| Arbeitserlaubnis, "Dürfen Sie in Deutschland arbeiten?" | The work authorisation statement from `reusable-answers` if it has one; permit type, number and expiry never; otherwise leave |
| Lebenslauf (upload) | `get_cv` |
| Anschreiben (upload or text) | The role's `cover_letter_pdf` file, or the `cover_note` text if the field is text |
| Zeugnisse, Immatrikulationsbescheinigung, Praktikumsbescheinigung | The user's own files: leave the slot and list it |
| Wie haben Sie von uns erfahren | The true source |
| Datenschutzhinweise gelesen, Einwilligung, Talentpool, Newsletter | Consent: leave unticked, queue with the question; see `/laufbahn:allow-consent` |

## Typeform-style one-question-at-a-time forms

- The worst dropdowns seen. The page text and `aria-selected` report the keyboard highlight, not the committed answer, while the list is open. The only reliable read is a screenshot with the dropdown closed.
- A Submit or Next button can sit under the open option list, so clicking it re-opens the list and picks an option. Close the list and confirm the field text by screenshot before any click near it.
- Recipe that worked: click the chevron at the right edge of the field, wait a few seconds for the animation, take a fresh screenshot, click the option row from that screenshot, confirm by screenshot.

## Plain HTML forms (small custom career pages)

- `form_input` often works; keyboard entry sometimes does not. Read back.

## Profile-style forms (e.g. YC Work at a Startup profile, saved rows)

- Autocomplete company/employer fields backed by a database: a programmatically set value can make the server reject the whole save. Type with real keystrokes, then press Escape to dismiss the dropdown.
- Already-saved rows: `form_input` can appear to work and then revert on save. Use keyboard entry.
- Confirm a save by navigating away and back, or via the read-only preview. A reload right after save may show optimistic client state.
- Only edit profile fields the user asked you to edit.

## LinkedIn Easy Apply

- Uses the CV saved on the user's LinkedIn profile.
- Untick "Follow this company" (it is a public action on their profile).
- Usually no cover-letter field; keep the note in the tracker artifact.
- The final "Submit application" button is gated like any other submit.

## Account-gated (join.com, Workday, Dex, anything behind sign-in)

Prepare all answers, leave the tab open, `record` with `status: "queued"` and a `question` naming the tab and what is left, and stop. Never create the account.

## Cookie banners

Decline before filling ("Reject all", "Necessary only"). If only "Accept" exists, leave the banner and work around it if the form is usable; otherwise ask the user.

## CAPTCHAs and bot checks

Invisible checks that pass on their own: fine. Any visible challenge, puzzle or "verify you are human": stop, tell the user, leave the tab open.

## File uploads

1. Hidden input: `el.style.display='block'; el.setAttribute('aria-label','CV upload')`, then re-read the page for a fresh ref.
2. `file_upload` with the path from `get_cv`. If the path is rejected as not readable by the session, stage the file into the session first and use the staged path.
3. Confirm the filename is shown. Some forms parse the CV and overwrite fields you already filled; re-read all fields after upload.

### Gmail draft attachments

Used by `inbox-and-calendar` when the mail connector cannot attach files.
1. Open the Gmail mailbox recorded in `accounts.inbox`. Confirm the signed-in account matches it; switch accounts if needed, and stop if you cannot identify the right mailbox. Find the draft by subject, then confirm its recipient and body match the draft just created before opening it. Subjects alone are not enough to identify a draft.
2. Find the compose window's `input[type=file]` (Gmail keeps it hidden), expose it as in step 1 above, and `file_upload` the path from `get_cv`. Do not click the paperclip / Attach files button: it opens the system file picker, which browser tools cannot drive. Use the hidden file input only.
3. Wait until the attachment chip shows the file name with no progress bar, and take a screenshot.
4. Close the compose window with its close control (the X, labelled "Save & close"). Never use "Discard draft" or a send key: the hooks block sending, and discarding deletes the draft.

## Useful snippets

Max lengths before drafting:
```js
[...document.querySelectorAll('input,textarea')].map(el => ({id: el.id, name: el.name, max: el.maxLength}))
```

Committed value of a select-like widget: screenshot with the list closed. Do not trust `get_page_text` while a list is open.
