---
name: source-roles
description: Per-source adapters for finding new job leads (LinkedIn MCP, employer ATS boards including Personio, SmartRecruiters and Workday, German and EU boards such as Bundesagentur Jobsuche, StepStone, Indeed.de, XING, Stellenwerk, Absolventa, JobTeaser, EURES, WeAreDevelopers and Berlin Startup Jobs, startup and remote boards, the US boards, and brokers). Use when a sweep or sourcer agent needs to pull leads from a source, when choosing which sources to run given the available capabilities, or when a source starts failing.
---

# Source roles

A source produces **leads**. A lead is never a verdict: every tag on it (location, salary, industry, seniority, remote) is unverified until `verify-employer` quotes the employer's own page.

## Hard rules

- **Load the rules first.** Rules: load `sourcing` (Reading rules: `${CLAUDE_PLUGIN_ROOT}/templates/rules.md`; Hermes: `${HERMES_SKILL_DIR}/../../templates/rules.md`). Do it before choosing sources or dropping a lead on the user's rules.
- **Mark every aggregator field UNVERIFIED.** Pass location and comp tags through as `raw_location` / `raw_comp`, never into `location_line` or `comp_*`. Why: wrong drops happened on stale tags (a years-old industry tag, a "UK only" that wasn't), and wrong approvals on "Remote" tags the ATS contradicted.
- **Dedupe before upsert.** Call `find_company` for every lead with its `url` (the employer ATS link when the card has one), the name, and the domain when known. `skip` (this posting is already tracked, a live application at the company, or `no_cold_apply`) means do not upsert. `seen` is a known company with nothing blocking: a different requisition there is a new lead, even after a rejection at that company, so upsert it. Why: a rejection blocks only the posting it was for; there is no company ban, and `gate_check` blocks a second application to the same posting.
- **Capability-aware.** Skip browser sources when no browser is reachable, and say so in the report ("skipped: no browser"). Do not mark the source `failed` for that: only real errors from the source count towards degradation.
- **Retry limits.** A failing call is retried at most twice, then the source is recorded with `set_source_status(name, "failed", error: <verbatim error>)` and the run moves on. Never loop.
- **Never guess a URL.** Sites with one fixed address (Work at a Startup, Wellfound, Welcome to the Jungle, We Work Remotely, Jack & Jill, the US boards, and the German and EU boards) start from the start URL in `reference.md`; that is not a guess, and they need nothing in config. User-specific URLs (employer boards in `sources.boards`, a university career portal, the JobCopilot tracker) come from config, the user, or an email that contains them. A login redirect on a guessed URL is not evidence the session expired.
- **Never type credentials or solve a university or board login.** A source behind a login (XING, JobTeaser, a university portal) runs only if the user is already signed in in the browser. Otherwise it is reported with the fix ("Log in to JobTeaser in the browser") and skipped.
- **Never print secrets.** Some sources embed API keys in request URLs (e.g. the YC index). Do not echo those URLs into output or the tracker.
- **Read-only.** No saving, liking, following, messaging, applying or changing preferences on any source. Never click a board's own apply button (Easy Apply, Easily apply, 1-Click Apply, Quick Apply). If a source's account settings would improve yield, tell the user and let them change it.
- **Never solve a bot check.** A visible CAPTCHA, "verify you are human" page or access-denied page on a source ends that source for the run: `set_source_status(name, "failed", error: <the page's own text>)` and move on. Big boards (Indeed, Glassdoor, ZipRecruiter) show these often in automation.
- **Board pay figures are not pay data.** Many boards show their own estimates ("Glassdoor est.", "Estimated", a ZipRecruiter range). Pass them as `raw_comp` at most, never into a pay verdict.
- **Employment type and hours are tags too.** "Werkstudent", "Praktikum", "Teilzeit", "20 Std./Woche" and a board's own category (e.g. "Studierendenjob") go through as `raw_type` (UNVERIFIED), never as a fact. `verify-employer` reads the type, hours and language requirements from the employer's page. Why: boards file internships under "Werkstudent" and the reverse, and the legal and pay consequences differ.
- **Search in the user's market language.** On German and EU boards run each title query in German and English (e.g. `Werkstudent` and `working student`, `Praktikum` and `internship`, `Abschlussarbeit` and `thesis`), with the gender suffix left out of the query. Build the term list from `prefs.titles` and `filters.employment_types`, and keep queries few.
- **One pass where one pass is enough.** Some boards return the same list for every keyword (see the table). Do not burn the run on repeat queries.

## Choosing today's sources

1. Start from `sources.enabled` in the config (`get_profile`). Skip any that `source_health` lists as `disabled`. An enabled source with no `source_health` row yet has never run: run it.
2. Drop browser-mode sources if `start_run` capabilities have `browser: null`. List them in the report as skipped.
3. A `degraded` source runs once more per day only if it is cheap; the report mentions degradation once, not every day.
4. Use `last_run` from `source_health` to fetch only what is new since the last run where the source supports it.
5. A source that cannot run for a reason the user can fix (logged out, no `sources.boards`) goes in the report with the exact fix in plain words, e.g. "Log in to Wellfound in the browser" or "Send me the job board URLs of companies to watch". Never tell the user to edit config.

## Source catalogue

The **ID** is the name used in `sources.enabled`, `sources.disabled`, `set_source_status` and the sourcer's `source`. Setup offers the sources group by group, in the order below.

### General

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `linkedin` | LinkedIn job search (MCP) | connector | Keyword relevance is poor; recruiter-farm spam repeats. Tags are leads only. A jobs-search error is not proof of logout: check the LinkedIn inbox call before reporting it unavailable. German-market filters are in `reference.md`. | 2 |
| `ats_boards` | Employer ATS boards (Ashby, Greenhouse, Lever, Personio, SmartRecruiters, Workday) | fetch | Most reliable source of truth. Also the verification target for every other source. Needs at least one URL in `sources.boards`. | 2 per board |
| `hn` | HN "Who is hiring" | fetch (Algolia API) | Monthly thread. Only read comments newer than `last_run`. Rarely lists Werkstudent or internship roles. | 2 |

### German job boards

Recommend this group when `filters.residence_country` is `DE`, or when `filters.employment_types` names a type that is mostly advertised in German (`werkstudent`, `pflichtpraktikum`, `thesis`).

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `arbeitsagentur` | Bundesagentur für Arbeit Jobsuche | fetch or browser | Search and detail pages render without login. Good Mittelstand and public-sector coverage, and it re-lists postings from other boards. The employer's contact details sit behind a security question: never solve it. The JSON API is unverified: use the pages. | 2 |
| `stepstone` | StepStone.de | fetch or browser | Search pages render with a plain fetch, but bot checks can appear. Many postings are StepStone-hosted forms ("Schnelle Bewerbung") with no employer page: say so in the lead. | 1 |
| `indeed_de` | Indeed Germany (de.indeed.com) | browser | Same quirks as `indeed`; a plain fetch is blocked (HTTP 403). | 1 |
| `xing` | XING Jobs | browser (logged in) | Search lists appear logged out; details and applying need a XING login. "Schnellbewerbung" is board-hosted: never use it. | 1 |

### Student and early-career boards

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `stellenwerk` | Stellenwerk | fetch or browser | Student-job portal run with universities, searched by city. Cards show the type ("Studierendenjob", "Absolvent:innenjob") and sometimes an hourly pay: both are `raw_` tags. Applying needs a student account: never create one. | 2 |
| `absolventa` | Absolventa | browser | Graduate and entry-level jobs. A plain fetch was refused (HTTP 405) when checked, so the page structure is unverified. | 1 |
| `jobteaser` | JobTeaser | browser (logged in) | Career-service portal that works only through the user's university login, so the offers depend on the university. A plain fetch is refused (HTTP 403). | 1 |
| `eures` | EURES (EU job mobility portal) | browser | Mirrors national employment-service vacancies (Germany's included), so it overlaps `arbeitsagentur`. Use it for roles in other EU countries. | 1 |

### European tech and startup boards

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `wearedevelopers` | WeAreDevelopers Jobs | fetch or browser | Tech roles across Europe. The page picks a country filter from the visitor's network location (it opened on the US filter during a check): always set the country yourself. | 2 |
| `berlinstartupjobs` | Berlin Startup Jobs | fetch (RSS) | Berlin only, with a public RSS feed. Items are teasers: the type, hours and language come from the employer page. | 2 |

### Startup and remote boards

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `waas` | YC Work at a Startup | browser (logged in) or index | Infinite scroll resists automation: query the page's own search index instead (see reference). A saved "US visa not required" chip can silently re-apply on navigation and zero the results; remove it if counts drop to zero. | 2 |
| `wellfound` | Wellfound | browser (logged in) | Hides roles unavailable to the user's location, so the pool is small and every keyword returns the same list. One keyword pass. | 1 |
| `wttj` | Welcome to the Jungle | browser (logged in) | Matcher ignores remote preference unless a location is set in the user's profile; tell the user once. Cards only render while the tab is painted. | 1 |
| `wwr` | We Work Remotely | fetch (RSS) | Remote-only board with public RSS feeds per category. Region tags ("Anywhere in the World", "USA Only") are UNVERIFIED. Not the same thing as WWR JobCopilot. | 2 |

### US job boards

Most roles here are open only to people who can work in the US. Recommend this group when `filters.work_authorisation` includes the US or `filters.residence_country` is `US`.

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `indeed` | Indeed (US) | browser | Largest US board. Bot checks are common. Sponsored cards repeat across pages and keywords, and staffing agencies repost the same req. "Easily apply" cards have no employer link: the employer's own posting must be found in `verify-employer`. | 1 |
| `glassdoor` | Glassdoor | browser (logged in) | A sign-in wall appears after a page or two when logged out. Overlaps heavily with Indeed. "Glassdoor est." pay is the site's estimate. | 1 |
| `ziprecruiter` | ZipRecruiter | browser | Syndicates postings from other boards, so many leads are duplicates. Pay ranges are often its own estimates. | 1 |
| `dice` | Dice | browser | Tech roles only. Many listings come from staffing agencies and are contract (C2C, W2): the agency is not the end client, and the end client is often unnamed. | 1 |
| `builtin` | Built In | fetch or browser | Tech companies, by US hub and remote. Listing pages render without a browser, and postings usually link straight to the employer's ATS. | 2 |
| `usajobs` | USAJOBS | browser | US federal jobs. Most postings are open to US citizens only ("This job is open to"). The posting is the agency's own text, so it is the employer page for `verify-employer`. | 1 |

### Brokers and trackers

| ID | Source | Mode | Reliability and quirks | Retry limit |
|---|---|---|---|---|
| `jack-and-jill` | Jack & Jill | browser + email | Intro broker. "Jack's take" may describe the recruiter's client, not the employer; salary figures are often its own estimates; cards often have no location. Open intros mean `no_cold_apply`. Its dashboard is read-only for reconciliation; coverage as in `inbox-and-calendar` (Window and coverage). | 1 |
| `jobcopilot` | WWR JobCopilot | browser | **Save-only.** Never enable auto-apply. Reconcile its Applied column every run via `triage-tracker` (read-only; keys and coverage as in `inbox-and-calendar`). Only for users who already have an account. | 1 |

### Retired by default

| ID | Source | Why |
|---|---|---|
| `justjoin`, `nofluffjobs`, `remoteok`, `remotive` | justjoin.it, nofluffjobs, RemoteOK, Remotive | Low yield, stale feeds, or blocked in past runs. |
| `monster`, `careerbuilder` | Monster, CareerBuilder | The parent company filed for bankruptcy in June 2025 and sold the boards; not tested since. |
| `simplyhired` | SimplyHired | Owned by Indeed and shows largely the same listings. Use `indeed`. |

Enable a retired source only if the user asks.

Per-source recipes (endpoints, selectors, index queries) are in `reference.md` next to this file. Read the relevant section before running a source.

## Lead format

Return one line per lead, and upsert it as `found`:

```
company | title | url | source | raw_location (UNVERIFIED) | raw_comp (UNVERIFIED) | raw_type (UNVERIFIED) | dedupe verdict | possible duplicate of <ids> (if unresolved)
```

`upsert_role` fields: `company`, `company_domain` if known, `title`, `url` (always when the card has one; prefer the employer ATS link over the aggregator link, see Identity below), `url_aliases` with `identity_evidence` for a confirmed listing of the same job, `ats` if obvious from the URL, `source`, `posted_at` if given. Do **not** set `location_line`, `location_type` or `comp_*` from aggregator data. Put the raw tags (including `raw_type`) in the reason of the `found` event if useful.

## Identity: one posting, one role

A role is matched on its exact URL or ATS posting, never on its title. Different reqs often share a title, and a lead without a URL always creates a new role.

- **Pass `url` whenever the lead has one.** Prefer the employer ATS link. When the card is an aggregator listing that links to an ATS page, pass the ATS link as `url` and the listing in `url_aliases`, with `identity_evidence` saying how you know (e.g. "The LinkedIn card links to <ATS URL>"). Why: without a URL, every re-run of the source created another row for the same job.
- **A lead without a URL, or with only a listing:** look at the same-title roles in `find_company`'s `matches[].roles` first, and `get_role` each. If one is this posting (its `urls` or `postings` hold the link, the card links to its ATS page, or the req number matches), update it with `upsert_role` and its `id` instead of creating a role, adding any new link as `url_aliases` with `identity_evidence`.
- **`possible_role_ids` after an upsert:** `get_role` each. Same posting, confirmed as above: `link_duplicate_role` with the role that has the history (or the older one) as `canonical_role_id`, the row just created as `duplicate_role_id`, and the confirmation as `evidence`; if it refuses because the other row moved last, swap them as its error says. Not confirmed: keep both and list the new row as `possible duplicate of <ids>` in the lead line.
- **`link_duplicate_role` needs positive evidence**: the same ATS URL or posting ID, a listing that links to the other row's ATS page, or the same req number. Never a matching title, company or location alone. Why: a wrong link hides one application's history under another role, and the submit gate reads that history.
- **Several `exact_role_ids`** mean the posting is tracked twice already. Do not upsert; list the ids for the sweep report.

## Early drops at source

Only these can be dropped without opening the employer page, and only with the lead's own text quoted as evidence:
- The title itself contains an excluded shape (e.g. "Backend Engineer", "Forward Deployed Engineer", "Engineering Manager") and the user's filters exclude it.
- An offshore staffing tell in the title: a country suffix like `(PK)`, `(IN)`, `(PHL)`, or a bracketed req code like `[AB123]`, for a country the user cannot work from.
- AI-training, data-labelling or expert-network review gigs, if the user's rules exclude them.
- The title names an employment type that `filters.employment_types` does not list (e.g. "Praktikant" when only `werkstudent` is listed, "Bachelorarbeit" when `thesis` is not), or a language the user does not have ("German-speaking", "Deutschsprachig" with no German in `filters.languages`). An empty `filters.employment_types` means no type filter.

Everything else goes to `verify-employer`.

## After the source

- `set_source_status(name, "ok", found: <count>)` on success.
- If every lead was already in the tracker, report "caught up" for that source. Do not widen queries to make up numbers.
