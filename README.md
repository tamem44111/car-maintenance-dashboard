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

**Fuel is excluded from keep-or-sell.** You would pay it on any car, so it says nothing about whether
*this* car is worth keeping. Only maintenance counts toward the verdict.

**Deletes go to a 30-day trash**, and photos belonging to trashed records are retained so a restore
keeps its receipts (`Storage.getAllReferencedBills`).

**Service worker is network-first** with `updateViaCache: 'none'` and a guarded reload on
`controllerchange`. Cache-first caused deploys never to reach installed PWAs.

**No `window.open()` anywhere.** iOS blocks it in a standalone PWA. Receipts use an in-app overlay;
printing uses a hidden iframe.

---

## Verification procedure (do all of this before claiming something works)

Past failures came from checking return values instead of the screen. Run every step:

1. **Parse-check all scripts** — a syntax error in one file silently disables a whole object:
   ```js
   for (const f of ['i18n.js','photos.js','storage.js','recommendations.js','features.js','app.js']) {
     const s = await (await fetch(f+'?v='+Date.now(),{cache:'no-store'})).text();
     try { new Function(s); } catch(e) { console.log(f, e.message); }
   }
   ```
2. **Check HTML tag balance** — `s.count('<div') === s.count('</div>')`.
3. **Render every page and modal**, catching exceptions.
4. **Overflow sweep at 402px** (iPhone) — no element may exceed the viewport.
5. **Untranslated sweep in Arabic** — walk leaf nodes on every page, flag pure-Latin text.
   Should return only SAR amounts and car names.
6. **Look at a screenshot.** Confirm a person can *find* the feature, not just that the function works.

**Local cache trap:** `localhost:8080` aggressively caches JS, so edits appear not to apply. Serve on a
fresh port to test, or unregister the SW and refetch with `{cache:'reload'}`.

---

## Open items (from the owner's real data, Aug 2026)

- **Spark plugs ~500 km overdue** on the Ford Taurus.
- **Odometer inconsistency:** Coolant Flush logged 2026-05-01 at 410,800 km, but Air Filter
  2026-04-12 at 414,521 km — one is mistyped.
- **Transmission record** (2025-08-17, no cost, note "Need to replace after 60000") is being counted as
  a completed service. If the fluid was never changed, the schedule is wrong.
- Not set: timing belt/chain type, market value, tyre DOT date. Each disables a feature until filled.
- Fuel logging unused — consumption tracking and the anomaly warning are dormant.

---

## Commercial assessment

Full analysis: https://claude.ai/code/artifact/d6a89158-2157-415d-88f6-af117c49d698

Short version: **don't build a consumer subscription tracker.** CARFAX Car Care is free (it is a
loss-leader for their vehicle-history business), ~20% of new subscription apps ever reach $1,000 total
revenue, and 100k paying users would need ~40% of every private car in Saudi Arabia. The value is in the
*record* — a verified service history sells a used car for more in a $10bn market — or in selling to
workshops (100 workshops at 400 SAR/month beats 10,000 consumers). Validate by hand before building.
