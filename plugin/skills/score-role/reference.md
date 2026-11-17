# Early-career and German-market scoring rules

Read this when the role is a Werkstudent, internship or thesis role, or when the user has `filters.languages`, `filters.employment_types`, `filters.weekly_hours` or `filters.enrolled` set. Every rule applies only to a filter that is set: an empty list or `null` means that filter is off, and the value is still noted in `score_notes`.

This file lists what to check and what to ask. It is not legal advice and the plugin never states a legal conclusion: figures such as hour limits and minimum wage change, so each is "verify the current rule".

## 1. Employment type

Read the type from the employer's own posting (`verify-employer` copied the words). Map them to the plugin's types:

| Posting words | Type |
|---|---|
| Werkstudent, Werkstudentin, Werkstudierende, working student, student employee | `werkstudent` |
| Praktikum, Praktikant, Praktikantin, internship, intern | `internship` (see section 3 for the two kinds) |
| Pflichtpraktikum, "Praktikum im Rahmen Ihres Studiums", "für Studierende mit Pflichtpraktikum" | `pflichtpraktikum` |
| freiwilliges Praktikum, "auch als freiwilliges Praktikum" | `freiwilliges_praktikum` |
| Bachelorarbeit, Masterarbeit, Abschlussarbeit, Thesis, "Praxissemester mit Abschlussarbeit" | `thesis` |
| Vollzeit, unbefristet, Junior, Berufseinsteiger, Trainee, Traineeprogramm | `full_time` |
| Teilzeit without a student requirement | `part_time` |
| Minijob, geringfügige Beschäftigung | `part_time`; note "Minijob: its own earnings cap and rules, confirm with the employer" |
| freiberuflich, Freelance, Werkvertrag, Honorar | `contract` |

- A posting may name several types ("Praktikum oder Werkstudententätigkeit"): it matches `filters.employment_types` if any of them is listed.
- Duales Studium, Ausbildung and Referendariat are none of these types. With a non-empty `employment_types` they match nothing and drop; with an empty list, note the type and score normally.
- `befristet` (fixed term) is not a type. Note it.
- Type not stated: not a drop. Note `type: unknown`, and queue a question only if hours or pay depend on it.
- A generic `internship` in the user's list matches both kinds of internship. A user who lists only `pflichtpraktikum` or only `freiwilliges_praktikum` is held to that kind (section 3).
- No match with a non-empty `employment_types`: drop, category `employment_type`, evidence = the quote that names the type.

## 2. Werkstudent roles

1. **Enrolment.** Postings usually require enrolment ("immatrikuliert", "eingeschriebene Studentin", "Nachweis der Immatrikulation"). `filters.enrolled` false: drop with the quote. `null` or unset: queue the question "Are you enrolled at a university for the whole period?" once, then store the answer with `/laufbahn:correct`. If the posting names a field of study ("Studium der Informatik, Data Science oder vergleichbar"), compare it with the Education block of `profile` the same way as any required bullet: nothing honest to point at is a signal, usually a drop.
2. **Weekly hours.** Copy the stated hours ("bis zu 20 Std./Woche", "15 bis 20 Stunden", "flexibel"). Then:
   - The posting's minimum is above `weekly_hours.max`, or its maximum is below `weekly_hours.min`: drop, category `employment_type`.
   - A Werkstudent posting states more than 20 hours a week and does not say that the extra hours fall only in semester breaks: do not drop. Add to `Confirm yourself`: "Posting asks for N hours a week. 20 hours a week in lecture periods is the commonly cited limit for Werkstudent status; ask the employer how hours are handled during lectures, and verify the current rule with your health insurer or the university."
   - Hours not stated: note `hours: unknown`, no drop.
3. **Pay.** Werkstudent pay is hourly in most postings. Convert as in section 5. Statutory minimum wage: never quote a figure. If the stated hourly pay looks very low, add "Pay looks low: verify the current statutory minimum wage and whether it applies" to `Confirm yourself`.
4. **Start and duration.** Compare "ab sofort", "zum 01.04.", "befristet auf 12 Monate" with `prefs.availability` and the lecture calendar the user mentioned. A clear mismatch is a flag, not a drop.
5. **Hours during semester breaks.** If the posting offers more hours in the breaks, note it; it is a plus, not a filter.

## 3. Internships

- **Kind.** The posting says whether it is open to a Pflichtpraktikum ("Pflichtpraktikum möglich", "nur für Pflichtpraktikum", "kein Pflichtpraktikum", "nur freiwillig"). Treat "Praktikum" with no kind as both and add the question "Does the posting accept a Pflichtpraktikum? Ask before applying" only if the user listed `pflichtpraktikum` alone.
  - The user listed only `pflichtpraktikum` and the posting says it is voluntary only: drop with the quote.
  - The user listed only `freiwilliges_praktikum` and the posting is only for a Pflichtpraktikum: drop with the quote.
- **Duration.** Copy it ("3 Monate", "mindestens 6 Monate", "Beginn und Dauer nach Absprache"). Add to `Confirm yourself`: "Does this duration meet the minimum your study regulations (Prüfungsordnung) require for a Pflichtpraktikum?" when the user listed `pflichtpraktikum`.
- **University paperwork.** If the posting mentions a Praktikumsvertrag, a Praktikumsbescheinigung, supervision or recognition by the Prüfungsamt, or asks for an Immatrikulationsbescheinigung, note it. Ask the user whether their university needs its own form signed by the company.
- **Pay.** The user's `pay_floor` decides, through `check_pay`. Stated as unpaid ("unvergütet", "ohne Vergütung", "unpaid"): pass `comp_max` 0, which drops the role if the floor is above zero. "Vergütung nach Vereinbarung" or no figure: `unknown`, not a drop. For a voluntary internship that is unpaid or low, add to `Confirm yourself`: "Is this internship's pay subject to the statutory minimum wage given its type and length? Verify the current rules and exceptions before accepting." For a Pflichtpraktikum the same question applies in reverse: do not assume it may be unpaid.
- A user who accepts unpaid Pflichtpraktika but wants paid Werkstudent jobs has two different floors, and `filters.pay_floor` holds one. Use the floor the user set and add the other case as a rule if the user states it; never invent a second floor.

## 4. Thesis

- Copy topic, supervisor, duration and pay. Add to `Confirm yourself`: "Does your university allow a company-supervised topic, and who is the university supervisor?", "Are there NDA or IP clauses, and can you publish the thesis?" Pay for a thesis is often a small stipend: judge it with `check_pay` like any other.
- A posting that asks for the thesis topic "in Absprache" is fine; one that fixes a topic outside the user's field is a stack signal.

## 5. Pay for part-time work

`check_pay` takes the floor's period from `filters.pay_floor.period`. Convert the posting to **that** period, using the top of the band and the stated weekly hours, then pass the floor's period:

- Floor hourly, posting monthly: hourly = monthly × 12 ÷ (52 × weekly hours). With a range of hours, divide by the fewest hours stated (the top of the band, as everywhere).
- Floor hourly, posting yearly, full-time: hourly = yearly ÷ (52 × weekly hours), 40 hours when none is stated; write the assumption in `score_notes`.
- Floor monthly, posting hourly: monthly = hourly × weekly hours × 52 ÷ 12, using the smaller of the posting's maximum hours and `weekly_hours.max`.
- Floor yearly, posting hourly or monthly part-time: yearly = the same conversion × 12 or × 52; say so in `score_notes` and tell the user the figure assumes part-time hours, so a yearly floor will rarely suit a Werkstudent role.
- Weekly hours unknown and the periods differ: `unknown`, not a drop. Say why in `score_notes`.
- Write the original quote, the hours used and the converted figure in `score_notes`: "1,170 EUR per month for 15 h per week = 18 EUR per hour".
- Currency conversion works as in `SKILL.md`: look up the rate, pass `fx_rate`.

## 6. Language requirements

**Find them.** Read the whole posting (profile section "Ihr Profil", "Das bringst du mit", "Requirements", and any "Arbeitssprache" or "Working language" line), not only the title. The posting's own language is evidence about the workplace, not a requirement by itself.

**Level words, approximate CEFR** (a starting map; copy the posting's words into `score_notes` so the user can overrule it):

| Words | Level |
|---|---|
| a CEFR level written out (A2, B1, B2, C1, C2) | exactly that level |
| Grundkenntnisse, basic knowledge | A2 |
| gute Kenntnisse, good command, communicative, "Arbeitssprache ist ..." | B2 |
| sehr gute Kenntnisse, fließend, verhandlungssicher, business fluent, professional proficiency, "in Wort und Schrift" with "sehr gut" | C1 |
| Muttersprache, muttersprachlich, Muttersprachniveau, native, near-native | C2 or native |
| Kenntnisse with no qualifier | unstated |

**Hard or soft.** Required: the words sit in the requirements, or say "erforderlich", "setzen wir voraus", "Voraussetzung", "must", "required", "mandatory", "Arbeitssprache". Soft: "von Vorteil", "wünschenswert", "ist ein Plus", "idealerweise", "nice to have", "preferred", "gerne". Soft requirements move the score slightly and are never a drop.

**Decide, for each required language, against `filters.languages`:**
- The user lists no such language: drop, category `language`, evidence = the quote. "Deutsch oder Englisch" (either) is met by either language at the stated level.
- Explicit CEFR level above the user's: drop, with the quote and both levels.
- Qualitative wording that maps two or more levels above the user's (user B1, "fließend" mapping to C1): drop.
- Qualitative wording that maps exactly one level above the user's (user B2, "sehr gute Deutschkenntnisse" mapping to C1), or "Kenntnisse" with no qualifier: not a drop. Queue the single question "The posting asks for <quote>, which is about <level>. You list <language> at <level>. Apply anyway?" with the quote as evidence, or, when something else already blocks the role, put it under `Confirm yourself`.
- A posting written in German with no language requirement stated and the user's German below B2: not a drop. Add to `Confirm yourself`: "The posting is in German and does not state a language requirement; the team may work in German."
- `filters.languages` empty or unset: no language drop. Still note `language: <what the posting says>`.

**Languages the user lists above the posting's level** never hurt. The level in `filters.languages` is the user's own statement; never infer it from the CV or from the language they write in.

## 7. Non-EU students

The plugin never asks for or records nationality. This applies when the user (in setup or a rule) said that their right to work depends on a student residence permit. Then add once to `Confirm yourself:` for every Werkstudent, internship and thesis role: "Many non-EU students have a yearly limit on working days, and what counts toward it differs by role type. Confirm the figure and how this role counts with your Ausländerbehörde or your university's international office." Never state the limit, never say whether the role fits it. A role that needs a right to work the user does not have is dropped by the work-authorisation filter, not here.
