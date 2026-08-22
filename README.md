# AutoCare — Car Maintenance Tracker

Bilingual (EN/AR) offline-first PWA for tracking car maintenance, built for Saudi Arabia.

**Live:** https://tamem44111.github.io/car-maintenance-dashboard/
**Deploy:** push to `main` → GitHub Pages builds automatically (deploy-from-branch, no workflow file).

---

## Files

| File | Responsibility |
|---|---|
| `index.html` | Shell, nav, page containers, header controls (language / theme / car selector) |
| `i18n.js` | EN/AR dictionary + RTL. Keys are the English strings themselves |
| `storage.js` | All data + computation: services, odometer, warranties, trash, insights, keep-or-sell |
| `recommendations.js` | Manufacturer service intervals, whichever-comes-first due logic |
| `features.js` | Action Center, Documents, Warranty Center, bills, analytics, settings, backup |
| `photos.js` | Receipt images: in-browser compression + IndexedDB |
| `app.js` | Routing, rendering, all modals |
| `sw.js` | Service worker. **Bump `CACHE` on every deploy** |
| `checks.html` / `checks.js` | The verification suite. Open and press Run |

Data lives in `localStorage` (`autocare_data`) except receipt photos, which are in IndexedDB.

---

## Design decisions that are not obvious from the code

**Service types are data keys, not labels.** Records store `"Oil Change"`; the schedule matches on that
string. Only the *display* passes through `t()`. Translating them in place would silently break every
user's history. Same rule applies to bill kinds and document labels.

**Whichever-comes-first.** Every scheduled item is judged on km *and* time, and reports whichever runs
out first (`Recommendations.getMaintenanceStatus`). Km thresholds are also converted to a predicted date
using the driving rate, so a km-based item can drive a calendar reminder.

**The odometer is projected, not static.** `Storage.getProjectedMileage` carries the last confirmed
reading forward at the car's average km/day. Estimated values are labelled (`~`, `est.`) so a projection
is never mistaken for a reading.

**Climate multiplier.** Severe mode (`autocare_climate`) shortens every interval by 20%. It lives in its
own localStorage key and **must** be included in backups — omitting it silently lengthens every interval.

**The inspection expiry is typed, not derived.** The expiry is printed on the certificate;
the date of the test is not something anyone remembers, so the Documents screen asks for the
expiry and treats result, centre and cost as optional. Filling one of those optional fields
also files a `Periodic Inspection` service record, dated back a standard year
(`Features.inspectionDateFrom`) — and that record deliberately carries **no mileage**, because
an estimated date paired with today's odometer would land a false reading in
`getOdometerReadings` and wreck the km/day rate. A failure yields no certificate, hides the
expiry field, and books a re-test 30 days from today. The Services page can still log an
inspection you attended: there the expiry is *suggested* a year out from the service date and
stays editable, so it never silently overwrites a date you typed. Centres come from
`Features.INSPECTION_CENTRES` (Dammam, Khobar) — extend that array to add more.

**The service picker is grouped, and grouping is display only.** `Recommendations.GROUPS`
lays the picker out by system with what the car currently owes pinned on top
(`dueTypes`). The strings inside it are data keys, so regrouping never touches stored
history. Every type in `logTypes()` appears in `GROUPS` exactly once **except**
`LEGACY_TYPES` — currently just `"Brake Pads"`, which stays valid for records made before
the front/rear split but is no longer offered for new ones, since a fresh one names no
axle and neither axle's schedule can see it. A due type therefore has two checkboxes,
which is why the save path de-duplicates before filing.

**Fuel is excluded from keep-or-sell.** You would pay it on any car, so it says nothing about whether
*this* car is worth keeping. Only maintenance counts toward the verdict.

**Deletes go to a 30-day trash**, and photos belonging to trashed records are retained so a restore
keeps its receipts (`Storage.getAllReferencedBills`).

**Service worker is network-first** with `updateViaCache: 'none'` and a guarded reload on
`controllerchange`. Cache-first caused deploys never to reach installed PWAs.

**No `window.open()` anywhere.** iOS blocks it in a standalone PWA. Receipts use an in-app overlay;
printing uses a hidden iframe.

---

## Verification procedure

**Open `checks.html` and press Run.** ~170 checks, a few seconds. It drives the real app
inside a 402px iframe, so the render and overflow checks see what an iPhone sees.

What it covers:

- Odometer projection, the driving rate, and that a lower reading cannot overwrite a higher one
- Whichever-comes-first due logic, overdue detection, the climate multiplier
- `certificateExpiry` / `inspectionDateFrom` being exact inverses
- That a back-dated inspection record leaves the driving rate untouched
- Trash round trip, duplicate detection, backups carrying settings
- Every page and every modal rendering in **both** languages without throwing
- No element exceeding 402px, pages *and* modals
- **No raw `${...}` in the rendered DOM** — three of these once shipped, printing their
  own source on the dashboard
- Arabic sweep, reported as warnings rather than failures

**It snapshots and restores all of `localStorage`, including when a check throws.** The
page is served from the same origin as the live app, so without that a run would
overwrite real records. Never remove that `finally` block. IndexedDB is never touched.

Two things the suite cannot do, so you still must:

1. **Look at a screenshot.** Past failures here were features built correctly and shipped
   invisible. A passing check says the function works, not that a person can find it.
2. **Add a check for what you just fixed.** Otherwise the suite only knows about
   yesterday's bugs.

**Local cache trap:** `localhost:8080` aggressively caches JS, so edits appear not to
apply — this has burned a session as recently as August 2026. Serve on a fresh port.

## Open items

**Verified in the code, August 2026 — none of these are fixed:**

- **Two different oil intervals are live at once.** The owner picked 7,000 km
  semi-synthetic; `getMaintenanceStatus` ignores `service.oilInterval` and uses the
  manufacturer 12,000 x 0.8 = 9,600. Reminders say next oil at 432,881 km, the dashboard
  says 435,481. Both are on screen.
- **Never-logged services are reported as freshly done.** `getMaintenanceStatus` assumes
  "done at current km, today" when it finds no record, so six of twelve items on the
  owner's car show a full interval remaining and count as healthy in the score. A 429,000
  km car reads 93/100; with no services at all it reads 100/100.
- **A note-only record still resets a schedule.** The 2025-08-17 Transmission entry (no
  cost, note "Need to replace after 60000") is counted as a completed fluid change. The
  owner acts on this app, so this one matters most.
- **Auto-reminder dates assume 40 km/day** (`App._estDate`) against a real rate of 105.
- **Untranslated in Arabic:** `or at` and `confirm('Delete?')` in the reminder card,
  `Still covered` / `Active` in the Warranty Center, and the service-insight sentence on
  Expenses. Also **auto-generated reminder notes** ("Auto: next Air Filter at 437,881 km"),
  which are stored as English *data* — `t()` can never match them because the numbers are
  baked in. Fixing that means storing the parts and composing at display time.
- **The schedule data has no provenance.** `recommendations.js` says "Ford Taurus owner
  manual" but nothing records where those numbers came from. The app's entire value rests
  on that table.

**The owner's own data:**

- Spark plugs ~600 km overdue and growing at 105 km/day.
- Odometer inconsistency: Coolant Flush logged 2026-05-01 at 410,800 km, Air Filter
  2026-04-12 at 414,521 km. One is mistyped. The service modal has no backwards-reading
  guard — only the odometer modal does.
- A second, smaller instance: a service on 2026-08-18 reads 428,641 km, a manual reading
  on 2026-08-19 reads 428,640.
- Not set: market value and tyre DOT date. Each disables a feature.
- Fuel logging unused after a year, so consumption tracking and the anomaly warning are
  dormant, and cost-per-km omits by far the largest running expense.

## Commercial assessment

Full analysis: https://claude.ai/code/artifact/d6a89158-2157-415d-88f6-af117c49d698

Short version: **don't build a consumer subscription tracker.** CARFAX Car Care is free (it is a
loss-leader for their vehicle-history business), ~20% of new subscription apps ever reach $1,000 total
revenue, and 100k paying users would need ~40% of every private car in Saudi Arabia. The value is in the
*record* — a verified service history sells a used car for more in a $10bn market — or in selling to
workshops (100 workshops at 400 SAR/month beats 10,000 consumers). Validate by hand before building.
