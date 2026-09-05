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

**The rate follows how the car is driven now.** `getDailyKmRate` used only the first and
last reading ever, so it was a lifetime average that lagged badly when driving picked up:
this car read 93 km/day across fifteen months while the most recent five weeks ran at 121,
which put every km-based date about 30% late. It now prefers a window of roughly the last
four months, but only when that window spans enough days and distance to mean something —
otherwise the full history still answers, so one fresh reading can never swing the
estimate. `getRateDetail` returns both figures, and calls the difference a change only when
it is large enough to move a due date. Pass `{ lifetime: true }` for the old behaviour.

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

**An interval the owner picks is the interval.** Choosing an oil type writes a *custom
interval* for that car via `Recommendations.saveCustom`, which `getEffective` already
prefers over manufacturer data — so the choice drives the schedule, the Action Center, the
trip planner and the forecast alike. Before this it fed only the auto-created reminder,
so switching 7,000 to 5,000 changed one screen and left every other one on Ford's 9,600.
The climate multiplier applies to **manufacturer guidance only**: shrinking an explicit
5,000 to 4,000 would put a number on screen that nobody chose.

**No record is not the same as never done.** Most owners start logging partway through a
car's life — this one began in August 2025, at 389,951 km. So `getMaintenanceStatus`
returns `status: 'unknown'` with **null** due date, next mileage and km remaining rather
than assuming "done today"; the health score drops those items from its denominator and
reports what it was scored on; the forecast skips them, since there is no date to project
from; and the Action Center raises **one** grouped nudge instead of one alarm per item.
`Features.openBackfillModal` turns unknowns into knowns: one row per item, fill in what
you remember. A blank row stays unknown, and the odometer field is optional and clearly
marked — a remembered date paired with a guessed reading would corrupt the km/day rate.
Expect the score to *fall* when someone backfills. That is correct: a real status is
replacing a flattering guess.

**The service picker is grouped, and grouping is display only.** `Recommendations.GROUPS`
lays the picker out by system with what the car currently owes pinned on top
(`dueTypes`). The strings inside it are data keys, so regrouping never touches stored
history. Every type in `logTypes()` appears in `GROUPS` exactly once **except**
`LEGACY_TYPES` — currently just `"Brake Pads"`, which stays valid for records made before
the front/rear split but is no longer offered for new ones, since a fresh one names no
axle and neither axle's schedule can see it. A due type therefore has two checkboxes,
which is why the save path de-duplicates before filing.

**The trip planner reads the schedule forward.** This owner drives between cities, so the
question that matters is not "what is due?" but "what runs out while I am 700 km from my
own workshop?". `Storage.planTrip` projects the odometer over one journey and reports what
is already overdue, what crosses its threshold en route — as a distance *into* the trip,
not an absolute reading — and what the drive itself costs in fuel and wear. Tyres are
checked separately because they are judged separately. Items with no record are counted
and named, never silently skipped: a check that quietly ignores six services would give
false confidence, which on a long drive is worse than no answer.

**Tyres are judged separately from the schedule.** `Storage.getTyreStatus` is the single
authority, because tyres run out three ways at once — distance on the set, age of the
rubber (which hardens in heat whatever the tread looks like), and tread itself. It merges
the tyre record on the car with any logged `Tires` service and takes whichever is newer,
so there is only ever one answer. `Tires` is therefore a **log-only** type: putting it in
the generic schedule would have created a second, conflicting verdict. At this owner's
annual distance the km side almost always binds first — a 50,000 km life becomes 40,000
under the severe-climate multiplier, which is barely twelve months of his driving.

**Fuel is estimated, not logged.** Tank-by-tank logging never happened in a year of real
use, and fuel is ~90% of this car's running cost, so cost-per-km was understating reality
by 10x. `Features.getFuelEstimateFor` derives it from one setting instead — either
L/100km plus a pump price, or a single monthly spend figure — and the Settings panel shows
what the numbers work out to in SAR/year *and* L/100km, so a mistyped figure is visible
rather than silently distorting every cost in the app. Estimated fuel is always labelled
`Fuel (est.)` and shown beside the maintenance figure, never merged into one number:
maintenance-per-km is the one that rises as a car degrades, so it has to stay visible.
The setting is in `SETTING_KEYS`, so it survives a backup — leaving it out would repeat
the climate-multiplier mistake.

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

- **A note-only record still resets a schedule.** The 2025-08-17 Transmission entry (no
  cost, note "Need to replace after 60000") is counted as a completed fluid change. The
  owner acts on this app, so this one matters most.
- **Auto-reminder dates assume 40 km/day** (`App._estDate`) against a real rate of 105.
- **Untranslated in Arabic:** `or at` and `confirm('Delete?')` in the reminder card,
  `Still covered` / `Active` in the Warranty Center, and the service-insight sentence on
  Expenses. Also **auto-generated reminder notes** ("Auto: next Air Filter at 437,881 km"),
  which are stored as English *data* — `t()` can never match them because the numbers are
  baked in. Fixing that means storing the parts and composing at display time.
- **The schedule data is wrong, and now verifiably so.** See "Verified Ford intervals"
  below. Left in place deliberately until the rebuild; the owner is aware and knows which
  warnings to ignore.

**The owner's own data:**

- Spark plugs ~600 km overdue and growing at 105 km/day.
- Odometer inconsistency: Coolant Flush logged 2026-05-01 at 410,800 km, Air Filter
  2026-04-12 at 414,521 km. One is mistyped. The service modal has no backwards-reading
  guard — only the odometer modal does.
- A second, smaller instance: a service on 2026-08-18 reads 428,641 km, a manual reading
  on 2026-08-19 reads 428,640.
- Tyre DOT date not set, and no tyre fitting record, so wear and age tracking are idle.
- Fuel logging unused after a year. Cost-per-km now uses an estimate instead (11 L/100km
  at 2.33 SAR), but the tank-by-tank page and the consumption anomaly warning stay dormant.

## Verified Ford intervals — 2013 Taurus

Checked 23 Aug 2026 against the actual owner's manual:
`https://www.fordservicecontent.com/Ford_Content/catalog/owner_guides/13tauom3e.pdf`
(local copy: `~/Downloads/taurus-2013-owner-manual.pdf`, 547 pages).

**The table in `recommendations.js` does not match it.** Every figure below is quoted from
the manual with its page number. The code was left unchanged by the owner's decision — the
rebuild inherits these numbers instead.

### Normal Scheduled Maintenance (p. 382–383)

| Item | Ford | `recommendations.js` | Error |
|---|---|---|---|
| Spark plugs | 100,000 mi / **160,000 km** | 48,000 km | 3.3x too short |
| Engine air filter | 30,000 mi / **48,000 km** | 15,000 km | 3.2x too short |
| Cabin air filter | 20,000 mi / **32,000 km** | 15,000 km (universal) | 2.1x too short |
| Automatic transmission fluid + filter | 150,000 mi / **240,000 km** | 60,000 km | 4x too short |
| Engine coolant | initial 6 yr or 160,000 km, **then 3 yr or 80,000 km** | 50,000 km / 36 mo | 1.6x too short |
| Accessory drive belt | inspect at 160,000 km, replace by 240,000 km | *absent* | missing |
| Battery | **not a scheduled item** | 80,000 km / 48 mo | invented |
| Brake inspection | **at every oil change** | 20,000 km / 12 mo | too *relaxed* |
| Tyre rotation | at every oil change | 12,000 km / 6 mo | acceptable |

Note the direction of the brake row. Every other error nags too early; on brakes — the one
that matters at speed — the app is less cautious than Ford.

### Oil: there is no fixed interval (p. 381)

Ford uses the Intelligent Oil-Life Monitor. The manual gives a guideline table only:

| Use | Interval |
|---|---|
| Normal — highway commuting, no towing, no extended idling | 7,500–10,000 mi / **12,000–16,000 km** |
| Severe — heavy load, mountainous, extended idling, **extended hot operation** | 5,000–7,499 mi / **8,000–12,000 km** |
| Extreme — maximum load, extreme hot or cold | 3,000–4,999 mi / **4,000–8,000 km** |

Hard cap: *"Do not exceed one year or 10000 miles (16000 kilometers) between service
intervals."* The owner's actual average of 4,086 km sits below even the Extreme band.

### The owner's actual pattern (Sept 2026)

Trip computer, over a 4,246 km sample: **11.6 L/100 km measured**, and 99 hours of running
time for those 4,246 km — a **43 km/h average**, where steady intercity highway would sit
near 100. The owner describes the mix as some highway, some traffic, some idling with the
AC on.

That puts transmission fluid, and only transmission fluid, on Ford's low-speed/idling
figure of 48,000 km rather than the Normal 240,000 — set as a per-car custom interval
carrying the manual page in its note, so it is deliberate rather than the accident it is
today: the hardcoded 60,000 × 0.8 climate factor happens to land on the same 48,000.
Everything else stays on Normal.

A cluster photo also read 430,127.4 km where the app projected 430,174 — 47 km out across
a two-day gap, which is the projection model working as intended.

### Severity is per-item, not global (p. 387–388)

`autocare_climate` shortens **all fourteen** intervals by 20%. Ford does not work that way.
It names conditions and adjusts *particular* items, and applies them only if you drive
*primarily* in that condition — occasional exposure explicitly does not count:

- **Towing**: transmission fluid every 48,000 km
- **Extensive idling / low-speed commercial** (taxi, delivery, livery): spark plugs
  96,000 km, transmission 48,000 km, filters inspect frequently
- **Dusty or sandy, unpaved roads**: oil and tyre rotation every 8,000 km, wheels inspected
  every 8,000 km, transmission 48,000 km, filters inspect frequently

Long steady intercity highway running is the *gentlest* case in the manual — the opposite
of the commercial category — so a blanket multiplier is wrong in both directions at once.

## Commercial assessment

Full analysis: https://claude.ai/code/artifact/d6a89158-2157-415d-88f6-af117c49d698

Short version: **don't build a consumer subscription tracker.** CARFAX Car Care is free (it is a
loss-leader for their vehicle-history business), ~20% of new subscription apps ever reach $1,000 total
revenue, and 100k paying users would need ~40% of every private car in Saudi Arabia. The value is in the
*record* — a verified service history sells a used car for more in a $10bn market — or in selling to
workshops (100 workshops at 400 SAR/month beats 10,000 consumers). Validate by hand before building.
