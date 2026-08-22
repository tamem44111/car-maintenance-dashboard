# Working agreement — AutoCare

Read `README.md` first: it holds the architecture, the non-obvious design decisions, the
verification procedure, and the open items. This file is about *how* to work here.

## Owner

Tamim, Saudi Arabia. Currency SAR. The app must work in Arabic (RTL) as well as English.
He uses it on an **iPhone as an installed PWA** — that is the target, not desktop.

His car: 2013 Ford Taurus, 3.5L V6, ~429,000 km, driven ~38,500 km a year on intercity
trips. That is roughly triple a normal private car and more than 5x the longest interval
in `recommendations.js`, so the manufacturer schedule ran out long ago. Highway distance
is mild on brakes, transmission and oil, and severe on tyres, cooling and rubber — the
single `autocare_climate` multiplier cannot express that, and currently shortens all
fourteen intervals equally.

## What this is for

Three things at once, in this order:

1. **His actual car.** He acts on what the app says — it drives real maintenance
   decisions. A wrong number is a wrong decision about a car he depends on, so accuracy
   outranks features, and *honest uncertainty outranks a confident guess*. If the app
   does not know when something was last done, it must say so rather than assume.
2. **Possibly a product later.** It is not built for other users yet, and does not need
   to be. But avoid one-way doors — unsourced data, formats that cannot be migrated,
   anything expensive to undo. Say so when you meet one instead of quietly choosing.
3. **Something another engineer will read.** Tests and clear code count as output here,
   not overhead.

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

1. **Open `checks.html` and press Run.** It automates what used to be five manual steps:
   parsing, every page and every modal in both languages, the overflow sweep at 402px,
   and the raw-`${...}` bug class. It runs the real app in a 402px iframe, and it
   snapshots and restores `localStorage` so a run cannot eat his records.
2. **Add a check for whatever you just fixed**, so it cannot come back. That is the
   point of the suite; a fix with no check is half done.
3. **Take a screenshot and look at it.** Green checks cannot tell you a feature is
   impossible to find — and that failure has happened three times here.
4. Bump `CACHE` in `sw.js`.
5. Commit, push, then verify the live files actually changed with `curl`.

Green is necessary, not sufficient. The suite reports *warnings* for known gaps tracked
in README's open items — read them, do not let them become wallpaper.

Local `localhost:8080` caches JS hard; edits will appear not to apply. Serve on a fresh port.

## Deploy

Push to `main`. GitHub Pages builds automatically. Live at
https://tamem44111.github.io/car-maintenance-dashboard/
