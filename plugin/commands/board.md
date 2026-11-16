---
description: Open the job-hunt kanban board in your browser. Drag cards to move roles.
---

Open the user's job-hunt board.

**If the tracker tools are missing** (search for them first if tools are deferred), or a hook error says `node` could not start: Node.js, which the plugin runs on, is missing or too old. Tell the user that in one sentence, offer to run `/job-tracker:setup` (it installs Node.js), and stop.

1. Call `open_board` with `open: true`. Why: the user typed this command, so a browser window is expected; scheduled runs never pass `open`.
2. Reply with one line. If the board opened in the browser, say so (the result has no link, by design). If the result says the browser did not open, give the link it returns and ask the user to open it.

What the user can do there, if they ask: search (`/`) by company, title or stack; filter by status, source, work mode and score; switch between the kanban and a table of every role; open a card (click or Enter) for its details, history, interviews and drafts, and close it with Esc; move between cards with the arrow keys; read the stats header (applications this week, reply rate, what needs them, upcoming interviews); and switch dark mode. Filters and the open card stay in the link, so a reload keeps them.

The link works until the board has been idle for 30 minutes; after that, `/job-tracker:board` starts a new one with a new link. Moves on the board are recorded as the user's own: the user can move a card to any lane, back or forward, and marks it applied or dropped without evidence. Do not change any state yourself. Why: board moves are recorded as the user's; a change made by you would be recorded as the pipeline's and blur who decided.
