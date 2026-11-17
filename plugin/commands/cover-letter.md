---
description: Write a cover letter for one role (German Anschreiben or English), optionally as a one-page A4 PDF.
argument-hint: "<role-id> [--pdf] [--lang de|en]"
---

Write a cover letter for the role in `$ARGUMENTS`.

**If the tracker tools are missing** (search for them first if tools are deferred), or a hook error says `node` could not start: Node.js, which the plugin runs on, is missing or too old. Tell the user that in one sentence, offer to run `/laufbahn:setup` (it installs Node.js), and stop.

1. Parse the role id and the optional `--pdf` and `--lang de|en` flags. If the role id is missing, call `open_items` and ask which queued role.
2. **Pick the language.** `--lang` wins, then `writing.language` when it is `de` or `en`, otherwise the language of the posting (see Language in `write-note`). If the user's level for that language in `filters.languages` is below B2 or missing, ask which language to use before writing.
3. Load the `write-note` skill and follow it: read the role, the employer page, `profile`, `stories`, `reusable-answers` and `voice` (if present). For German also read its `reference.md`. Rules: load `writing` (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../templates/rules.md`). Motivation first, 150 to 200 words unless config says otherwise. Humanizer pass. `lint_prose` must pass before saving. Never add a photo, date of birth, nationality, marital status or ID number to a letter.
4. Save the text with `add_artifact` (`kind: "cover_note"`) and show it to the user.
5. **With `--pdf`, English:** lay it out as one A4 page, standard letter layout, in this order:
   1. Name and contact header (name, email, phone if in `profile`, city and country). No bare tracking links.
   2. A thin horizontal rule.
   3. Recipient block (company name, hiring team or named person if known) and the date.
   4. A role title line, e.g. "Senior Product Engineer". No "Re:".
   5. Salutation ("Dear <name>," or "Dear <Company> team,").
   6. Body (the note).
   7. "Kind regards," and the user's name.
6. **With `--pdf`, German (Anschreiben):** one A4 page in this order: sender block (name, email, phone if in `profile`, city; the street only if `profile` has it), recipient block, place and date on the right, the Betreff line in bold with no "Betreff:" label, the Anrede, the body, "Mit freundlichen Grüßen", the name, and an `Anlagen:` line only for files that will really be attached. The Anrede, Betreff and closing rules are in `reference.md` of `write-note`: a named contact gets "Sehr geehrte Frau X," or "Sehr geehrter Herr X," (never "Sehr geehrte Damen und Herren," in that case), and a contact whose form of address is unknown gets the full name after "Guten Tag". Margins about 25 mm left and 20 mm right.
7. **Rendering and checking (both languages).** Render it with a PDF-capable skill or tool if one is available (e.g. the `pdf` skill), otherwise HTML printed to PDF. Then **verify visually**: render page 1 to an image and look at it. Check it is one page, nothing is clipped, there are no dashes or placeholder text, and the name and date are right. Fix and re-render until it passes. Save with `add_artifact` (`kind: "cover_letter_pdf"`, `ref` = the file path or link) and give the user the file.
