# Source recipes

Read the section for the source you are running. Endpoints and page structures change; if a recipe fails twice, record the verbatim error with `set_source_status` and stop.

Build queries from `prefs.titles`, `prefs.stack_want` and `filters.work_mode`. Keep them few and specific.

## LinkedIn job search (MCP connector)

- Use the connector's job search tool with 2 to 4 title queries, remote filter, posted in the last 24 hours (or since `last_run`).
- Expect recruiter farms posting the same title under many company pages. Collapse near-duplicates before dedupe.
- External apply links are often wrapped. Resolve them with `new URL(href).searchParams.get('url')` when reading in a browser, and prefer the employer ATS URL for `url`.
- A search error (e.g. HTTP response failure) while the inbox call works means the search endpoint is failing, not that the user is logged out. Report it as a connector error.
- Read-only: never message, connect, follow or Easy Apply from a sweep.
- **Germany and EU.** Set the location to the country or a city (not "Worldwide"), and run German and English title terms (see `SKILL.md`). Use the page or connector filters for job type (internship, part-time), experience level (internship, entry level) and posting age; do not hand-build filter codes in URLs. Postings carry "(m/w/d)" suffixes and often a German body under an English title: read the posting language yourself. Expect staffing-agency and Zeitarbeit reposts. "Easy Apply" is LinkedIn-hosted, so the employer's page must come from `verify-employer`.

## Employer ATS boards (fetch)

Public posting APIs, no login. Use them to list a known employer's openings and as the verification source. The boards to sweep are the URLs in `sources.boards`; read the board token or company slug from each URL. Endpoints marked "checked 2026-11-16" returned the stated fields when fetched that day; the rest are carried over from earlier runs.

- **Ashby**: `GET https://api.ashbyhq.com/posting-api/job-board/<board>?includeCompensation=true`. Each job has `title`, `location`, `secondaryLocations`, `workplaceType` / `isRemote`, `employmentType`, `jobUrl`, `applyUrl`, and compensation when published. The HTML board also shows "Open Positions (N)".
- **Greenhouse**: `GET https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true`. Jobs carry `language` and `application_deadline` (checked 2026-11-16). Single job with screening questions: `.../jobs/<id>?questions=true`. A board that answers "no longer active" is dead; aggregators may keep circulating its listings.
- **Lever**: `GET https://api.lever.co/v0/postings/<company>?mode=json` (EU-hosted boards: `api.eu.lever.co`). Fields: `categories.location`, `categories.commitment` (full-time, intern and similar, free text per employer), `workplaceType`, `salaryRange`, `hostedUrl`.
- **Personio** (very common for German Mittelstand and startups): `GET https://<company>.jobs.personio.de/xml` returns an XML feed (checked 2026-11-16, HTTP 200, `text/xml`). Root `<workzag-jobs>`, one `<position>` per opening with `id`, `office`, `additionalOffices`, `department`, `name`, `employmentType` (seen: `permanent`, `intern`), `seniority` (seen: `entry-level`, `experienced`, `student`), `schedule` (seen: `full-time`, `part-time`, `full-or-part-time`), `occupation`, `createdAt` and `jobDescriptions` (each with a `name` and an HTML `value` in CDATA). The posting page is `https://<company>.jobs.personio.de/job/<id>`: it is the employer page for `verify-employer`, and its text is the authority when it disagrees with the feed. An unknown slug answers 404. The same slug on `jobs.personio.com` and the feed's `language` handling were not checked.
- **SmartRecruiters**: `GET https://api.smartrecruiters.com/v1/companies/<companyIdentifier>/postings?limit=100` (checked 2026-11-16). Optional `q=<text>` and `country=<iso2 lowercase>` narrow it (e.g. `q=Werkstudent&country=de`); page with `offset`. List items carry `name`, `location` (`city`, `country`, `remote`, `hybrid`), `typeOfEmployment.id` (seen: `permanent`, `part-time`), `experienceLevel.id` and `releasedDate`. `GET .../postings/<id>` adds `postingUrl`, `applyUrl`, `language` and `jobAd` (the description). The identifier is the path segment after `jobs.smartrecruiters.com/` and is case-sensitive: a wrong one returns HTTP 200 with `totalFound: 0`, which is not proof the employer has no openings.
- **Workday**: the career site URL is `https://<tenant>.wd<N>.myworkdayjobs.com/<site>` (the `wd<N>` host and the site name differ per employer: copy them from the URL the user gave). List with `POST https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs`, JSON body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":"<term>"}` (checked 2026-11-16: `total`, `jobPostings[]` with `title`, `locationsText`, `postedOn`, `externalPath`). One posting: `GET https://<tenant>.wd<N>.myworkdayjobs.com/wday/cxs/<tenant>/<site><externalPath>` returns `jobPostingInfo` with `jobDescription`, `location`, `timeType`, `startDate` and `externalUrl` (the employer page). A wrong site name returns HTTP 422. Applying needs a Workday account: never create one (account-gated flow).
- **Workable, Teamtailor, Recruitee, join.com, and any other host** (including a university or Career Service portal in `sources.boards`): no public API checked. Fetch the posting HTML and read the location, type and hours lines.

Funnel tell: a board with a four-figure open-position count at a company of a few hundred people, or the same title repeated once per country, means the req is probably not a real seat. Note the count in the lead.

## YC Work at a Startup

Start URL: `https://www.workatastartup.com/jobs`. Logged out it shows a small subset; the logged-in view is the useful one.

- Do not try to scroll the infinite list. JS scrolling does not advance it.
- Instead capture the page's own search-index request (patch `window.fetch` / XHR in the page, then trigger a search) and replay it in the page with a large `hitsPerPage`, `distinct=false` and all attributes. Hits include locations, a US-visa-required field, engineering type and the full description.
- **Never print the captured request URL or headers.** They carry an API key.
- If results drop to zero after navigation, a saved filter chip (e.g. "US visa not required") may have been re-applied. Remove it and re-run.

## Wellfound

- Start URL: `https://wellfound.com/jobs`.
- Logged-in feed only. It already hides roles closed to the user's location, so the pool is small.
- One keyword pass per run. More keywords return the same cards.
- Expect many under-floor or US-gated cards; they still go through `verify-employer` unless an early drop applies.

## HN "Who is hiring" (Algolia API)

1. Find the current month's thread: `GET https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5` and pick the story titled "Ask HN: Who is hiring? (<Month> <Year>)".
2. Fetch only new top-level comments: `GET https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_<id>&numericFilters=created_at_i><last_run epoch>&hitsPerPage=1000`. Keep comments whose `parent_id` equals the story id.
3. Filter in text for the user's work mode and region words (e.g. "REMOTE", "Europe", "EU", "worldwide") and title words. The first line usually reads `Company | Role | Location | Type | URL`.
4. HN posts are the employer's own words, but they can disagree with the employer's ATS. When they do, `verify-employer` flags it with both quotes.

## Welcome to the Jungle

- Start URL: `https://www.welcometothejungle.com/en/jobs-matches`. Logged in, `?page=N` (10 per page).
- The matcher ignores the remote preference unless the user's profile has a location set. If the feed is mostly onsite or another continent, tell the user once (account settings are theirs to change).
- Cards only mount while the tab is painted. Keep the tab in front; a screenshot forces a render. The page can freeze the renderer every few pages; accept a partial sweep and record how far you got.
- Keep only cards whose own label says fully remote (or matches the user's work mode), then verify each on the employer page.

## We Work Remotely (RSS)

- All jobs: `https://weworkremotely.com/remote-jobs.rss`. One feed per category: `https://weworkremotely.com/categories/<slug>.rss`, e.g. `remote-full-stack-programming-jobs`, `remote-back-end-programming-jobs`, `remote-front-end-programming-jobs`, `remote-devops-sysadmin-jobs`, `remote-design-jobs`, `remote-product-jobs`. Pick the categories that match `prefs.titles`; use the all-jobs feed only if none fits.
- Each `<item>` has `<title>` as `Company: Job title`, `<region>`, `<country>`, `<state>`, `<type>`, `<pubDate>` and `<link>`. Keep items with `pubDate` after `last_run`.
- The description starts with the company's headquarters and website; use the website as `company_domain`. `<region>` and `<country>` are tags, so they go in `raw_location`.
- The `link` is the WWR posting. Its apply button usually leads to the employer's ATS; `verify-employer` follows it.

## German and EU boards

Read-only lead sources, like the US boards. Build the term list as in `SKILL.md` (German and English, no gender suffix), set the city or region from `filters.hybrid.cities` or `filters.residence_country`, and limit to postings since `last_run`. Open a posting only to find the employer link and the type, hours and language lines; never click a board's own apply control ("Schnelle Bewerbung", "Schnellbewerbung", "Jetzt bewerben" on a board-hosted form, "Bewerbung absenden"). Stop on a visible bot check or security question (see the hard rules in `SKILL.md`).

Checks marked 2026-11-16 are plain fetches made that day from one network. A site that answered differently for you, or a layout that changed, is a failure to record with `set_source_status`, not a reason to guess.

Shared pointers for the employer's own posting: the board posting usually names the company and often links its careers page or an ATS (Personio, SmartRecruiters, Workday, Greenhouse, Lever and similar). Follow that link. If there is none, search for the company's careers page by name and match the title and location. If the only apply path is board-hosted, record "no employer page found" in the lead's reason and let `verify-employer` decide; do not treat the board text as employer text.

### Bundesagentur für Arbeit Jobsuche (`arbeitsagentur`)

- Search: `https://www.arbeitsagentur.de/jobsuche/suche?was=<term>&wo=<city>` (checked 2026-11-16: HTTP 200, results server-rendered, title like "Jobs für Werkstudent in Berlin | Jobsuche der BA"). The page has a radius dropdown (Umkreis), a Befristung filter, a sort by "Neueste Veröffentlichung", and "Andere suchten auch" suggestions. Use the page's own filters for type, hours and age.
- Detail pages: `https://www.arbeitsagentur.de/jobsuche/jobdetail/<refnr>` (checked: fetchable, no login). The summary block lists "Besondere Merkmale" (e.g. "Praktikum/Trainee/Werkstudent"), "Anstellungsart" (Vollzeit, Teilzeit), "Befristung", "Beginn" and the work locations, followed by the employer's own text. Those fields are the board's classification (`raw_type`); the posting text and the employer's page decide.
- Employer page: the text often ends with the employer's careers link or apply instructions; otherwise search the employer by name. Contact details are hidden behind a security question ("Sicherheitsfrage"): never solve it, and do not report it as a failure if the text already has the link.
- Known failure modes: postings re-listed from other boards (collapse by employer and title before dedupe); jobs marked "Praktikum/Trainee/Werkstudent" that are neither; long-lived listings with an old "Beginn".
- JSON API: a public API for this search is reported by third parties, but it is **unverified** (a request to the documented host answered HTTP 403 from the check environment). Do not build on it, do not guess its URL or key, and use the pages above.

### StepStone (`stepstone`)

- Search: `https://www.stepstone.de/jobs/<term-slug>/in-<city-slug>`, e.g. `/jobs/werkstudent-data-science/in-berlin` (checked 2026-11-16: HTTP 200, results in the HTML, title with the result count and date). The page's filters include Anstellungsart, Arbeitszeit, Home-Office-Optionen, Berufserfahrung and Sprache; use them instead of building filter URLs.
- Postings live at `https://www.stepstone.de/stellenangebote--<slug>--<id>-inline.html`. Many apply through StepStone's own form ("Schnelle Bewerbung"): never use it; the employer's own posting is found in `verify-employer`, and if there is none the lead says so.
- Known failure modes: bot checks after a few pages (stop, never solve); sponsored cards repeated across keywords; salary shown as a StepStone estimate (`raw_comp` at most).

### Indeed Germany (`indeed_de`)

- Search URL: `https://de.indeed.com/jobs?q=<term>&l=<city>&fromage=<days>&sort=date` (`fromage` takes 1, 3, 7 or 14). A plain fetch returned HTTP 403 on 2026-11-16, so use the browser; the rest as in the `Indeed (US)` section below. The page's own quick-apply controls are board-hosted: never click them. The German button labels were not checked.

### XING Jobs (`xing`)

- Search: `https://www.xing.com/jobs/search?keywords=<term>` (checked 2026-11-16: redirects to `/jobs/search/ki?keywords=...`, HTTP 200, results in the HTML without login). The page has filters for Standort, Arbeitsplatz, Beschäftigungsart, Karriere-Stufe (with a "Student·in / Praktikant·in" level) and Gehalt. Cards show the employer, city, labels such as "Für Studenten" and "Einfach bewerben", and sometimes a pay figure (`raw_comp`). Postings live at `https://www.xing.com/jobs/<city>-<slug>-<id>`. Applying and the full posting may need a XING login: use the browser only if the user is already signed in.
- "Einfach bewerben" is XING's own apply flow: never use it. Find the employer's page from the posting text or by the company name.
- Known failure modes: pay shown can be an estimate; the same posting appears under the company and under a recruiting agency; "Für Studenten" is a board label, not proof of a Werkstudent contract.

### Stellenwerk (`stellenwerk`)

- Start URL: `https://www.stellenwerk.de/`. Pick the city on the page ("Stadt auswählen"), then read the list (checked 2026-11-16: HTTP 200, cards render in the HTML with the employer, region, a type label such as "Studierendenjob" or "Absolvent:innenjob", "Homeoffice möglich" and sometimes an hourly pay like "18 € / Stunde"). The site is run with universities ("das gemeinsame Jobportal der Hochschulen"); a student account is needed to apply and to see more: never create or use one for the user.
- Employer page: the posting names the employer; follow its link or search the careers page. Cards from private persons (not companies) are not employer postings for this plugin: skip them.
- University or Career Service portals that are not on Stellenwerk go into `sources.boards` (the user supplies the URL); they are read as plain careers pages (see ATS boards).

### Absolventa (`absolventa`)

- Start URL: `https://www.absolventa.de/jobs`. A plain fetch returned HTTP 405 on 2026-11-16, so use the browser. The page structure, filters and apply flow are **unverified**: read the page, use its own filters, and record what you could not read. Postings usually link to the employer's own page; verify there.

### JobTeaser (`jobteaser`)

- Start URL: `https://www.jobteaser.com/en/job-offers` (a plain fetch returned HTTP 403 on 2026-11-16). It works through the user's university career-service login; which offers appear depends on the university. Run it only if the user is already signed in. If a university login page appears, report "Log in to JobTeaser in the browser" and stop; never enter credentials.
- Offers link to the employer's ATS or to a JobTeaser-hosted form (never use it). Page structure is **unverified**.

### EURES (`eures`)

- Start URL: `https://eures.europa.eu/index_en` (checked 2026-11-16: reachable); the job vacancy search is part of that portal. The search flow was not exercised, so its filters are **unverified**. Vacancies largely mirror national employment services, so for Germany prefer `arbeitsagentur` and use EURES for other EU countries (set the country filter).
- Postings link back to the national service or the employer; verify on the employer's page.

### WeAreDevelopers (`wearedevelopers`)

- Start URL: `https://www.wearedevelopers.com/en/jobs` (checked 2026-11-16: it redirected to `/jobs?country=US` from the check network, so set the country filter to the user's market before reading). Tech roles; use the page's filters for seniority and contract type, which are **unverified** beyond that. Postings link to the employer's ATS; follow it.

### Berlin Startup Jobs (`berlinstartupjobs`)

- RSS: `https://berlinstartupjobs.com/feed/` (checked 2026-11-16: HTTP 200, `application/rss+xml`). Each `<item>` has `<title>` as `Role // Company`, `<link>` (the board's posting), `<category>` and `<pubDate>`; the description is a short teaser. Keep items with `pubDate` after `last_run`. The `link` leads to the board's posting, whose apply link goes to the employer: follow it for `verify-employer`.
- Berlin only. Type, hours and language are not in the feed: they come from the employer page.

## US job boards

All of these are read-only lead sources. Build 2 to 4 title queries from `prefs.titles`, set the remote or location filter from `filters.work_mode`, and limit to postings since `last_run`. Open the posting only to find the employer link; never click the board's own apply button. Stop on a visible bot check (see the hard rules in `SKILL.md`).

### Indeed (US)

- Search URL: `https://www.indeed.com/jobs?q=<title>&l=Remote&fromage=<days>&sort=date`. `fromage` takes 1, 3, 7 or 14: use the smallest that covers `last_run`. For hybrid or onsite, put the user's city in `l`.
- Plain fetch is blocked (HTTP 403); use the browser.
- Job links look like `https://www.indeed.com/viewjob?jk=<id>`. "Apply on company site" leads to the employer; prefer that URL for `url`. "Easily apply" means Indeed hosts the form: keep the Indeed URL and let `verify-employer` find the employer's own posting.
- Collapse sponsored repeats and the same title from the same staffing agency before dedupe.

### Glassdoor

- Search URL: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=<title>`, then use the page's own "Date posted" and "Remote" filters.
- Logged in works best. A sign-in modal over the results when logged out means stop and report "Log in to Glassdoor in the browser"; do not try to dismiss it repeatedly.
- Pay marked "Glassdoor est." is Glassdoor's estimate. "Employer provided" is still `raw_comp` until the employer's page says it.
- Company ratings on the card are not evidence for any filter.

### ZipRecruiter

- Search URL: `https://www.ziprecruiter.com/jobs-search?search=<title>&location=Remote`, then the page's "Date posted" filter.
- Many listings are syndicated from other boards or the employer's ATS; collapse duplicates by company and title. Prefer the employer link when the posting shows one.
- Never use 1-Click Apply or Quick Apply.

### Dice

- Search URL: `https://www.dice.com/jobs?q=<title>`, then the page's filters for posted date, work setting (remote) and employment type. If `prefs.contract_ok` is false, filter to full-time.
- A large share of cards are staffing agencies. The card's company is the agency; the posting text may name the client or only say "our client". Upsert it under the company the card shows and note "staffing agency" in the `found` reason; `verify-employer` decides who the employer is.
- "C2C", "corp-to-corp" and "W2 only" in the title or card are contract tells; pass them on, do not drop at source unless the user's rules exclude contract work.

### Built In

- Remote listings: `https://builtin.com/jobs/remote?search=<title>`. Hub listings for hybrid or onsite users: use the page's location filter rather than building a city URL.
- Listing pages render with a plain fetch. Postings live at `https://builtin.com/job/<slug>/<id>` and usually have an apply link to the employer's ATS: use it as `url`.

### USAJOBS

- Search URL: `https://www.usajobs.gov/search/results/?k=<title>`. Results render with JavaScript, so use the browser. Use the page's filters for remote or telework and for opening date.
- The public API at `data.usajobs.gov` needs a personal API key. Do not ask the user for one; the browser is enough.
- Postings live at `https://www.usajobs.gov/job/<id>`. Read "This job is open to" (who may apply), "Remote job", "Telework eligible", "Location" and "Salary" (a pay range with a GS grade). These are the agency's own words: `verify-employer` can quote them directly.
- Most postings require US citizenship. That is a work-authorisation question for `verify-employer` and `score-role`; never record or ask about the user's nationality.
- Applying goes through a USAJOBS profile and Login.gov. Never start an application from a sweep.

## Jack & Jill

- Two inputs: the agent's pick emails in Gmail (search by the sender of the most recent pick email) and the logged-in dashboard kanban at `https://app.jackandjill.ai/jack/dashboard/home`.
- On each card, take the "View job post" link (`[...document.querySelectorAll('a')].filter(a => /view job post/i.test(a.innerText))`) and open the employer's ATS. Read the location line and the About block first.
- The card's summary can describe the recruiter's client while the posting belongs to a recruiting agency. The employer is whoever the ATS says.
- Salary on the card is often the broker's estimate (small print says so). Never use it for a pay verdict.
- Cards in an intro or "in process" state: the company is `no_cold_apply` (see `inbox-and-calendar` for how to record it).
- Reading the dashboard for reconciliation is read-only. A card's identity is its application ID plus the original date; keys, coverage and a board that cannot be opened are as in `inbox-and-calendar` (Window and coverage).

## WWR JobCopilot

- **Save-only.** Never enable auto-apply, never change the copilot's settings.
- The tracker URL comes from the daily recap email's "View Job Applications" link. Do not guess the hostname.
- Sweeping it means reconciling the Applied column and harvesting Saved cards. Both are done by the `triage-tracker` skill, interactively.
- Reconciling the Applied column is read-only. A card's identity is its application ID plus the original date; a card the user's email already acknowledged is evidence on that existing role, not a new application. Coverage and keys are as in `inbox-and-calendar`.

## Retired by default

- **justjoin.it**: heavy virtualised list that often renders zero cards in automation. Its Apply button opens the employer's ATS in a new tab (popups may be blocked silently).
- **nofluffjobs**: blocked by a CDN error in past runs.
- **RemoteOK**: feed went weeks stale.
- **Remotive**: public API mostly recruiter spam.
- **Monster, CareerBuilder**: the merged company filed for bankruptcy in June 2025 and sold the job boards. Not tested since.
- **SimplyHired**: owned by Indeed, mostly the same listings. Run `indeed` instead.

Enable any of these only at the user's request, and retire again after two empty runs.
