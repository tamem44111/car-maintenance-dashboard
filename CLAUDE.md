# Working agreement — AutoCare

Read `README.md` first: it holds the architecture, the non-obvious design decisions, the
verification procedure, and the open items. This file is about *how* to work here.

## Owner

Tamim, Saudi Arabia. Currency SAR. The app must work in Arabic (RTL) as well as English.
He uses it on an **iPhone as an installed PWA** — that is the target, not desktop.

## Rules learned the hard way

**Findability is part of "done".** Three separate features were built correctly and then
reported as finished while being effectively invisible: the backup button, the Arabic switch,
and the periodic inspection. Each time the cause was verifying that a function returned the
right value instead of checking what a person sees. Before saying something works, open it on a
402px screen and confirm you can *find* it without being told where it is.

**Put things where he asked for them, not where they are easiest to add.** "With the documents
like insurance" meant the Documents card — not a chip in a list of twenty-one service types.

**Test in both languages.** Run the untranslated sweep in `README.md`; it repeatedly finds
strings the eye misses.

**Ask with options.** When a decision is genuinely his, use multiple choice with the trade-offs
spelled out — never an open-ended prose question.

**Verify against his real data when it is relevant.** His backup file exposed things no
synthetic test would: oil changed at 4,086 km against a 9,600 km schedule, and an odometer
reading that goes backwards.

**Be honest about limits.** He values a straight answer more than an encouraging one. The
commercial assessment concluded "do not build the consumer subscription app" and that was the
right call to state plainly.

## Every change, without exception

1. Parse-check all six scripts and confirm HTML tag balance (snippets in `README.md`).
2. Render every page and every modal, catching exceptions.
3. Overflow sweep at 402px — pages *and* modals.
4. Untranslated sweep in Arabic.
5. Take a screenshot and look at it.
6. Bump `CACHE` in `sw.js`.
7. Commit, push, then verify the live files actually changed with `curl`.

Local `localhost:8080` caches JS hard; edits will appear not to apply. Serve on a fresh port.

## Deploy

Push to `main`. GitHub Pages builds automatically. Live at
https://tamem44111.github.io/car-maintenance-dashboard/
