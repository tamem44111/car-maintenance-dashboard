// ═══════════════════════════════════════════════════════════════════
// CHECKS.JS — the verification procedure from CLAUDE.md, automated.
//
// Open checks.html and press Run. Everything runs against the real app
// inside a 402px iframe, so the render and overflow checks see exactly
// what an iPhone sees.
//
// SAFETY: this file is served from the same origin as the live app, so a
// test run would otherwise overwrite the owner's real records. Every run
// snapshots the whole of localStorage and restores it in a finally block,
// including when a check throws. IndexedDB (receipt photos) is never touched.
//
// Failures are things that are broken. Warnings are known gaps tracked in
// README's open items — they are surfaced on every run but do not fail it.
// ═══════════════════════════════════════════════════════════════════

const Checks = {
    failures: [], warnings: [], passes: [], _log: null,

    // ── tiny assertion helpers ──
    ok(name, cond, detail) {
        if (cond) this.passes.push(name);
        else this.failures.push({ name, detail: detail || 'expected true' });
        this._paint();
    },
    eq(name, actual, expected, detail) {
        const same = JSON.stringify(actual) === JSON.stringify(expected);
        this.ok(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${detail ? ' — ' + detail : ''}`);
    },
    near(name, actual, expected, tolerance, detail) {
        const same = Math.abs(actual - expected) <= tolerance;
        this.ok(name, same, same ? '' : `expected ~${expected} (±${tolerance}), got ${actual}${detail ? ' — ' + detail : ''}`);
    },
    warn(name, items) {
        if (items && items.length) this.warnings.push({ name, items });
    },

    // A fixture built relative to today, so it never goes stale.
    //
    // The odometer logs alone define the span: 60,000 -> 100,000 km over 365 days
    // = 109.59 km/day. Every service sits *inside* that window on both date and
    // mileage, so adding one never moves the first or last reading and the rate
    // stays a fixed, checkable number.
    // Local calendar days, the same way the app counts them. Saudi Arabia is UTC+3,
    // so a UTC "today" is still yesterday for the first three hours of every day.
    localDay(n) {
        const d = new Date(Date.now() - n * 86400000);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },

    RATE: 40000 / 365,          // lifetime: 60,000 -> 100,000 over 365 days
    RATE_RECENT: 3300 / 30,     // recent window: 96,700 (day 30) -> 100,000 (today)
    fixture() {
        const day = n => this.localDay(n);
        return {
            cars: [{
                id: 'test-car', make: 'Ford', model: 'Taurus', year: '2013',
                mileage: '100000', mileageDate: day(0),
                insuranceExpiry: day(-200), registrationExpiry: day(-400)
            }],
            services: [
                // recent, comfortably inside its 12,000 km interval -> ok
                { id: 's-oil', carId: 'test-car', type: 'Oil Change', date: day(30), mileage: '96700', cost: '200' },
                // 15,000 km interval (set in seed) last done at 62,000 -> due at 77,000, so ~23,000 km overdue
                { id: 's-air', carId: 'test-car', type: 'Air Filter', date: day(350), mileage: '62000', cost: '120' }
            ],
            // one reminder so the Arabic sweep actually reaches the Upcoming Reminders card
            reminders: [{
                id: 'r-air', carId: 'test-car', type: 'Air Filter', dueDate: day(-60),
                dueMileage: '110000', completed: false, autoCreated: true, notes: 'Auto: next Air Filter'
            }],
            fuelLogs: [],
            odometerLogs: [
                { id: 'o-old', carId: 'test-car', km: 60000, date: day(365) },
                { id: 'o-new', carId: 'test-car', km: 100000, date: day(0) }
            ],
            trash: []
        };
    },

    seed(W) {
        W.localStorage.setItem('autocare_data', JSON.stringify(this.fixture()));
        W.localStorage.setItem('autocare_climate', 'normal');
        W.localStorage.setItem('autocare_lang', 'en');
        // An interval short enough to be overdue inside the fixture's 40,000 km of
        // history. The suite is testing the schedule's logic, not Ford's figures, which
        // have their own check.
        W.localStorage.setItem('autocare_custom_recs', JSON.stringify({ 'test-car': { 'Air Filter': { km: 15000, months: 12, note: 'fixture' } } }));
    },

    // ═══════════════ logic checks ═══════════════
    async logic(A) {
        const { Storage, Recommendations, Features, App } = A;
        const car = Storage.getCars()[0];
        const day = n => this.localDay(n);

        // -- odometer projection --
        // The fixture's last two readings are 30 days and 3,300 km apart, which
        // qualifies as a recent window, so that is the rate the app should use.
        this.near('the rate comes from recent driving when there is enough of it',
            Storage.getDailyKmRate('test-car'), this.RATE_RECENT, 0.01);
        this.near('the lifetime figure is still reachable',
            Storage.getDailyKmRate('test-car', { lifetime: true }), this.RATE, 0.01);
        this.eq('a same-day reading is not treated as an estimate',
            Storage.getProjectedMileage(car).estimated, false);

        // -- the rate must follow how the car is driven now, not its whole life --
        // 110 and 109.6 are the same answer; only a real difference should be called one.
        this.eq('a rate barely different from lifetime is not called a change',
            Storage.getRateDetail('test-car').recent, false);

        // Drive the recent stretch much harder and the rate must follow.
        const day0 = Storage.getEffectiveMileage(Storage.getCars()[0]);
        Storage.logOdometer('test-car', day0 + 5000, day(0));
        const harder = Storage.getDailyKmRate('test-car');
        this.ok('a harder recent stretch raises the rate', harder > this.RATE_RECENT * 1.2,
            `${harder.toFixed(1)} vs ${this.RATE_RECENT.toFixed(1)}`);
        this.near('the lifetime figure is unaffected by it',
            Storage.getDailyKmRate('test-car', { lifetime: true }),
            (day0 + 5000 - 60000) / 365, 0.01);
        const detail = Storage.getRateDetail('test-car');
        this.ok('and the change is reported', detail.recent && detail.changePct > 5, String(detail.changePct));

        // The window starts at the OLDEST reading inside it, so a fresh reading can
        // never shrink the span to something meaninglessly short.
        this.ok('the rate is still measured over a usable span',
            Storage.RECENT_MIN_SPAN_DAYS >= 21 && Storage.RECENT_MIN_KM >= 500);
        this.seed(A.W);

        // A reading lower than one already recorded must not become "the latest".
        // The highest known value wins, which is what stops a typo rewriting history.
        Storage.logOdometer('test-car', 99000, day(0));
        this.eq('a lower reading does not replace the highest one',
            Storage.getLastReading(car).km, 100000);
        this.seed(A.W);

        // -- whichever-comes-first --
        const air = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Air Filter');
        this.eq('an exceeded km threshold reads as overdue', air.status, 'overdue');
        this.ok('an overdue item reports negative km remaining', air.kmRemaining < 0, `got ${air.kmRemaining}`);
        this.eq('an overdue item is bound by distance, not time', air.binding, 'km');
        const oil = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Oil Change');
        this.eq('a recent service reads as ok', oil.status, 'ok');
        this.ok('the binding dimension is reported', ['km', 'time'].includes(oil.binding), oil.binding);

        // -- climate multiplier --
        const normalKm = Recommendations.getEffective(car, 'Oil Change').km;
        A.W.localStorage.setItem('autocare_climate', 'severe');
        const severeKm = Recommendations.getEffective(car, 'Oil Change').km;
        A.W.localStorage.setItem('autocare_climate', 'normal');
        this.eq('severe climate shortens the interval by 20%', severeKm, Math.round(normalKm * 0.8));

        // -- inspection dates --
        const exp = Features.certificateExpiry('2026-01-15');
        this.eq('a certificate runs a standard year', exp, '2027-01-15');
        this.eq('inspectionDateFrom inverts certificateExpiry',
            Features.inspectionDateFrom(exp), '2026-01-15');

        // -- REGRESSION: a back-dated inspection record must not touch the odometer --
        // An estimated date paired with a real mileage would land a false reading in
        // getOdometerReadings and destroy the km/day rate every projection depends on.
        const rateBefore = Storage.getDailyKmRate('test-car');
        Storage.addService({
            carId: 'test-car', type: 'Periodic Inspection',
            date: Features.inspectionDateFrom(day(-180)),
            cost: '120', mileage: '', notes: 'Date estimated from the certificate expiry',
            inspectionResult: 'pass', inspectionExpiry: day(-180), inspectionCenter: 'Khobar Centre'
        });
        this.near('a back-dated inspection leaves the driving rate untouched',
            Storage.getDailyKmRate('test-car'), rateBefore, 0.001);
        this.seed(A.W);

        // -- trash round trip --
        Storage.deleteService('s-oil');
        this.eq('a deleted service goes to the trash', Storage.getServices('test-car').length, 1);
        const entry = Storage.getTrash()[0];
        Storage.restoreFromTrash(entry.id);
        this.eq('a restored service comes back', Storage.getServices('test-car').length, 2);
        this.seed(A.W);

        // -- duplicate detection --
        const dupe = Storage.findDuplicateService({ carId: 'test-car', type: 'Oil Change', date: day(30), mileage: '96700' });
        this.ok('a same type, date and mileage counts as a duplicate', !!dupe);
        const notDupe = Storage.findDuplicateService({ carId: 'test-car', type: 'Oil Change', date: day(31), mileage: '96700' });
        this.ok('a different date is not a duplicate', !notDupe);

        // -- "no record" must never be dressed up as a status --
        // The fixture logs Oil Change and Air Filter only, so everything else is unknown.
        const unknowns = Recommendations.unknownTypes(car);
        this.ok('types with no record are reported unknown', unknowns.length > 0, JSON.stringify(unknowns));
        this.ok('a logged type is not unknown', !unknowns.includes('Oil Change'));
        const un = Recommendations.getMaintenanceStatus(car, unknowns[0]);
        this.eq('an unknown item invents no due date', un.dueDate, null);
        this.eq('an unknown item invents no next mileage', un.nextKm, null);
        this.eq('an unknown item claims no distance remaining', un.kmRemaining, null);
        this.eq('an unknown item is not counted as used', un.usedPct, 0);

        // The score must not be propped up by items nobody has ever recorded.
        const health = Storage.getCarHealthScore(car);
        this.ok('unknown items are excluded from the score', health.unknownItems > 0);
        // totalItems is the scheduled items that are known, plus insurance and
        // registration, which are scored separately from the maintenance schedule.
        const docsScored = (car.insuranceExpiry ? 1 : 0) + (car.registrationExpiry ? 1 : 0);
        this.eq('the score counts only what is known',
            health.totalItems,
            Object.keys(Recommendations.getAllForCar(car)).length - health.unknownItems + docsScored);
        this.ok('the score says how much it is based on', health.totalItems > 0 && health.unknownItems > 0);

        // Backfilling a date must teach the schedule without touching the odometer:
        // a remembered date paired with a guessed reading would wreck the km/day rate.
        const rateBefore2 = Storage.getDailyKmRate('test-car');
        const target = unknowns[0];
        Storage.addService({ carId: 'test-car', type: target, date: day(120), cost: '', mileage: '',
            notes: 'Recorded from memory, before logging started', backfilled: true });
        this.near('a date-only backfill leaves the driving rate untouched',
            Storage.getDailyKmRate('test-car'), rateBefore2, 0.001);
        const after = Recommendations.getMaintenanceStatus(Storage.getCars()[0], target);
        this.ok('a backfilled item stops being unknown', after.status !== 'unknown', after.status);
        this.eq('a backfilled item now has a due date', typeof after.dueDate, 'string');
        this.seed(A.W);

        // -- trip planner: the schedule read forward over one journey --
        this.eq('a trip needs a distance', Storage.planTrip('test-car', 0), null);
        const shortTrip = Storage.planTrip('test-car', 100);
        this.eq('a trip starts from the projected odometer', shortTrip.startKm, Storage.getEffectiveMileage(car));
        this.eq('and ends a trip further on', shortTrip.endKm, shortTrip.startKm + 100);
        this.ok('an already-overdue item is flagged before setting off',
            shortTrip.overdue.some(o => o.type === 'Air Filter'));
        this.eq('nothing unknown is claimed to fall due',
            shortTrip.during.filter(d => d.status === 'unknown'), []);

        // Something whose threshold sits inside the trip must be caught, and
        // reported as a distance into the journey rather than an absolute reading.
        const oilSt = Recommendations.getMaintenanceStatus(car, 'Oil Change');
        const reach = oilSt.nextKm - Storage.getEffectiveMileage(car) + 10;
        const longTrip = Storage.planTrip('test-car', reach);
        const hit = longTrip.during.find(d => d.type === 'Oil Change');
        this.ok('an item falling due mid-journey is caught', !!hit,
            JSON.stringify(longTrip.during.map(d => d.type)));
        if (hit) {
            this.eq('it is reported as distance into the trip', hit.intoTrip, hit.atKm - longTrip.startKm);
            this.ok('and that distance is inside the trip', hit.intoTrip > 0 && hit.intoTrip <= reach);
        }

        // Tyres are checked separately, because they are judged separately
        Storage.updateCar('test-car', { tires: { installedDate: day(300), installedMileage: '55000' } });
        A.W.localStorage.setItem('autocare_climate', 'normal');
        const tyreTrip = Storage.planTrip('test-car', 20000);
        this.ok('tyres running out mid-journey are flagged', !!tyreTrip.tyreRunsOut);
        const safeTrip = Storage.planTrip('test-car', 50);
        this.eq('a short hop does not flag the tyres', safeTrip.tyreRunsOut, null);
        this.seed(A.W);

        // Cost of the drive uses the fuel setting, and says so when there is none
        Features.saveFuelSettings({ mode: 'off' });
        this.eq('with no fuel setting the trip reports no fuel cost',
            Storage.planTrip('test-car', 500).fuelCost, null);
        Features.saveFuelSettings({ mode: 'consumption', lp100: '11', price: '2.33' });
        const priced = Storage.planTrip('test-car', 500);
        this.near('trip fuel cost is litres x price', priced.fuelCost, 500 * 11 / 100 * 2.33, 0.01);
        this.ok('trip total is fuel plus wear', priced.totalCost > priced.fuelCost);
        Features.saveFuelSettings({ mode: 'off' });

        // -- an explicitly chosen interval must drive the schedule, not just a reminder --
        const mfrOil = Recommendations.getEffective(car, 'Oil Change');
        this.eq('by default the oil interval comes from the manufacturer', mfrOil.source, 'manufacturer');
        Recommendations.saveCustom('test-car', 'Oil Change', 5000, 6, 'Your oil choice: Regular');
        const ownOil = Recommendations.getEffective(Storage.getCars()[0], 'Oil Change');
        this.eq('a chosen interval takes over', ownOil.source, 'custom');
        this.eq('and the schedule uses the number that was chosen', ownOil.km, 5000);
        const st5 = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Oil Change');
        this.eq('the due point moves with it', st5.rec.km, 5000);

        // Climate shortens manufacturer guidance only. Reducing an explicit 5,000
        // to 4,000 would put a number on screen that nobody picked.
        A.W.localStorage.setItem('autocare_climate', 'severe');
        this.eq('severe climate does not shrink a chosen interval',
            Recommendations.getEffective(Storage.getCars()[0], 'Oil Change').km, 5000);
        Recommendations.deleteCustom('test-car', 'Oil Change');
        this.ok('severe climate still shortens manufacturer guidance',
            Recommendations.getEffective(Storage.getCars()[0], 'Oil Change').km < mfrOil.km,
            String(Recommendations.getEffective(Storage.getCars()[0], 'Oil Change').km) + ' vs ' + mfrOil.km);
        A.W.localStorage.setItem('autocare_climate', 'normal');
        this.seed(A.W);

        // -- a check is an observation, not the job being done --
        const padBefore = Recommendations.getMaintenanceStatus(car, 'Rear Brake Pads');
        Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', date: day(0),
            cost: '', mileage: '', padThickness: '5', checkOnly: true });
        const padAfter = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Rear Brake Pads');
        this.eq('a checked-only record does not reset the schedule', padAfter.lastServiced, padBefore.lastServiced);
        this.eq('and the status is unchanged', padAfter.detail, padBefore.detail);
        this.ok('but the measurement is still stored',
            Storage.getServices('test-car').some(s => s.padThickness === '5' && s.checkOnly));

        // an actual replacement still counts
        Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', date: day(0), cost: '400', mileage: '' });
        this.eq('a real replacement does reset it',
            Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Rear Brake Pads').lastServiced, day(0));
        this.seed(A.W);

        // checking a tyre set does not make it a new set
        Storage.updateCar('test-car', { tires: { installedDate: day(300), installedMileage: '55000' } });
        const tyreBefore = Storage.getTyreStatus(Storage.getCars()[0]).kmOnSet;
        Storage.addService({ carId: 'test-car', type: 'Tires', date: day(0), mileage: '100000', cost: '', checkOnly: true });
        this.eq('checking the tyres does not reset the set',
            Storage.getTyreStatus(Storage.getCars()[0]).kmOnSet, tyreBefore);

        // and checking something does not clear a postponement of it
        Storage.snoozeItem('test-car', 'Tires', 30);
        Storage.addService({ carId: 'test-car', type: 'Tires', date: day(0), mileage: '', cost: '', checkOnly: true });
        this.ok('a check leaves a postponement standing', !!Storage.getSnooze('test-car', 'Tires'));
        this.seed(A.W);

        // -- an accident repair is a one-off: its parts count, its cost does not --
        const runBefore = Storage.getServiceExpenses('test-car');
        const cpkBefore = Storage.getCostPerKm('test-car');
        Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', date: day(0), mileage: '', cost: '',
            accident: true, insurancePaid: true, bills: [{ kind: 'Parts', amount: '2150.01', vendor: 'Test' }] });
        const crash = Storage.getServices('test-car').find(s => s.accident);
        this.near('an accident repair adds nothing to maintenance spend', Storage.getServiceExpenses('test-car'), runBefore, 0.001);
        this.eq('nor to cost per km', Storage.getCostPerKm('test-car'), cpkBefore);
        this.near('its bills still carry the repair\'s value', Storage.getServiceCost(crash), 2150.01, 0.001);
        this.eq('paid by insurance, it cost the owner nothing', Storage.getOwnCost(crash), 0);
        const crashTotals = Storage.getAccidentTotals('test-car');
        this.ok('and it is totalled on its own', crashTotals.count === 1 && Math.abs(crashTotals.value - 2150.01) < 0.001 && crashTotals.own === 0,
            JSON.stringify(crashTotals));
        this.eq('its parts still reset their schedule',
            Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Rear Brake Pads').lastServiced, day(0));
        this.seed(A.W);
        Storage.addService({ carId: 'test-car', type: 'Suspension', date: day(0), mileage: '', cost: '900', accident: true });
        this.eq('a self-paid accident repair is the owner\'s cost', Storage.getAccidentTotals('test-car').own, 900);
        this.near('but still stays out of running spend', Storage.getServiceExpenses('test-car'), runBefore, 0.001);
        this.seed(A.W);

        // -- nothing may be dated in the future --
        // A reading dated tomorrow becomes the car's current mileage; a service dated
        // next year resets its own schedule from a date that has not happened.
        const kmBefore = Storage.getEffectiveMileage(car);
        this.eq('a future-dated odometer reading is refused',
            Storage.logOdometer('test-car', 999999, day(-365)), null);
        this.eq('and the mileage is untouched', Storage.getEffectiveMileage(Storage.getCars()[0]), kmBefore);
        Storage.addService({ carId: 'test-car', type: 'AC Service', date: day(-400), cost: '100', mileage: '' });
        const filed = Storage.getServices('test-car').find(s => s.type === 'AC Service');
        this.ok('a future-dated service is pulled back to today', filed.date <= day(0), filed.date);
        this.seed(A.W);

        // -- a deleted car takes its postponements with it, and brings them back --
        Storage.snoozeItem('test-car', 'Oil Change', 30);
        Storage.deleteCar('test-car');
        this.eq('deleting a car leaves no orphaned postponements',
            Storage.getAll().snoozes.filter(s => s.carId === 'test-car').length, 0);
        const binned = Storage.getTrash().find(t => t.kind === 'car');
        Storage.restoreFromTrash(binned.id);
        this.eq('restoring the car brings its postponements back',
            Storage.getAll().snoozes.filter(s => s.carId === 'test-car').length, 1);
        this.seed(A.W);

        // -- postponing: changes when you are told, never whether it is due --
        const air0 = Recommendations.getMaintenanceStatus(car, 'Air Filter');
        this.eq('the item is overdue before postponing', air0.status, 'overdue');
        const until = Storage.snoozeItem('test-car', 'Air Filter', 30, 'no time');
        this.ok('a postponement records a future return date', until > day(0), until);
        const air1 = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Air Filter');
        this.eq('postponing does NOT change the schedule', air1.status, 'overdue');
        this.eq('and does not move the due date', air1.dueDate, air0.dueDate);
        this.ok('the postponement is findable', !!Storage.getSnooze('test-car', 'Air Filter'));
        this.eq('it appears in the active list', Storage.getActiveSnoozes('test-car').length, 1);

        // postponing again extends it and counts
        Storage.snoozeItem('test-car', 'Air Filter', 7);
        this.eq('postponing again counts the times', Storage.getSnooze('test-car', 'Air Filter').times, 2);

        // an expired postponement lets the item return on its own
        const data = Storage.getAll();
        data.snoozes[0].until = day(2);
        Storage.save(data);
        this.eq('an expired postponement stops applying', Storage.getSnooze('test-car', 'Air Filter'), null);
        this.eq('and drops out of the active list', Storage.getActiveSnoozes('test-car').length, 0);

        // doing the job ends the postponement
        Storage.snoozeItem('test-car', 'Air Filter', 30);
        Storage.addService({ carId: 'test-car', type: 'Air Filter', date: day(0), cost: '80', mileage: '' });
        this.eq('logging the service clears the postponement', Storage.getSnooze('test-car', 'Air Filter'), null);
        this.seed(A.W);

        // it must survive a backup, or a restore silently un-postpones everything
        Storage.snoozeItem('test-car', 'Oil Change', 14);
        this.ok('postponements are part of the saved data', Storage.getAll().snoozes.length === 1);
        this.seed(A.W);

        // -- tyres: judged on distance and on rubber age, whichever binds first --
        this.eq('with no tyre information there is no status', Storage.getTyreStatus(car), null);
        this.ok('Tires is loggable', Recommendations.logTypes().includes('Tires'));
        this.ok('Tires is not in the generic schedule', !Recommendations.ALL_TYPES.includes('Tires'));

        // fitted 45,000 km ago on a 50,000 km life -> near the end on distance
        Storage.updateCar('test-car', { tires: { brand: 'Michelin', size: '215/55R17', installedDate: day(300), installedMileage: '55000' } });
        A.W.localStorage.setItem('autocare_climate', 'normal');
        const worn = Storage.getTyreStatus(Storage.getCars()[0]);
        this.eq('distance covered on the set is measured', worn.kmOnSet, 100000 - 55000);
        this.eq('distance is what binds, not age', worn.reason, 'km');
        this.eq('a set at 45,000 of 50,000 km reads as due soon', worn.status, 'soon');
        this.ok('remaining distance is converted to days at this car\'s rate', worn.daysLeft > 0, String(worn.daysLeft));

        // a logged replacement is newer than the tyre record, and must win
        Storage.addService({ carId: 'test-car', type: 'Tires', date: day(5), mileage: '99500', cost: '1600' });
        const fresh2 = Storage.getTyreStatus(Storage.getCars()[0]);
        this.eq('a logged replacement resets the set', fresh2.kmOnSet, 100000 - 99500);
        this.eq('a fresh set reads ok', fresh2.status, 'ok');

        // rubber age can condemn a set the tread would pass
        Storage.updateCar('test-car', { tires: { installedDate: day(5), installedMileage: '99500', manufactureDate: '2018-06' } });
        const old2 = Storage.getTyreStatus(Storage.getCars()[0]);
        this.eq('age condemns a set with plenty of tread left', old2.status, 'replace');
        this.eq('and says age was the reason', old2.reason, 'age');
        this.seed(A.W);

        // -- the picker's grouping must stay in step with the type lists --
        const grouped = Recommendations.GROUPS.flatMap(g => g[1]);
        const dupes = grouped.filter((t, i) => grouped.indexOf(t) !== i);
        this.eq('no type is listed in two groups', dupes, []);
        this.eq('every grouped type is a real type',
            grouped.filter(t => !Recommendations.logTypes().includes(t)), []);
        this.eq('the only ungrouped type is the legacy one',
            Recommendations.logTypes().filter(t => !grouped.includes(t)), Recommendations.LEGACY_TYPES);
        this.ok('the legacy Brake Pads entry is still a valid type for old records',
            Recommendations.logTypes().includes('Brake Pads'));

        // Alignment claimed to be scheduled but no interval exists for it anywhere,
        // so it could never report a status. It belongs with the condition-based jobs.
        this.ok('Alignment is not claimed as scheduled', !Recommendations.ALL_TYPES.includes('Alignment'));
        this.ok('Alignment is still loggable', Recommendations.logTypes().includes('Alignment'));
        this.eq('every scheduled type can actually produce a status',
            Recommendations.ALL_TYPES.filter(t => Recommendations.appliesTo(car, t) && !Recommendations.getEffective(car, t)), []);

        // -- the pinned due row --
        const due = Recommendations.dueTypes(car);
        this.ok('the due row finds the overdue air filter', due.some(d => d.type === 'Air Filter'), JSON.stringify(due.map(d => d.type)));
        this.eq('nothing healthy reaches the due row', due.filter(d => d.status === 'ok'), []);
        this.eq('nothing unknown reaches the due row', due.filter(d => d.status === 'unknown'), []);
        this.ok('the due row puts overdue before due-soon',
            due.every((d, i) => i === 0 || !(d.status === 'overdue' && due[i - 1].status === 'soon')));

        // -- fuel estimate: three modes, and the two input styles must agree --
        const span = Storage.getTrackedKm('test-car');
        this.ok('tracked distance is the reading span', span > 0, String(span));
        Features.saveFuelSettings({ mode: 'off' });
        const off = Storage.getCostBreakdown('test-car');
        this.eq('with fuel off, nothing is estimated', off.fuelEstimated, false);
        this.eq('with fuel off, cost per km is maintenance only', +off.totalPerKm.toFixed(6), +off.maintPerKm.toFixed(6));

        Features.saveFuelSettings({ mode: 'consumption', lp100: '11', price: '2.33' });
        const cons = Storage.getCostBreakdown('test-car');
        this.eq('consumption mode estimates fuel', cons.fuelEstimated, true);
        this.near('fuel cost is litres x price', cons.fuel, span * 11 / 100 * 2.33, 0.01);
        this.ok('fuel dwarfs maintenance at this mileage', cons.fuel > cons.maintenance);
        this.near('the parts add up to the total', cons.maintPerKm + cons.fuelPerKm, cons.totalPerKm, 1e-9);

        // The same real spend entered either way must land in the same place.
        const liveRate = Storage.getDailyKmRate('test-car');
        const monthlyEquivalent = (span * 11 / 100 * 2.33) / (span / liveRate / 30.44);
        Features.saveFuelSettings({ mode: 'monthly', monthly: String(monthlyEquivalent), price: '2.33' });
        this.near('monthly spend agrees with consumption mode',
            Storage.getCostBreakdown('test-car').fuel, cons.fuel, 1);

        // A mistyped figure must be caught rather than silently distorting every cost
        this.eq('an implausibly low consumption is flagged', Features.fuelSanity(2).ok, false);
        this.eq('an implausibly high consumption is flagged', Features.fuelSanity(40).ok, false);
        this.eq('a realistic consumption passes', Features.fuelSanity(11).ok, true);

        // Keep-or-sell deliberately ignores fuel: you would pay it on any car
        this.eq('keep-or-sell still excludes fuel', Storage.getOwnershipAnalysis('test-car').fuel12, 0);

        // REGRESSION: the fuel setting must ride along in backups. Omitting the
        // climate multiplier once lengthened every interval after a restore.
        this.ok('the fuel setting is in SETTING_KEYS', !!Features.SETTING_KEYS.fuel);
        const packed = Features.collectSettings();
        this.eq('a backup payload carries the fuel setting', packed.fuel.mode, 'monthly');
        Features.saveFuelSettings({ mode: 'off', lp100: '', monthly: '' });
        Features.applySettings(packed);
        this.eq('restoring a backup brings the fuel setting back', Features.getFuelSettings().mode, 'monthly');
        Features.saveFuelSettings({ mode: 'off' });

        // -- REGRESSION: a backup must carry settings, or restoring it silently
        //    lengthens every interval by 25% --
        A.W.localStorage.setItem('autocare_climate', 'severe');
        const settings = Features.collectSettings();
        this.eq('a backup payload carries the climate setting', settings.climate, 'severe');
        A.W.localStorage.setItem('autocare_climate', 'normal');
    },

    // ═══════════════ render checks ═══════════════
    async render(A) {
        const { App, I18N, Features, Storage, Recommendations, W, D } = A;
        const pages = ['dashboard', 'cars', 'services', 'fuel', 'expenses', 'warranty', 'reminders'];
        const modals = {
            'add car': () => App.openCarModal(),
            'edit car': () => App.openCarModal(Storage.getCars()[0]),
            'add service': () => App.openServiceModal(),
            'inspection service': () => { App.openServiceModal(null, 'test-car', 'Periodic Inspection'); App._toggleServiceExtras(); },
            'add fuel': () => App.openFuelModal(),
            'add reminder': () => App.openReminderModal(),
            'custom interval': () => App.openCustomRecModal('test-car'),
            'repeat picker': () => App.openRepeatPicker(),
            'odometer': () => Features.openOdometerModal('test-car'),
            'document: insurance': () => Features.openDocumentModal('test-car', 'insuranceExpiry'),
            'document: inspection': () => Features.openDocumentModal('test-car', 'fahesExpiry'),
            'settings': () => Features.showSettingsModal(),
            'tyres': () => Features.openTireModal('test-car')
        };

        const overflowing = root => {
            const out = [];
            root.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && (r.right > W.innerWidth + 1 || r.left < -1))
                    out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
            });
            return out;
        };
        // The bug class this suite exists for: a template literal wrapped in single
        // quotes renders its own source instead of the value.
        const rawTemplates = root => (root.innerText.match(/\$\{[^}]*\}/g) || []);

        this.eq('the test viewport is an iPhone width', W.innerWidth, 402);

        for (const lang of ['en', 'ar']) {
            I18N.set(lang); I18N.translateDOM();

            for (const p of pages) {
                let threw = null;
                try { App.navigate(p); } catch (e) { threw = e.message; }
                this.ok(`[${lang}] page renders: ${p}`, !threw, threw);
                if (threw) continue;
                const root = D.getElementById('page-' + p);
                this.eq(`[${lang}] no overflow at 402px: ${p}`, overflowing(root), []);
                this.eq(`[${lang}] no raw template literals: ${p}`, rawTemplates(root), []);
            }

            for (const [name, open] of Object.entries(modals)) {
                let threw = null;
                try { open(); } catch (e) { threw = e.message; }
                this.ok(`[${lang}] modal opens: ${name}`, !threw, threw);
                if (threw) { try { App.closeModal(); } catch (e) {} continue; }
                const m = D.getElementById('modal');
                this.ok(`[${lang}] modal is visible: ${name}`, m.style.display !== 'none');
                this.eq(`[${lang}] no overflow at 402px: ${name}`, overflowing(m), []);
                this.eq(`[${lang}] no raw template literals: ${name}`, rawTemplates(m), []);
                App.closeModal();
            }
        }

        // -- REGRESSION: a due type appears in the pinned row AND in its group.
        //    Ticking one must tick both, and must still file a single job. --
        App.openServiceModal();
        const boxes = [...D.querySelectorAll('.service-chips input[type="checkbox"]')];
        const airBoxes = boxes.filter(b => b.value === 'Air Filter');
        this.eq('an overdue type shows in both the due row and its group', airBoxes.length, 2);
        airBoxes[0].checked = true;
        App._syncChip(airBoxes[0]);
        this.ok('ticking one of the pair ticks the other', airBoxes[1].checked);
        const picked = [...new Set([...D.querySelectorAll('.service-chips input:checked')].map(b => b.value))];
        this.eq('the pair still counts as one job', picked, ['Air Filter']);
        // every type is reachable, and the legacy one is not offered
        const offered = [...new Set(boxes.map(b => b.value))];
        this.eq('the picker offers every type except the legacy one',
            offered.sort(), Recommendations.logTypes().filter(t => !Recommendations.LEGACY_TYPES.includes(t)).sort());
        this.ok('the legacy type is not offered for new records', !offered.includes('Brake Pads'));
        this.eq('the picker shows a heading per group',
            D.querySelectorAll('.svc-group-head').length, Recommendations.GROUPS.length);
        App.closeModal();

        // -- an accident repair is labelled wherever its cost shows, and the
        //    insurance toggle only exists alongside it --
        Storage.addService({ carId: 'test-car', type: 'Suspension', date: '2026-01-10', mileage: '', cost: '',
            accident: true, insurancePaid: true, bills: [{ kind: 'Parts', amount: '2150.01', vendor: 'Test' }] });
        const crashRec = Storage.getServices('test-car').find(s => s.accident);
        for (const lang of ['en', 'ar']) {
            I18N.set(lang); I18N.translateDOM();
            App.navigate('services');
            const svcPage = D.getElementById('page-services');
            this.ok(`[${lang}] the services list marks the accident`, !!svcPage.querySelector('.badge-red'));
            this.ok(`[${lang}] and shows what insurance paid`, svcPage.innerText.includes('2,150'), svcPage.innerText.slice(0, 200));
            this.eq(`[${lang}] no overflow at 402px: services with an accident`, overflowing(svcPage), []);
            App.navigate('expenses');
            const expPage = D.getElementById('page-expenses');
            this.ok(`[${lang}] expenses name the repair outside the totals`,
                (D.getElementById('expenses-summary').innerText || '').includes('2,150'));
            this.eq(`[${lang}] no overflow at 402px: expenses with an accident`, overflowing(expPage), []);
            this.eq(`[${lang}] no raw template literals: expenses with an accident`, rawTemplates(expPage), []);
        }
        I18N.set('en'); I18N.translateDOM();
        App.openServiceModal(crashRec);
        App._paintAccident();
        this.ok('editing it shows both marks ticked', D.getElementById('f-accident').checked && D.getElementById('f-insured').checked);
        this.ok('the insurance mark shows for an accident', D.getElementById('f-insured-wrap').style.display !== 'none');
        D.getElementById('f-accident').checked = false;
        App._paintAccident();
        this.ok('and hides when it is not one', D.getElementById('f-insured-wrap').style.display === 'none');
        this.eq('unticking accident drops insurance with it', App._readAccident(), { accident: false, insurancePaid: false });
        App.closeModal();
        this.seed(W);

        // -- REGRESSION: the empty states that once printed their own source --
        const saved = W.localStorage.getItem('autocare_data');
        const data = JSON.parse(saved);
        W.localStorage.setItem('autocare_data', JSON.stringify({ ...data, services: [], reminders: [] }));
        for (const lang of ['en', 'ar']) {
            I18N.set(lang); I18N.translateDOM();
            App.navigate('dashboard');
            const recent = D.getElementById('recent-services').innerText.trim();
            const upcoming = D.getElementById('upcoming-reminders').innerText.trim();
            this.ok(`[${lang}] empty service list shows a message, not source`, recent.length > 0 && !recent.includes('${'), recent);
            this.ok(`[${lang}] empty reminder list shows a message, not source`, upcoming.length > 0 && !upcoming.includes('${'), upcoming);
            if (lang === 'ar') {
                this.ok('[ar] the empty messages are translated', /[؀-ۿ]/.test(recent) && /[؀-ۿ]/.test(upcoming), recent + ' / ' + upcoming);
            }
        }
        W.localStorage.setItem('autocare_data', saved);

        // -- Arabic sweep: report, do not fail. Known gaps live in README open items. --
        // Fill in what the empty fixture leaves out, so the sweep reaches the keep-or-sell
        // note, the tyre block and a warranty card.
        Storage.updateCar('test-car', { marketValue: '25000', tires: { brand: 'X', size: '235', installedDate: '2026-01-01', installedMileage: '90000', pattern: 'forward' } });
        Storage.addService({ carId: 'test-car', type: 'Battery', date: this.localDay(40), mileage: '95000', cost: '300',
            bills: [{ id: 'b1', kind: 'Parts', label: '', vendor: 'X', photoIds: [], amount: '300', warrantyMonths: '24', warrantyKm: '', startKm: '95000', date: this.localDay(40) }] });
        I18N.set('ar'); I18N.translateDOM();
        const untranslated = [];
        // Only bare figures are exempt. This used to allow any text containing "km"
        // or "SAR", which hid whole sentences of English.
        const allow = /^[~\d\s.,:%+\-\/()·—–▲▼×]*(km|SAR|mm|L|L\/100km|SAR\/km|%)?[\s.,]*$|^(km|SAR|SAR\/km|L)$|\d SAR \(\d+%\)$|Ford|Taurus|^AutoCare$|📷|^English$|^العربية$|^A R J|^X( 235)?$/;
        for (const p of pages) {
            App.navigate(p);
            const walk = D.createTreeWalker(D.getElementById('page-' + p), W.NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const txt = n.textContent.trim();
                if (!txt || /[؀-ۿ]/.test(txt) || allow.test(txt)) continue;
                untranslated.push(`${p}: ${txt.slice(0, 50)}`);
            }
        }
        this.warn('English text still showing in Arabic', [...new Set(untranslated)]);

        // The Add Service modal is the densest form in the app; sweep inside it too,
        // since the page-level walk never opens it.
        const modalGaps = [];
        const walkModal = name => {
            const walk = D.createTreeWalker(D.getElementById('modal'), W.NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const txt = n.textContent.trim();
                if (!txt || /[؀-ۿ]/.test(txt) || allow.test(txt)) continue;
                modalGaps.push(`${name}: ${txt.slice(0, 45)}`);
            }
        };
        const fillIn = () => { D.querySelectorAll('#modal select').forEach(sel => sel.dispatchEvent(new W.Event('change'))); };
        [['add service', () => App.openServiceModal()],
         ['edit service', () => App.openServiceModal(Storage.getServices('test-car').find(s => s.type === 'Battery'))],
         ['add fuel', () => App.openFuelModal()],
         ['add reminder', () => App.openReminderModal()],
         ['edit car', () => App.openCarModal(Storage.getCars()[0])],
         ['odometer', () => Features.openOdometerModal('test-car')],
         ['tyres', () => Features.openTireModal('test-car')],
         ['settings', () => Features.showSettingsModal()],
         ['custom interval', () => App.openCustomRecModal('test-car')],
         ['repeat', () => App.openRepeatPicker()],
         ['document', () => Features.openDocumentModal('test-car', 'fahesExpiry')],
         ['postpone', () => Features.openSnoozeModal('test-car', 'Air Filter')],
         ['trip', () => Features.openTripModal('test-car')]].forEach(([name, open]) => {
            open();
            fillIn();
            walkModal(name);
            D.querySelectorAll('#modal [placeholder]').forEach(el => {
                const txt = el.getAttribute('placeholder').trim();
                if (!txt || /[؀-ۿ]/.test(txt) || allow.test(txt)) return;
                modalGaps.push(`${name} [placeholder]: ${txt.slice(0, 45)}`);
            });
            App.closeModal();
        });
        this.warn('English text still showing in Arabic — inside modals', [...new Set(modalGaps)]);
        I18N.set('en'); I18N.translateDOM(); App.navigate('dashboard');
    },

    // ═══════════════ runner ═══════════════
    _load(iframe, src) {
        return new Promise(resolve => {
            iframe.addEventListener('load', () => setTimeout(resolve, 80), { once: true });
            iframe.src = src;
        });
    },

    async _photoSnapshot(Photos) {
        const out = {};
        try { for (const id of await Photos.keys()) out[id] = await Photos.get(id); } catch (e) {}
        return out;
    },

    // Puts back any photo that is gone, and names it so the loss is not silent
    async _photoRestore(iframe, before) {
        const lost = [];
        try {
            const Photos = iframe.contentWindow.eval('Photos');
            // the app removes unused photos a moment after the save that orphaned them
            await new Promise(r => setTimeout(r, 300));
            const now = new Set(await Photos.keys());
            for (const id of Object.keys(before)) {
                if (!now.has(id)) { lost.push(id); await Photos.put(id, before[id]); }
            }
        } catch (e) { lost.push('could not check the photo store: ' + e.message); }
        return lost;
    },

    async run(iframe, logEl) {
        this.failures = []; this.warnings = []; this.passes = []; this._log = logEl;
        // A run that was cut short can leave the frame on the preview page
        let onApp = false;
        try { onApp = iframe.contentWindow.eval("typeof App === 'object' && typeof App.renderDashboard") === 'function'; } catch (e) {}
        if (!onApp) await this._load(iframe, 'classic.html');
        const W = iframe.contentWindow;
        const D = W.document;

        // Snapshot everything before touching it — this page shares an origin
        // with the live app, and the owner's records are not ours to lose.
        const snapshot = {};
        for (let i = 0; i < W.localStorage.length; i++) {
            const k = W.localStorage.key(i);
            snapshot[k] = W.localStorage.getItem(k);
        }
        const realAlert = W.alert, realConfirm = W.confirm;
        // Receipt photos are kept outside localStorage, so the snapshot above does not
        // hold them. They are the owner's only copy of his bills.
        const photos = await this._photoSnapshot(W.eval('Photos'));

        try {
            W.alert = () => {}; W.confirm = () => true;
            // const-declared modules are not on window; eval sees the global lexical scope
            W.eval('window.__modules = {Storage, Recommendations, Features, App, I18N, Photos};');
            const A = { ...W.__modules, W, D };
            // The app tidies away any photo no bill points to. With the fixture loaded
            // that is every receipt the owner has, so tidying is off while tests run.
            A.Photos.remove = () => Promise.resolve();

            this.seed(W);
            await this.logic(A);
            this.seed(W);
            await this.render(A);
            this.seed(W);
            await this.regressions(A);
            await this.preview(iframe);
        } catch (e) {
            this.failures.push({ name: 'the run itself threw', detail: e.message + '\n' + (e.stack || '').split('\n')[1] });
        } finally {
            W.alert = realAlert; W.confirm = realConfirm;
            // Through this page's own storage, not the frame's: the preview page
            // switches its writes off, and a restore sent through it would do nothing.
            window.localStorage.clear();
            Object.keys(snapshot).forEach(k => window.localStorage.setItem(k, snapshot[k]));
            const lost = await this._photoRestore(iframe, photos);
            if (lost.length) this.failures.push({ name: 'the run removed receipt photos (they have been put back)', detail: lost.join(', ') });
            this._paint(true);
        }
        return { passed: this.passes.length, failed: this.failures.length, warned: this.warnings.length };
    },

    // The new design (index.html). It reads and writes the same records through the
    // same code as the classic screens, so it must show the same numbers in both
    // languages, and what it saves must be what the classic form would have saved.
    async preview(iframe) {
        const store = window.localStorage;
        const dump = () => JSON.stringify(Object.keys(store).sort().map(k => [k, store.getItem(k)]));
        let W, D;
        const open = async (lang, hash) => {
            store.setItem('autocare_lang', lang);
            await this._load(iframe, 'index.html?t=' + Date.now() + (hash ? '#' + hash : ''));
            W = iframe.contentWindow; D = W.document;
            // As for the classic screens: no photo is tidied away while the fixture is
            // loaded, and a backup is built but not handed to the phone.
            // The calendar file is kept where a check can read it.
            W.eval("Photos.remove = () => Promise.resolve(); Features._deliverBackup = () => Promise.resolve('download');"
                + "window.__cal = null; Features._deliverFile = (text, name, mime) => { window.__cal = { text, name, mime }; return Promise.resolve('share'); };");
        };
        const wide = root => {
            const out = [];
            root.querySelectorAll('*').forEach(el => {
                // the row of job chips scrolls sideways on purpose; the page must not
                if (el.closest('.chips')) return;
                const r = el.getBoundingClientRect();
                if (r.width > 0 && (r.right > W.innerWidth + 1 || r.left < -1))
                    out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
            });
            return out;
        };
        // anything left in English, apart from what the owner typed himself
        const english = () => {
            const gaps = [];
            const walk = D.createTreeWalker(D.body, W.NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const txt = n.textContent.trim();
                if (!txt || /[؀-ۿ]/.test(txt) || /^[~\d\s.,:%+\-\/()·—–×]*$|Ford|Taurus|^English$/.test(txt)) continue;
                if (n.parentElement && (/SCRIPT|STYLE|TEXTAREA/.test(n.parentElement.tagName) || n.parentElement.closest('[dir="auto"]'))) continue;
                gaps.push(txt.slice(0, 40));
            }
            return gaps;
        };
        const $ = sel => D.querySelector(sel);
        const tap = sel => { const el = $(sel); if (!el) throw new Error('nothing to tap at ' + sel); el.click(); };
        const type = (sel, value) => {
            const el = $(sel);
            if (!el) throw new Error('nothing to type into at ' + sel);
            el.value = value;
            el.dispatchEvent(new W.Event('input', { bubbles: true }));
        };
        const S = () => W.eval('Storage');
        const records = () => S().getServices('test-car');
        const car = () => S().getCars()[0];
        const today = this.localDay(0);
        const rows = () => [...D.querySelectorAll('.visit')];
        const rowFor = day => $(`.visit[data-visit="${this.localDay(day)}"]`);
        const sheet = () => $('.sheet');
        const digits = el => parseInt((el ? el.textContent : '').replace(/[^\d]/g, ''), 10) || 0;
        const yearTotals = () => [...D.querySelectorAll('.year h2 span + span')].reduce((n, el) => n + digits(el), 0);

        try {
            this.seed(window);
            await open('en');
            const before = dump();
            const app = D.getElementById('app');
            this.ok('[new] Home draws', app.querySelectorAll('.card').length >= 2, app.innerText.slice(0, 120));
            this.ok('[new] it shows the odometer the classic screens show', app.innerText.includes('100,000'), app.innerText.slice(0, 80));
            const first = $('.row');
            this.ok('[new] the overdue air filter leads the list',
                !!first && first.classList.contains('overdue') && /Air filter/.test(first.textContent), first && first.textContent);
            this.ok('[new] and is marked on the road', !!$('.track .mark.overdue'));
            const road = $('.track').getBoundingClientRect();
            this.ok('[new] every marker sits on the road', [...D.querySelectorAll('.track .mark')].every(m => {
                const r = m.getBoundingClientRect();
                return r.left >= road.left - 1 && r.right <= road.right + 9;
            }));
            // a job due by date sits on the road at an estimated distance, and must say so
            const estimated = W.eval(`Next.roadHTML(Next.visits([{ type: 'Rear Brake Pads', status: 'ok', days: 81, km: 10036, kmFirst: false, kmLeft: 56000, daysLeft: 81 }]))`);
            this.ok('[new] a distance worked out from a date says "about"', /about 10,000 km/.test(estimated), estimated.replace(/<[^>]+>/g, ' ').trim().slice(0, 80));
            this.eq('[new] no overflow on Home at 402px', wide(D.body), []);
            this.eq('[new] no raw template literals', app.innerText.match(/\$\{[^}]*\}/g) || [], []);

            // looking is not changing: every screen and sheet opened, nothing saved
            tap('[data-go="history"]'); tap('.visit'); tap('[data-close="sheet"]');
            tap('[data-go="car"]');
            this.ok('[new] Car lists the schedule and the documents',
                D.querySelectorAll('[data-do="job"]').length >= 10 && D.querySelectorAll('[data-do="doc"]').length === 3,
                app.innerText.slice(0, 160));
            this.eq('[new] no overflow on Car', wide(D.body), []);
            tap('[data-do="job"][data-arg="Air Filter"]'); tap('[data-do="every"]');
            this.eq('[new] no overflow in a schedule sheet', wide(D.getElementById('sheet')), []);
            tap('[data-close="sheet"]');
            tap('[data-do="doc"]'); tap('[data-close="sheet"]');
            tap('[data-go="home"]'); tap('[data-do="odo"]'); tap('[data-close="sheet"]');
            tap('.plus'); tap('[data-close="sheet"]');
            this.eq('[new] looking around changes nothing', dump(), before);

            // ── Logging: three steps from the overdue row on Home ──
            const n0 = records().length;
            tap('.row.overdue');
            this.eq('[new] Log starts with the job that was tapped', [...D.querySelectorAll('.pick[aria-pressed="true"]')].map(b => b.textContent), ['Air filter']);
            this.eq('[new] no overflow in step 1', wide(D.getElementById('sheet')), []);
            tap('[data-do="logNext"]');
            this.eq('[new] step 2 offers today', $('[data-f="date"]').value, today);
            type('[data-f="km"]', '100500');
            this.eq('[new] no overflow in step 2', wide(D.getElementById('sheet')), []);
            tap('[data-do="logNext"]');
            type('[data-f="cost:Air Filter"]', '150');
            this.ok('[new] the total follows the typing', /150 SAR/.test($('#log-total').textContent), $('#log-total').textContent);
            this.eq('[new] no overflow in step 3', wide(D.getElementById('sheet')), []);
            tap('[data-do="saveLog"]');
            const air = records().slice(n0)[0] || {};
            this.eq('[new] it saves one record with what was typed',
                [records().length - n0, air.type, air.date, air.mileage, air.cost, (air.bills || []).length],
                [1, 'Air Filter', today, '100500', '150', 0]);
            this.eq('[new] the reading becomes the car\'s odometer', car().mileage, '100500');
            const due = S().getReminders('test-car').find(r => r.type === 'Air Filter' && !r.completed && r.autoCreated);
            this.eq('[new] and the next one is counted from it', due && due.dueMileage, '115500');
            this.ok('[new] the list no longer shows it overdue', !$('.row.overdue'), ($('.row') || {}).textContent);
            this.ok('[new] the sheet closes and says so', !sheet() && /Saved/.test($('#toast').textContent), $('#toast').textContent);

            // the same job again, same day, same reading
            tap('.plus'); tap('.pick[data-arg="Air Filter"]'); tap('[data-do="logNext"]');
            type('[data-f="km"]', '100500'); tap('[data-do="logNext"]'); tap('[data-do="saveLog"]');
            this.ok('[new] a second copy is stopped and explained',
                records().length === n0 + 1 && !!$('.warn') && /Save anyway/.test($('[data-do="saveLog"]').textContent),
                ($('.warn') || {}).textContent);
            tap('[data-close="sheet"]');

            // oil with a new interval, a pad measurement, and an inspection, in one visit
            tap('.plus');
            ['Oil Change', 'Front Brake Pads', 'Periodic Inspection'].forEach(ty => tap(`.pick[data-arg="${ty}"]`));
            tap('[data-do="logNext"]'); type('[data-f="km"]', '100600'); tap('[data-do="logNext"]');
            this.eq('[new] each job asks only what it needs',
                [!!$('[data-arg="oil=10000"]'), !!$('[data-f="pad:Front Brake Pads"]'), !!$('[data-arg="inspResult=fail"]'), !!$('[data-f="inspExpiry"]')],
                [true, true, true, true]);
            this.eq('[new] no overflow in a full step 3', wide(D.getElementById('sheet')), []);
            tap('[data-arg="oil=10000"]');
            type('[data-f="cost:Oil Change"]', '200'); type('[data-f="pad:Front Brake Pads"]', '7'); type('[data-f="shop"]', 'Corner shop');
            tap('[data-do="saveLog"]');
            const byType = ty => records().find(s => s.type === ty && s.mileage === '100600') || {};
            const oil = byType('Oil Change');
            this.eq('[new] the oil choice is saved and becomes the car\'s interval',
                [oil.oilInterval, (W.eval('Recommendations').getCustom()['test-car']['Oil Change'] || {}).km], ['10000', 10000]);
            this.eq('[new] a shop name turns the cost into a bill', (oil.bills || []).map(b => [b.vendor, b.amount]), [['Corner shop', '200']]);
            this.eq('[new] the pad measurement is kept', byType('Front Brake Pads').padThickness, '7');
            this.eq('[new] a passed inspection sets the certificate date', car().fahesExpiry, W.eval('Features').certificateExpiry(today));
            const oilDue = S().getReminders('test-car').find(r => r.type === 'Oil Change' && !r.completed && r.autoCreated);
            this.eq('[new] the next oil change is 10,000 km on', oilDue && oilDue.dueMileage, '110600');

            // ── Editing and deleting, from History ──
            tap('[data-go="history"]');
            tap(`.visit[data-visit="${today}"]`);
            this.eq('[new] the day\'s four jobs are one visit', sheet().querySelectorAll('.job').length, 4);
            tap(`[data-do="edit"][data-arg="${air.id}"]`);
            this.eq('[new] no overflow in the edit sheet', wide(D.getElementById('sheet')), []);
            type('[data-f="cost"]', '175'); tap('[data-arg="accident"]'); tap('[data-arg="insured"]'); tap('[data-do="saveEdit"]');
            const air2 = records().find(s => s.id === air.id);
            this.eq('[new] an edit saves the cost and who paid', [air2.cost, air2.accident, air2.insurancePaid, air2.mileage], ['175', true, true, '100500']);
            this.ok('[new] and returns to the visit', !!sheet() && sheet().querySelectorAll('.job').length === 4);
            tap(`[data-do="edit"][data-arg="${air.id}"]`); tap('[data-do="delete"]');
            this.ok('[new] deleting asks for a second tap', records().some(s => s.id === air.id) && /again/.test($('[data-do="delete"]').textContent));
            tap('[data-do="delete"]');
            this.ok('[new] the second tap deletes', !records().some(s => s.id === air.id));
            tap('#toast button');
            this.ok('[new] Undo brings it back', records().some(s => s.id === air.id));

            // ── Odometer, documents, intervals ──
            tap('[data-go="home"]'); tap('[data-do="odo"]');
            type('[data-f="km"]', '99000'); tap('[data-do="saveOdo"]');
            this.ok('[new] a reading lower than the last is questioned', car().mileage === '100600' && !!$('.warn'), ($('.warn') || {}).textContent);
            type('[data-f="km"]', '100900'); tap('[data-do="saveOdo"]');
            this.eq('[new] a new reading is saved', [car().mileage, /100,900/.test($('.odo').textContent)], ['100900', true]);

            tap('[data-go="car"]'); tap('[data-do="doc"][data-arg="insuranceExpiry"]');
            type('[data-f="date"]', this.localDay(5)); tap('[data-do="saveDoc"]');
            this.ok('[new] a document date is saved and read back', car().insuranceExpiry === this.localDay(5) && !!$('[data-do="doc"].overdue'), car().insuranceExpiry);

            tap('[data-do="job"][data-arg="Cabin Air Filter"]'); tap('[data-do="every"]');
            type('[data-f="ikm"]', '20000'); type('[data-f="imonths"]', '18'); tap('[data-do="saveEvery"]');
            const own = () => (W.eval('Recommendations').getCustom()['test-car'] || {})['Cabin Air Filter'];
            this.eq('[new] an interval can be set by the owner', own() && [own().km, own().months], [20000, 18]);
            tap('[data-do="job"][data-arg="Cabin Air Filter"]'); tap('[data-do="every"]'); tap('[data-do="resetEvery"]');
            this.ok('[new] and handed back to the maker\'s schedule', !own());

            // ── Backup, through the code the classic screens use ──
            tap('[data-do="backup"]');
            await new Promise(r => setTimeout(r, 400));
            this.ok('[new] a backup reports what it holds, in a sheet', !!$('.say') && /service record/.test($('.say').textContent) && !!store.getItem('autocare_lastBackup'),
                ($('.say') || {}).textContent);
            tap('[data-close="sheet"]');
            W.eval("Features._pendingImport = JSON.parse(localStorage.getItem('autocare_data')); Features._showImportChoice(Features._pendingImport);");
            this.ok('[new] restoring asks replace or add, in a sheet', !!$('#imp-replace') && !!$('#imp-merge'), sheet() && sheet().innerText.slice(0, 80));
            this.eq('[new] no overflow in the restore sheet', wide(D.getElementById('sheet')), []);
            tap('#imp-merge');
            await new Promise(r => setTimeout(r, 200));
            this.ok('[new] and says when it is done', !!$('.say') && /Import complete/.test($('.say').textContent), ($('.say') || {}).textContent);
            tap('[data-close="sheet"]');

            tap('[data-do="lang"][data-arg="ar"]');
            this.eq('[new] the language switch mirrors the page and is remembered', [D.documentElement.getAttribute('dir'), store.getItem('autocare_lang')], ['rtl', 'ar']);

            // ── Added on 2026-11-14: what the owner asked to be improved ──
            const tick = ms => new Promise(r => setTimeout(r, ms));
            const text = el => (el ? el.textContent.replace(/\s+/g, ' ') : '');
            this.seed(window);
            store.setItem('autocare_lastBackup', new Date(Date.now() - 5000).toISOString());
            store.removeItem('autocare_lastReceipt');
            store.removeItem('autocare_fuel');
            await open('en');
            const page = () => D.getElementById('app');
            this.ok('[new] the next visit says what it usually costs, from past bills', /Usually about 120 SAR/.test(text($('.row'))), text($('.row')));

            // logging without reading the odometer, with a warranty and a receipt
            tap('.row.overdue'); tap('[data-do="logNext"]');
            this.eq('[new] the odometer field starts empty, not on a guess', $('[data-f="km"]').value, '');
            this.ok('[new] and says what an empty one is counted as', /use your reading from that day, 100,000 km/.test(text($('#km-note'))), text($('#km-note')));
            tap('[data-do="logNext"]');
            tap('[data-do="war"]'); type('[data-f="warMonths"]', '12'); type('[data-f="cost:Air Filter"]', '90');
            this.eq('[new] no overflow with a warranty open', wide(D.getElementById('sheet')), []);
            W.eval("Next.form.photoIds.push('ph-test')");
            tap('[data-do="saveLog"]');
            const noKm = records().filter(s => s.type === 'Air Filter').pop();
            this.eq('[new] a job saved without a reading holds none, and the car keeps its own', [noKm.mileage, car().mileage], ['', '100000']);
            this.eq('[new] the warranty typed in step 3 is saved with the job', (noKm.bills || []).map(b => [b.warrantyMonths, b.amount, b.photoIds.length]), [['12', '90', 1]]);
            this.ok('[new] the schedule still counts it, from that day\'s reading', !$('.row.overdue'), text($('.row')));
            this.ok('[new] saving a receipt offers a backup there and then', /Back up/.test(text($('#toast button'))), text($('#toast')));
            this.ok('[new] and Home keeps saying so until it is done', /only on this phone/.test(text($('.nudge[data-do="backup"]'))), text($('.nudge')));
            tap('[data-go="car"]');
            this.ok('[new] the warranty shows on the Car screen', /Warranties/.test(text(page())) && /days left/.test(text(page())));

            // a brake check is when pads get measured
            tap('.plus'); tap('.pick[data-arg="Brake Inspection"]'); tap('[data-do="logNext"]'); tap('[data-do="logNext"]');
            this.eq('[new] a brake check asks for both pad thicknesses', [!!$('[data-f="pad:Front Brake Pads"]'), !!$('[data-f="pad:Rear Brake Pads"]')], [true, true]);
            type('[data-f="pad:Front Brake Pads"]', '8'); tap('[data-do="saveLog"]');
            const measured = records().find(s => s.type === 'Front Brake Pads') || {};
            this.eq('[new] a thickness typed there is kept as a check of those pads, and the other axle is left alone',
                [measured.checkOnly, measured.padThickness, records().some(s => s.type === 'Rear Brake Pads')], [true, '8', false]);
            tap('[data-do="job"][data-arg="Front Brake Pads"]');
            this.ok('[new] the pads\' own sheet shows the measurement and the limit', /8 mm on/.test(text(sheet())) && /Replace at 3 mm/.test(text(sheet())), text(sheet()));
            tap('[data-do="measure"]');
            this.eq('[new] "Add a measurement" opens the form as a check, not a replacement',
                [$('[data-arg="checkOnly"]').getAttribute('aria-checked'), [...D.querySelectorAll('.pick')].length], ['true', 0]);
            tap('[data-close="sheet"]');

            // a reading typed too high: raised, found, deleted, put back
            tap('[data-go="home"]'); tap('[data-do="odo"]');
            type('[data-f="km"]', '190000'); type('[data-f="date"]', this.localDay(40)); tap('[data-do="saveOdo"]');
            this.ok('[new] a reading that cannot be right is raised on Home', car().mileage === '190000' && !!$('.nudge[data-do="checks"]'), text(page()).slice(-160));
            tap('.nudge[data-do="checks"]');
            this.ok('[new] and named as the one that is probably wrong', /190,000 km/.test(text(sheet())) && /probably the wrong one/.test(text(sheet())), text(sheet()));
            this.eq('[new] no overflow in the readings sheet', wide(D.getElementById('sheet')), []);
            tap('.sheet [data-do="odo"]');
            this.ok('[new] the odometer sheet lists it, marked', /190,000/.test(text($('.readings'))) && !!$('.readings .doubt'), text($('.readings')));
            this.eq('[new] no overflow in the odometer sheet', wide(D.getElementById('sheet')), []);
            const drop = () => [...D.querySelectorAll('[data-do="dropOdo"]')].find(b => /190,000/.test(b.closest('.fact').textContent));
            drop().click();
            this.ok('[new] deleting a reading asks for a second tap', car().mileage === '190000' && /again/.test(drop().textContent));
            drop().click();
            this.eq('[new] the second tap deletes it, and the car goes back to its real reading',
                [car().mileage, S().getOdometerLogs('test-car').some(o => o.km === 190000)], ['100000', false]);
            tap('#toast button');
            this.ok('[new] Undo puts the reading back', S().getOdometerLogs('test-car').some(o => o.km === 190000) && !!drop());
            drop().click(); drop().click(); tap('[data-close="sheet"]');
            this.ok('[new] with the wrong reading gone, nothing is raised', !$('.nudge[data-do="checks"]'));

            // two readings that contradict each other: either could be the wrong one
            W.eval(`Storage.addService({ carId: 'test-car', type: 'Coolant Flush', date: '${this.localDay(20)}', mileage: '95000', cost: '' }); Next.render();`);
            tap('.nudge[data-do="checks"]');
            this.eq('[new] a contradicting pair is shown as two, with no guess at which', sheet().querySelectorAll('.row').length, 2);
            [...sheet().querySelectorAll('.row')].find(r => /coolant/.test(r.textContent)).click();
            this.ok('[new] the record opens with what the other readings put that day at', /about 97,800 km/.test(text($('#km-note'))), text($('#km-note')));
            type('[data-f="km"]', '97800'); tap('[data-do="saveEdit"]'); tap('[data-close="sheet"]');
            this.eq('[new] correcting it settles the readings', S().getReadingConflicts('test-car').length, 0);

            // finding a record
            tap('[data-go="history"]');
            type('[data-q]', 'coolant');
            this.eq('[new] searching History narrows it to what matches', rows().map(r => r.querySelector('strong').textContent), ['Coolant']);
            type('[data-q]', '97,800');
            this.eq('[new] a reading finds its visit', rows().length, 1);
            type('[data-q]', 'فلتر');
            this.ok('[new] an Arabic word finds the job while the app is in English', rows().length >= 1 && rows().every(r => /filter/i.test(r.textContent)), rows().map(r => r.textContent).join(' | '));
            type('[data-q]', 'zzzz');
            this.ok('[new] and it says when nothing matches', /Nothing matches/.test(text($('#hist-list'))) && $('[data-q]').value === 'zzzz');
            type('[data-q]', '');
            this.eq('[new] no overflow in History with the search box', wide(D.body), []);

            // fuel, tyres, the car, the calendar, deleted records
            tap('[data-go="car"]'); tap('[data-do="fuel"]'); tap('[data-arg="mode=consumption"]'); tap('[data-do="saveFuel"]');
            this.ok('[new] a fuel estimate with no figures is refused', !!$('.warn') && !store.getItem('autocare_fuel'));
            type('[data-f="lp100"]', '11');
            this.ok('[new] the fuel sheet says what the figures come to in a year', /SAR a year, 11\.0 L\/100 km/.test(text($('#fuel-says'))), text($('#fuel-says')));
            this.eq('[new] no overflow in the fuel sheet', wide(D.getElementById('sheet')), []);
            tap('[data-do="saveFuel"]');
            this.eq('[new] the fuel setting is saved where backups carry it', [JSON.parse(store.getItem('autocare_fuel')).mode, JSON.parse(store.getItem('autocare_fuel')).lp100], ['consumption', '11']);
            this.ok('[new] and running cost then names both parts', /maintenance [\d.]+, fuel about [\d.]+/.test(text(page())), text($('[aria-label="Costs"]')));

            tap('[data-do="tyre"]'); type('[data-f="dot"]', '9924'); tap('[data-do="saveTyre"]');
            this.ok('[new] a date code that cannot be one is refused', !!$('.warn') && !(car().tires || {}).manufactureDate);
            type('[data-f="dot"]', '0124'); type('[data-f="brand"]', 'Roadgrip'); tap('[data-do="saveTyre"]');
            this.eq('[new] a DOT code becomes the month the tyres were made', [car().tires.manufactureDate, car().tires.brand], ['2024-01', 'Roadgrip']);
            this.ok('[new] and the Car screen then shows their age', /Jan 2024/.test(text($('[aria-label="Tyres"]'))) && /years old/.test(text($('[aria-label="Tyres"]'))), text($('[aria-label="Tyres"]')));

            tap('[data-do="carEdit"]'); type('[data-f="plate"]', 'ABC 123'); tap('[data-do="saveCar"]');
            this.eq('[new] car details are saved', car().plate, 'ABC 123');
            tap('[data-do="carEdit"]'); type('[data-f="make"]', ''); tap('[data-do="saveCar"]');
            this.ok('[new] a car with no make is refused', !!$('.warn') && car().make === 'Ford');
            tap('[data-close="sheet"]');

            tap('[data-do="calendar"]');
            this.eq('[new] no overflow in the calendar sheet', wide(D.getElementById('sheet')), []);
            tap('[data-do="addCalendar"]');
            await tick(60);
            const cal = W.__cal || {};
            this.eq('[new] Add to Calendar hands the phone a calendar file', [cal.name, cal.mime, /BEGIN:VEVENT/.test(cal.text || '')], ['autocare.ics', 'text/calendar', true]);
            this.ok('[new] with jobs named the way the app names them', /SUMMARY:Oil change due \(Ford Taurus\)/.test(cal.text || ''), (cal.text || '').slice(0, 300));

            const gone = records().find(s => s.type === 'Coolant Flush');
            W.eval(`Storage.deleteService('${gone.id}'); Next.render();`);
            tap('[data-do="trash"]');
            this.ok('[new] a deleted record is listed for thirty days', /Coolant/.test(text(sheet())), text(sheet()));
            tap('[data-do="restore"]');
            this.ok('[new] and can be restored from there', records().some(s => s.id === gone.id));
            tap('[data-close="sheet"]');
            this.eq('[new] no overflow on Car with everything set', wide(D.body), []);

            // a phone with no car yet
            store.setItem('autocare_data', JSON.stringify({ cars: [], services: [], reminders: [], fuelLogs: [], odometerLogs: [], trash: [] }));
            await open('en');
            tap('[data-do="carEdit"]');
            type('[data-f="make"]', 'Kia'); type('[data-f="model"]', 'Rio'); type('[data-f="km"]', '5000'); tap('[data-do="saveCar"]');
            this.eq('[new] a first car is added here, with its first reading', [S().getCars().length, car().make, car().mileage, !!$('.odo')], [1, 'Kia', '5000', true]);
            store.removeItem('autocare_fuel');

            // ── History: the same records as a logbook, one row per trip to the workshop ──
            // Two jobs on one day, a check where nothing was replaced, and an accident
            // repair paid by insurance whose two bills share one photographed invoice.
            this.seed(window);
            const data = JSON.parse(store.getItem('autocare_data'));
            data.services.push(
                { id: 'h-brk', carId: 'test-car', type: 'Brake Inspection', date: this.localDay(30), mileage: '96700', cost: '' },
                { id: 'h-pad', carId: 'test-car', type: 'Front Brake Pads', date: this.localDay(60), mileage: '94000', cost: '', checkOnly: true, padThickness: '8' },
                { id: 'h-acc', carId: 'test-car', type: 'Suspension', date: this.localDay(20), cost: '', accident: true, insurancePaid: true,
                    notes: 'Front struts, both sides',
                    bills: [{ id: 'b1', kind: 'Parts', label: 'Struts', vendor: 'Shop', amount: '900', photoIds: ['ph-x'] },
                        { id: 'b2', kind: 'Labour', label: 'Fitting', amount: '100.25', photoIds: ['ph-x'] }] });
            store.setItem('autocare_data', JSON.stringify(data));

            await open('en', 'history');
            this.eq('[new] History has one row for each day of work', rows().length, 4);
            this.ok('[new] jobs done on the same day are one visit', /Oil change and brake check/.test(rowFor(30).textContent), rowFor(30).textContent);
            this.eq('[new] the year totals are what the owner paid', yearTotals(), 320);
            const acc = rowFor(20);
            this.ok('[new] insurance money is shown, not counted',
                /insurance paid 1,000 SAR/.test(acc.textContent) && !acc.querySelector('.cost'), acc.textContent);
            this.ok('[new] a photo on two bills is one receipt', /1 receipt(?!s)/.test(acc.textContent), acc.textContent);
            this.ok('[new] a check says nothing was replaced', /checked only/.test(rowFor(60).textContent), rowFor(60).textContent);

            tap('.chip[data-filter="Oil Change"]');
            this.eq('[new] picking a job narrows the list to it', rows().map(r => r.querySelector('strong').textContent), ['Oil change']);
            this.eq('[new] and totals that job alone', yearTotals(), 200);
            tap('.chip[data-filter=""]');
            this.eq('[new] All brings every visit back', rows().length, 4);

            rowFor(30).click();
            this.eq('[new] a visit opens with every job in it', sheet() ? sheet().querySelectorAll('.job').length : 0, 2);
            this.eq('[new] no overflow in an open visit', wide(D.getElementById('sheet')), []);
            D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape' }));
            this.ok('[new] Escape closes it', !sheet());
            rowFor(20).click();
            const sums = sheet().querySelector('.sums').textContent.replace(/\s+/g, ' ');
            this.ok('[new] an insured repair shows who paid what',
                /Insurance paid\s*1,000\.25 SAR/.test(sums) && /You paid\s*0 SAR/.test(sums), sums);
            this.eq('[new] and shows its receipt once', sheet().querySelectorAll('.thumb').length, 1);
            tap('[data-close="sheet"]');
            this.eq('[new] no overflow in History', wide(D.body), []);
            this.ok('[new] the chips scroll inside their row, not the page',
                D.documentElement.scrollWidth <= W.innerWidth + 1 && $('.chips').scrollWidth > 0,
                D.documentElement.scrollWidth + ' > ' + W.innerWidth);

            // ── Arabic: every screen and every sheet ──
            await open('ar', 'history');
            this.ok('[new] Arabic counts take the right form of the noun',
                /4 زيارات/.test($('.lede').textContent) && /فاتورة واحدة/.test(rowFor(20).textContent),
                $('.lede').textContent + ' / ' + rowFor(20).textContent);
            this.eq('[new] and so do days and months', [1, 2, 5, 13, 100].map(n => W.eval(`Next.span(${n * 30})`)).concat([2, 5, 13].map(n => W.eval(`Next.span(${n})`))),
                ['نحو 30 يوماً', 'نحو 60 يوماً', 'نحو 5 أشهر', 'نحو 13 شهراً', 'نحو 100 شهر', 'نحو يومين', 'نحو 5 أيام', 'نحو 13 يوماً']);
            const arabic = where => {
                this.eq(`[new] ${where}: nothing left in English`, english(), []);
                this.eq(`[new] ${where}: no overflow in Arabic`, wide(D.body), []);
            };
            rowFor(20).click(); arabic('a visit');
            tap('[data-do="edit"]'); arabic('editing a record');
            tap('[data-close="sheet"]');
            this.ok('[new] the page does not scroll sideways in Arabic', D.documentElement.scrollWidth <= W.innerWidth + 1,
                D.documentElement.scrollWidth + ' > ' + W.innerWidth);
            tap('[data-go="home"]');
            this.eq('[new] Arabic mirrors the page', D.documentElement.getAttribute('dir'), 'rtl');
            arabic('Home');
            tap('[data-do="odo"]'); tap('[data-do="saveOdo"]'); arabic('the odometer sheet'); tap('[data-close="sheet"]');
            tap('.plus'); arabic('logging, step 1');
            ['Oil Change', 'Front Brake Pads', 'Periodic Inspection'].forEach(ty => tap(`.pick[data-arg="${ty}"]`));
            tap('[data-do="logNext"]'); tap('[data-arg="accident"]'); arabic('logging, step 2');
            tap('[data-do="logNext"]'); arabic('logging, step 3');
            tap('[data-close="sheet"]');
            tap('[data-go="car"]'); arabic('Car');
            // an empty distance is refused, so the sheet stays open with its warning showing
            tap('[data-do="job"][data-arg="Air Filter"]'); tap('[data-do="every"]'); type('[data-f="ikm"]', ''); tap('[data-do="saveEvery"]');
            this.ok('[new] an interval with no distance is refused', !!$('.warn'));
            arabic('a schedule sheet');
            tap('[data-close="sheet"]');
            tap('[data-do="doc"][data-arg="fahesExpiry"]'); arabic('a document sheet');
            tap('[data-close="sheet"]');
            tap('[data-do="job"][data-arg="Front Brake Pads"]'); arabic('measured pads'); tap('[data-close="sheet"]');
            tap('[data-do="fuel"]'); tap('[data-arg="mode=monthly"]'); type('[data-f="monthly"]', '900'); arabic('the fuel sheet'); tap('[data-close="sheet"]');
            tap('[data-do="tyre"]'); type('[data-f="dot"]', '9924'); tap('[data-do="saveTyre"]'); arabic('the tyre sheet'); tap('[data-close="sheet"]');
            tap('[data-do="carEdit"]'); arabic('car details'); tap('[data-close="sheet"]');
            tap('[data-do="calendar"]'); arabic('the calendar sheet'); tap('[data-close="sheet"]');
            W.eval(`Storage.logOdometer('test-car', 190000, '${this.localDay(40)}'); Storage.deleteService('h-brk'); Next.render();`);
            arabic('Car, with readings to check and a deleted record');
            tap('[data-do="checks"]'); arabic('readings to check'); tap('.sheet [data-do="odo"]'); arabic('the readings list'); tap('[data-close="sheet"]');
            tap('[data-do="trash"]'); arabic('deleted records'); tap('[data-close="sheet"]');
            tap('[data-go="history"]'); type('[data-q]', 'zzzz'); arabic('a search with no result');
        } catch (e) {
            this.failures.push({ name: 'the new design checks threw', detail: e.message + '\n' + (e.stack || '').split('\n')[1] });
        }
        store.setItem('autocare_lang', 'en');
        await this._load(iframe, 'classic.html');
    },

    // Everything here was found by running the owner's real backup through the app
    // with the clock moved forward, then driving the same screens he drives. Each
    // block is one failure he would actually have hit, so each runs on its own:
    // one throwing must not hide the rest.
    async regressions(A) {
        const { Storage, Recommendations, Features, App, I18N, W, D } = A;
        const day = n => this.localDay(n);
        const tick = ms => new Promise(r => setTimeout(r, ms));
        const tapSave = () => D.getElementById('modal-save').click();
        const custom = (type, km, months) => Recommendations.saveCustom('test-car', type, km, months || 6, 'test');
        const firstCar = () => Storage.getCars()[0];
        const T = async (name, fn) => {
            try { await fn(); }
            catch (e) { this.failures.push({ name: name + ' (threw)', detail: e.message }); }
            try { App.closeModal(); } catch (e) {}
            const clear = D.getElementById('photo-viewer'); if (clear) clear.remove();
            W.Date = realDate;
            this.seed(W);
        };
        const realDate = W.Date;
        // Freeze the app's clock. The app reads the global Date at call time.
        const freeze = iso => {
            const fixed = new realDate(iso).getTime();
            W.Date = class extends realDate {
                constructor(...a) { if (a.length) super(...a); else super(fixed); }
                static now() { return fixed; }
            };
        };
        const backupFile = over => new W.File([JSON.stringify({
            formatVersion: 2, cars: firstCar() ? Storage.getCars() : [], services: Storage.getServices('all'),
            reminders: Storage.getReminders('all'), fuelLogs: [], odometerLogs: Storage.getOdometerLogs('all'),
            trash: [], snoozes: [], customRecs: {}, photos: {},
            settings: { climate: 'normal', mechanics: [], theme: 'light', lang: 'en', fuel: { mode: 'off', lp100: '', price: '2.33', monthly: '' } },
            ...over
        })], 'backup.json');

        // -- importing --
        await T('import from Settings', async () => {
            Features.saveFuelSettings({ mode: 'off', lp100: '' });
            Features.showSettingsModal();
            await tick(40);
            const fuel = { mode: 'consumption', lp100: '11.6', price: '2.33', monthly: '' };
            await Features.importData(backupFile({ settings: { climate: 'normal', mechanics: [], theme: 'light', lang: 'en', fuel } }));
            this.ok('an import asks before it changes anything', !!D.getElementById('imp-replace') && !!D.getElementById('imp-merge'));
            this.eq('and nothing has changed yet', Features.getFuelSettings().mode, 'off');
            await Features._applyImport('replace');
            this.eq('importing closes Settings, so its stale form cannot be saved back over the import',
                D.getElementById('modal').style.display, 'none');
            this.eq('the imported fuel setting survives', Features.getFuelSettings().lp100, '11.6');
        });
        await T('cancelling an import', async () => {
            const before = Storage.getServices('all').length;
            await Features.importData(backupFile({ services: [] }));
            D.getElementById('modal-cancel').click();
            this.eq('Cancel really means cancel', Storage.getServices('all').length, before);
            this.eq('and it leaves nothing pending', Features._pendingImport, null);
        });
        await T('merging an import', async () => {
            custom('Oil Change', 7000);
            W.localStorage.setItem('autocare_climate', 'severe');
            await Features.importData(backupFile({
                customRecs: { 'test-car': { 'Oil Change': { km: 5000, months: 6, note: 'x' }, Battery: { km: 60000, months: 36, note: 'x' } } }
            }));
            await Features._applyImport('merge');
            this.eq('adding from a file keeps the interval this phone already has',
                Recommendations.getEffective(firstCar(), 'Oil Change').km, 7000);
            this.eq('and fills in the ones it lacks', Recommendations.getEffective(firstCar(), 'Battery').km, 60000);
            this.eq('and leaves this phone\'s settings alone', W.localStorage.getItem('autocare_climate'), 'severe');
        });
        await T('importing an older file', async () => {
            await Features.importData(backupFile({ services: Storage.getServices('all').filter(s => s.id === 's-air') }));
            this.ok('replacing newer records with an older file says so', !!D.querySelector('#modal .imp-warn'));
        });

        // -- language --
        await T('changing language from Settings', async () => {
            App.navigate('services');
            Features.showSettingsModal();
            await tick(40);
            D.getElementById('f-lang').value = 'ar';
            tapSave();
            this.ok('the page title follows', /[؀-ۿ]/.test(D.getElementById('page-title').textContent), D.getElementById('page-title').textContent);
            this.ok('the add button follows', /[؀-ۿ]/.test(D.getElementById('add-btn').textContent), D.getElementById('add-btn').textContent);
            this.eq('the language switch shows the right side', D.querySelector('.lang-btn.active').dataset.lang, 'ar');
            I18N.set('en'); I18N.translateDOM(); App.navigate('dashboard');
        });

        // -- dates --
        await T('just after midnight', async () => {
            // 22:30 UTC is 01:30 the next day in Saudi Arabia
            freeze('2026-11-05T22:30:00Z');
            const now = new W.Date();
            const local = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            App.openServiceModal(null, 'test-car', 'Oil Change');
            this.eq('a form opens on the local date', D.getElementById('f-date').value, local);
            this.eq('and allows it', D.getElementById('f-date').max, local);
            App.closeModal();
            this.ok('a reading dated today is accepted', !!Storage.logOdometer('test-car', 101000, local));
        });
        await T('last month', async () => {
            freeze('2026-11-05T12:00:00');
            const all = Storage.getAll();
            all.services = [
                { id: 'a', carId: 'test-car', type: 'Oil Change', date: '2026-10-10', cost: '500', mileage: '' },
                { id: 'b', carId: 'test-car', type: 'Oil Change', date: '2026-09-10', cost: '100', mileage: '' }
            ];
            Storage.save(all);
            this.eq('"vs last month" compares against last month', Storage.getSpendTrend('all').previous, 500);
        });
        await T('due today', async () => {
            freeze(day(0) + 'T12:00:00');
            const r = { id: 'r1', carId: 'test-car', type: 'Other', dueDate: day(0), dueMileage: '', completed: false };
            const st = Storage.getReminderStatus(r, firstCar());
            this.ok('something due today is not overdue yet', st.status !== 'overdue', st.status);
            this.eq('and says so', st.detail, 'Due today');
        });

        // -- new tyres --
        await T('fitting new tyres', async () => {
            const add = s => Storage.addService({ carId: 'test-car', cost: '', ...s });
            add({ type: 'Tire Rotation', date: day(170), mileage: '' });
            this.ok('rotation is coming due on the old set',
                Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation').status !== 'ok');
            add({ type: 'Tires', date: day(20), mileage: '98000', checkOnly: true });
            this.ok('checking the tyres does not restart rotation',
                Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation').lastServiced === day(170));
            add({ type: 'Tires', date: day(20), mileage: '98000' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation');
            this.eq('a new set restarts the rotation clock', st.status, 'ok');
            this.eq('counted from the fitting', st.nextKm, 98000 + st.rec.km);
        });

        await T('the limit that arrives first', async () => {
            custom('Oil Change', 7000);
            freeze(new realDate(realDate.now() + 40 * 86400000).toISOString());
            Storage.addService({ carId: 'test-car', type: 'Oil Change', date: Checks.localDay(-40), mileage: '104400', cost: '200' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Oil Change');
            this.eq('just after a service it names the limit that comes first', st.binding, 'km');
            this.ok('in km, not the six-month limit', st.detail.includes('km left'), st.detail);
        });
        await T('a job with no km on record', async () => {
            // the nearest readings are 150 and 170 days from this day: too far to say
            Storage.addService({ carId: 'test-car', type: 'Tire Rotation', date: day(200), mileage: '', cost: '' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation');
            this.eq('with no reading near its day there is no distance to count down', [st.hasKm, st.kmDaysRemaining], [false, null]);
            this.eq('so it runs on the calendar', st.binding, 'time');
            this.eq('and its due date is the calendar date', st.dueDate, st.nextDate);
        });
        await T('a job with no km, between two readings', async () => {
            // 96,700 thirty days ago and 100,000 today: ten days ago was about 98,900
            Storage.addService({ carId: 'test-car', type: 'Tire Rotation', date: day(10), mileage: '', cost: '' });
            let st = Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation');
            this.near('its odometer is worked out from the readings either side', st.nextKm - st.rec.km, 98900, 5);
            this.eq('and passed on as an estimate', [st.hasKm, st.kmEstimated], [true, true]);
            this.eq('nothing is written into the record', Storage.getServices('test-car').find(s => s.type === 'Tire Rotation').mileage, '');
            this.eq('nor counted as a reading', Storage.getOdometerReadings('test-car').some(r => r.date === day(10)), false);
            Storage.logOdometer('test-car', 98000, day(10));
            st = Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation');
            this.eq('a reading taken that day is used as it is', [st.nextKm - st.rec.km, st.kmEstimated], [98000, false]);
            this.eq('before the first reading there is nothing to say', Storage.kmOn('test-car', day(400)), null);
        });

        // -- brake pads, by measurement --
        await T('pads measured since they were fitted', async () => {
            const pads = (date, over) => Storage.addService({ carId: 'test-car', type: 'Front Brake Pads', date, mileage: '', cost: '', ...over });
            pads(day(300), { mileage: '70000' });
            let st = Recommendations.getMaintenanceStatus(firstCar(), 'Front Brake Pads');
            this.eq('with no measurement the interval decides', [!!st.measured, st.nextKm], [false, 70000 + st.rec.km]);
            // 12 mm new at 70,000; 9 mm at 96,700: 3 mm in 26,700 km, so 6 mm more is 53,400 km
            pads(day(30), { mileage: '96700', checkOnly: true, padThickness: '9' });
            st = Recommendations.getMaintenanceStatus(firstCar(), 'Front Brake Pads');
            this.eq('a measurement takes over from the interval', [st.measured.basis, st.measured.assumedNew, st.nextKm], ['km', true, 96700 + 53400]);
            this.eq('and the distance is passed on as an estimate', [st.status, st.kmEstimated], ['ok', true]);
            // a second measurement of the same set is a real wear rate: 1 mm in 3,300 km
            pads(day(0), { mileage: '100000', checkOnly: true, padThickness: '8' });
            this.eq('one measurement a month later is too close to trust on its own',
                Recommendations.getMaintenanceStatus(firstCar(), 'Front Brake Pads').measured.assumedNew, true);
        });
        await T('pads at the limit', async () => {
            const pads = over => Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', cost: '', mileage: '', ...over });
            pads({ date: day(300) });
            pads({ date: day(20), checkOnly: true, padThickness: '4' });
            let st = Recommendations.getMaintenanceStatus(firstCar(), 'Rear Brake Pads');
            this.eq('low pads are due soon whatever the dates say', [st.status, st.measured.basis], ['soon', 'days']);
            pads({ date: day(5), checkOnly: true, padThickness: '3' });
            st = Recommendations.getMaintenanceStatus(firstCar(), 'Rear Brake Pads');
            this.eq('pads at 3 mm are due now', st.status, 'overdue');
            pads({ date: day(1), padThickness: '' });
            st = Recommendations.getMaintenanceStatus(firstCar(), 'Rear Brake Pads');
            this.eq('a new set starts again without the old measurement', [st.status, !!st.measured], ['ok', false]);
        });
        await T('a worked-out pad date that has passed', async () => {
            const pads = over => Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', cost: '', mileage: '', ...over });
            // 12 mm to 6 mm in 200 days; the last 3 mm were due about 60 days ago
            pads({ date: day(360) });
            pads({ date: day(160), checkOnly: true, padThickness: '6' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Rear Brake Pads');
            this.eq('asks for a new measurement rather than calling the pads finished', [st.status, st.measured.stale], ['soon', true]);
        });
        await T('a pad measurement more than a year old', async () => {
            const pads = over => Storage.addService({ carId: 'test-car', type: 'Rear Brake Pads', cost: '', mileage: '', ...over });
            // 12 mm to 11 mm in 300 days: years of life left on paper
            pads({ date: day(700) });
            pads({ date: day(400), checkOnly: true, padThickness: '11' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Rear Brake Pads');
            this.eq('is not trusted to run on: it asks to be measured again', [st.status, st.measured.stale, st.daysRemaining > 365], ['soon', true, true]);
        });

        // -- readings that cannot all be true --
        await T('an odometer that goes backwards', async () => {
            const names = () => Storage.getReadingConflicts('test-car').map(c => [c.high.km, c.lower.map(l => l.km)]);
            this.eq('the fixture has none', names(), []);
            Storage.addService({ carId: 'test-car', type: 'Coolant Flush', date: day(20), mileage: '95000', cost: '' });
            this.eq('a later, lower reading is named with the one it contradicts', names(), [[96700, [95000]]]);
            Storage.logOdometer('test-car', 96650, day(25));
            this.eq('a few km the wrong way round is not raised', names(), [[96700, [95000]]]);
        });
        await T('one reading typed too high', async () => {
            Storage.logOdometer('test-car', 190000, day(40));
            const c = Storage.getReadingConflicts('test-car');
            this.eq('is named once, not once for every reading after it', [c.length, c[0].high.km, c[0].lower.length], [1, 190000, 2]);
            this.eq('and it has become the car\'s mileage', firstCar().mileage, '190000');
            Storage.deleteOdometerLog(Storage.getOdometerLogs('test-car').find(o => o.km === 190000).id);
            this.eq('deleting it puts the car back on its real reading', [firstCar().mileage, firstCar().mileageDate], ['100000', day(0)]);
            this.eq('and the readings agree again', Storage.getReadingConflicts('test-car').length, 0);
        });
        await T('a record saved with the wrong reading', async () => {
            const s = Storage.addService({ carId: 'test-car', type: 'Battery', date: day(0), mileage: '1000500', cost: '' });
            this.eq('a mistyped reading on a record becomes the car\'s mileage', firstCar().mileage, '1000500');
            Storage.updateService(s.id, { mileage: '100050' });
            this.eq('correcting the record corrects the car', firstCar().mileage, '100050');
            Storage.deleteService(s.id);
            this.eq('and deleting the record lets go of its reading', firstCar().mileage, '100000');
        });

        // -- the phone's calendar --
        await T('the calendar file', async () => {
            Storage.updateCar('test-car', { insuranceExpiry: day(-200), registrationExpiry: day(5) });
            const events = Features.calendarEvents(firstCar());
            this.eq('a document that is still valid is in it, an expired one is not',
                [events.some(e => /insuranceExpiry/.test(e.uid)), events.some(e => /registrationExpiry/.test(e.uid))], [true, false]);
            this.ok('so is the oil change, on the day the schedule gives',
                events.some(e => /Oil-Change/.test(e.uid) && e.date === Recommendations.getMaintenanceStatus(firstCar(), 'Oil Change').dueDate));
            this.ok('an overdue job is left to the app', !events.some(e => /Air-Filter/.test(e.uid)));
            const ics = Features.buildCalendar(firstCar());
            const lines = ics.split('\r\n');
            this.eq('it opens and closes as a calendar', [lines[0], lines[lines.length - 2]], ['BEGIN:VCALENDAR', 'END:VCALENDAR']);
            this.eq('every entry is closed', ics.split('BEGIN:VEVENT').length, ics.split('END:VEVENT').length);
            this.ok('a document alerts a month before, a week before and on the day',
                /insuranceExpiry[\s\S]*?TRIGGER:-P29DT15H[\s\S]*?TRIGGER:-P6DT15H[\s\S]*?TRIGGER:PT9H/.test(ics));
            I18N.set('ar');
            const bytes = l => new W.TextEncoder().encode(l).length;
            this.eq('no line is longer than a calendar allows, in Arabic too',
                Features.buildCalendar(firstCar()).split('\r\n').filter(l => bytes(l) > 75), []);
            this.ok('and the entries are in Arabic', /SUMMARY:[^\r]*[\u0600-\u06FF]/.test(Features.buildCalendar(firstCar())));
            I18N.set('en');
            const uid = () => Features.buildCalendar(firstCar()).match(/UID:[^\r]*Oil-Change[^\r]*/)[0];
            const first = uid();
            Storage.addService({ carId: 'test-car', type: 'Oil Change', date: day(0), mileage: '100000', cost: '' });
            this.eq('an entry keeps its identity when its date moves, so adding the file again updates it', uid(), first);
        });

        // -- warranties and receipts from the new log form --
        await T('a visit logged with a warranty', async () => {
            Features.logVisit({ carId: 'test-car', date: day(0), mileage: '100000', notes: '', shop: '', photoIds: [],
                jobs: [{ type: 'Battery', cost: '300', warrantyMonths: '12', warrantyKm: '' }, { type: 'Air Filter', cost: '90' }] });
            const battery = Storage.getServices('test-car').find(s => s.type === 'Battery');
            this.eq('the warranty is kept on a bill of that job', (battery.bills || []).map(b => [b.amount, b.warrantyMonths, b.startKm]), [['300', '12', '100000']]);
            this.eq('and shows as a live warranty', Storage.getActiveWarranties('test-car').map(w => w.bill.serviceType), ['Battery']);
            this.eq('a job without one gets no bill', (Storage.getServices('test-car').filter(s => s.type === 'Air Filter').pop().bills || []).length, 0);
        });
        await T('a receipt added since the last backup', async () => {
            Storage.markBackedUp();
            this.eq('nothing to back up straight after a backup', Storage.getBackupStatus().needed, false);
            await tick(15);
            Features.logVisit({ carId: 'test-car', date: day(0), mileage: '100000', notes: '', shop: '', photoIds: ['ph-new'], jobs: [{ type: 'Battery', cost: '300' }] });
            const b = Storage.getBackupStatus();
            this.eq('is a reason to back up now, not in thirty days', [b.needed, b.newReceipt], [true, true]);
            await tick(15);
            Storage.markBackedUp();
            this.eq('and backing up answers it', Storage.getBackupStatus().needed, false);
        });
        await T('a job logged without a reading', async () => {
            Features.logVisit({ carId: 'test-car', date: day(0), mileage: '', notes: '', shop: '', photoIds: [], jobs: [{ type: 'Battery', cost: '' }, { type: 'Oil Change', cost: '' }] });
            const auto = type => Storage.getReminders('test-car').filter(r => r.type === type && r.autoCreated && !r.completed);
            this.eq('still gets its reminder', [auto('Battery').length, auto('Oil Change').length], [1, 1]);
            this.eq('with no invented distance', auto('Battery')[0].dueMileage, '');
            this.eq('and leaves the car\'s mileage alone', firstCar().mileage, '100000');
            Recommendations.syncAutoReminders();
            this.eq('the schedule then fills the distance in from the day\'s reading', auto('Battery')[0].dueMileage,
                String(100000 + Recommendations.getEffective(firstCar(), 'Battery').km));
        });

        // -- reminders are a view of the schedule --
        await T('a reminder cannot contradict the schedule', async () => {
            custom('Oil Change', 7000);
            App.renderPage('reminders');
            // the owner's real oil reminder: a km estimate frozen as a calendar date
            Storage.addReminder({ carId: 'test-car', type: 'Oil Change', dueDate: day(3), dueMileage: '103700',
                completed: false, autoCreated: true, notes: 'Auto: next oil change at 103,700 km (7,000 km interval)' });
            App.renderPage('reminders');
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Oil Change');
            const r = Storage.getReminders('test-car').find(x => x.type === 'Oil Change');
            this.eq('its date is the schedule\'s time limit', r.dueDate, st.nextDate);
            this.eq('its km is the schedule\'s', r.dueMileage, String(st.nextKm));
            const car = firstCar();
            let clashes = 0;
            [10, 30, 60, 90, 150, 200].forEach(n => {
                freeze(new realDate(realDate.now() + n * 86400000).toISOString());
                Storage.getReminders('test-car').forEach(rem => {
                    const s = Recommendations.getMaintenanceStatus(car, rem.type);
                    if (s && (s.status === 'overdue') !== (Storage.getReminderStatus(rem, car).status === 'overdue')) clashes++;
                });
            });
            W.Date = realDate;
            this.eq('schedule and reminders agree on what is overdue, all the way out', clashes, 0);
        });
        await T('a postponed reminder', async () => {
            Storage.addReminder({ carId: 'test-car', type: 'Oil Change', dueDate: day(-40), dueMileage: '120000',
                completed: false, autoCreated: true, snoozed: true, notes: '' });
            App.renderPage('reminders');
            this.eq('a snoozed reminder keeps the date it was pushed to',
                Storage.getReminders('test-car').find(x => x.type === 'Oil Change').dueDate, day(-40));
        });
        await T('replacing an automatic reminder', async () => {
            Storage.addReminder({ carId: 'test-car', type: 'Battery', dueDate: day(-400), dueMileage: '150000', completed: false, autoCreated: true, notes: '' });
            App.openServiceModal(null, 'test-car', 'Battery');
            await tick(60);
            D.getElementById('f-date').value = day(0);
            tapSave();
            this.eq('the app replacing its own reminder leaves nothing in Recently Deleted',
                Storage.getTrash().filter(t => t.kind === 'reminder').length, 0);
            this.eq('and there is still exactly one', Storage.getReminders('test-car').filter(r => r.type === 'Battery').length, 1);
        });

        // -- editing history must not rewrite the present --
        await T('the oil form', async () => {
            custom('Oil Change', 7000);
            App.openServiceModal(null, 'test-car', 'Oil Change');
            this.eq('a new oil change starts on the interval this car is using',
                D.querySelector('input[name="oil-interval"]:checked').value, '7000');
        });
        await T('editing an old oil record', async () => {
            custom('Oil Change', 7000);
            Storage.addService({ carId: 'test-car', type: 'Oil Change', date: day(200), mileage: '80000', cost: '150' });
            const old = Storage.getServices('test-car').find(s => s.mileage === '80000');
            App.renderPage('reminders');
            const before = Recommendations.getMaintenanceStatus(firstCar(), 'Oil Change').detail;
            App.openServiceModal(old);
            await tick(60);
            tapSave();
            this.eq('saving an old oil record leaves the interval alone',
                Recommendations.getEffective(firstCar(), 'Oil Change').km, 7000);
            this.eq('and the schedule alone', Recommendations.getMaintenanceStatus(firstCar(), 'Oil Change').detail, before);
        });
        await T('editing an old filter record', async () => {
            Storage.addService({ carId: 'test-car', type: 'Air Filter', date: day(20), mileage: '98000', cost: '80' });
            App.renderPage('reminders');
            Recommendations.createReminderFromService(firstCar(), 'Air Filter', '98000', day(20));
            const old = Storage.getServices('test-car').find(s => s.id === 's-air');
            App.openServiceModal(old);
            await tick(60);
            tapSave();
            const r = Storage.getReminders('test-car').find(x => x.type === 'Air Filter' && !x.completed);
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Air Filter');
            this.eq('the reminder still counts from the newest job', r.dueMileage, String(st.nextKm));
        });
        await T('editing an old inspection', async () => {
            Storage.updateCar('test-car', { fahesExpiry: day(-300) });
            Storage.addService({ carId: 'test-car', type: 'Periodic Inspection', date: day(400), mileage: '', cost: '0' });
            const old = Storage.getServices('test-car').find(s => s.type === 'Periodic Inspection');
            App.openServiceModal(old);
            await tick(60);
            tapSave();
            this.eq('saving an old inspection leaves the current certificate alone', firstCar().fahesExpiry, day(-300));
        });
        await T('bills on an edited record', async () => {
            const bills = [
                { id: 'bl_one', kind: 'Parts', label: '18" rims', vendor: 'A', photoIds: [], amount: '100', warrantyMonths: '', warrantyKm: '', startKm: '', date: day(9) },
                { id: 'bl_two', kind: 'Parts', label: 'Two', vendor: 'B', photoIds: [], amount: '50', warrantyMonths: '', warrantyKm: '', startKm: '90000', date: day(8) }
            ];
            Storage.addService({ carId: 'test-car', type: 'Suspension', date: day(7), mileage: '', cost: '150', bills });
            App.openServiceModal(Storage.getServices('test-car').find(s => s.type === 'Suspension'));
            await tick(60);
            tapSave();
            const after = Storage.getServices('test-car').find(s => s.type === 'Suspension').bills;
            this.eq('each bill keeps its own date', after.map(b => b.date), [day(9), day(8)]);
            this.eq('and its own identity', after.map(b => b.id), ['bl_one', 'bl_two']);
            this.eq('and its own starting km', after.map(b => b.startKm), ['', '90000']);
            this.eq('and a quote in its label', after[0].label, '18" rims');
        });
        await T('two jobs with no cost', async () => {
            App.openServiceModal(null, 'test-car', 'Tire Rotation');
            await tick(60);
            D.querySelectorAll('.service-chips input[value="Alignment"]').forEach(b => { b.checked = true; });
            D.getElementById('f-date').value = day(0);
            tapSave();
            this.ok('no cost typed stores no cost', !Storage.getServices('test-car').some(s => String(s.cost) === 'NaN'));
        });

        // -- the car form --
        await T('typing the km on the car form', async () => {
            freeze(new realDate(realDate.now() + 16 * 86400000).toISOString());
            App.openCarModal(firstCar());
            D.getElementById('f-mileage').value = '102000';
            tapSave();
            this.eq('the figure typed is the figure shown', Storage.getEffectiveMileage(firstCar()), 102000);
            this.ok('and it counts as a reading', Storage.getOdometerLogs('test-car').some(o => o.km === 102000));
        });
        await T('free text on forms', async () => {
            Features.openTireModal('test-car');
            D.getElementById('f-tire-brand').value = 'Brand "X" <new>';
            tapSave();
            Features.openTireModal('test-car');
            this.eq('a quote survives reopening the form', D.getElementById('f-tire-brand').value, 'Brand "X" <new>');
        });

        // -- the Taurus table, from the owner's manual pp. 382-383 --
        await T('the Taurus schedule', async () => {
            W.localStorage.removeItem('autocare_custom_recs');
            const rec = type => Recommendations.getEffective(firstCar(), type);
            this.eq('air filter is 30,000 miles', rec('Air Filter').km, 48000);
            this.eq('cabin filter is 20,000 miles', rec('Cabin Air Filter').km, 32000);
            this.eq('coolant is 80,000 km or 3 years', [rec('Coolant Flush').km, rec('Coolant Flush').months], [80000, 36]);
            W.localStorage.setItem('autocare_climate', 'severe');
            this.eq('less 20% for the heat', [rec('Air Filter').km, rec('Cabin Air Filter').km, rec('Coolant Flush').km], [38400, 25600, 64000]);
            custom('Oil Change', 7000, 6);
            this.eq('brakes are checked at every oil change', [rec('Brake Inspection').km, rec('Brake Inspection').months], [7000, 6]);
            Storage.addService({ carId: 'test-car', type: 'Brake Inspection', date: day(5), mileage: '99500', cost: '' });
            this.ok('which adds nothing to the forecast, being part of the oil service',
                !Storage.getCostForecast('all', 6).items.some(i => i.type === 'Brake Inspection'));
            custom('Cabin Air Filter', 20000, 12);
            this.eq('a figure the owner set still wins', rec('Cabin Air Filter').km, 20000);
        });

        // -- forecast --
        await T('the six-month forecast', async () => {
            custom('Oil Change', 7000);
            Storage.addService({ carId: 'test-car', type: 'Air Filter', date: day(10), mileage: '99000', cost: '100' });
            const fc = Storage.getCostForecast('all', 6);
            const of = type => fc.items.find(i => i.type === type);
            // 15,000 km at 110 km/day lands inside six months, while its 12-month date does not
            this.ok('a job due by distance is forecast', !!of('Air Filter'), fc.items.map(i => i.type).join(', '));
            this.ok('and a job done several times is counted several times', of('Oil Change') && of('Oil Change').times >= 2,
                JSON.stringify(of('Oil Change')));
        });

        // -- the dashboard --
        await T('a browser without notifications', async () => {
            const N = W.Notification;
            W.Notification = undefined;
            let threw = null;
            try { App.renderDashboard(); } catch (e) { threw = e.message; }
            W.Notification = N;
            this.eq('the dashboard still draws all the way down', threw, null);
        });
        await T('notifications', async () => {
            const N = W.Notification;
            W.Notification = { permission: 'granted' };
            W.localStorage.removeItem('autocare_notified');
            App.renderPage('reminders');            // the fixture's reminder catches up with the schedule
            const sent = [];
            const real = Features._notify;
            Features._notify = (title, body) => sent.push(body);
            Features.scheduleNotifications();
            Features.scheduleNotifications();
            App.renderDashboard();
            Features._notify = real;
            W.Notification = N;
            W.localStorage.removeItem('autocare_notified');
            this.ok('a due item notifies', sent.length === 1, JSON.stringify(sent));
        });
        await T('the upcoming list', async () => {
            Storage.addReminder({ carId: 'test-car', type: 'Other', dueDate: day(-300), dueMileage: '100300', completed: false, notes: 'x' });
            Storage.addReminder({ carId: 'test-car', type: 'Battery', dueDate: day(-20), dueMileage: '', completed: false, notes: 'y' });
            App.navigate('dashboard');
            const rows = D.getElementById('upcoming-reminders').innerText;
            this.ok('a reminder due by km says so', rows.includes('300 km left'), rows.slice(0, 200));
            this.ok('and sorts by what comes first', rows.indexOf(I18N.t('Other')) < rows.indexOf(I18N.t('Battery')), rows.slice(0, 200));
        });
        await T('the health score', async () => {
            Storage.updateReminder('r-air', { dueDate: day(10) });
            const withRem = Storage.getCarHealthScore(firstCar()).score;
            const all = Storage.getAll();
            all.reminders = [];
            Storage.save(all);
            this.eq('one overdue job is not counted twice', withRem, Storage.getCarHealthScore(firstCar()).score);
        });
        await T('the expense pie', async () => {
            Storage.addService({ carId: 'test-car', type: 'Brake Inspection', date: day(5), mileage: '', cost: '' });
            App.navigate('dashboard');
            const zero = [...D.querySelectorAll('.pie-val')].filter(e => e.textContent.startsWith('0 SAR'));
            this.eq('nothing free takes a row in the cost breakdown', zero.length, 0);
        });

        await T('the way in to the new design', async () => {
            App.navigate('dashboard');
            const link = D.querySelector('#page-dashboard .next-banner');
            this.eq('the classic screens lead back to the new design', link && link.getAttribute('href'), './');
        });

        // -- speed --
        await T('reading the database', async () => {
            const parse = W.JSON.parse;
            let n = 0;
            W.JSON.parse = function (...a) { n++; return parse.apply(this, a); };
            App.navigate('dashboard');
            App.navigate('dashboard');
            W.JSON.parse = parse;
            this.ok('drawing the dashboard does not re-read everything hundreds of times', n < 60, n + ' parses over 2 renders');
            const copy = Storage.getAll();
            copy.cars[0].make = 'changed';
            this.eq('changing a read copy cannot leak back', firstCar().make, 'Ford');
            const list = Storage.getServices('all');
            list.reverse();
            this.ok('nor can reordering one', Storage.getServices('all')[0].id !== list[0].id || list.length < 2);
            ['dashboard', 'cars', 'services', 'fuel', 'expenses', 'warranty', 'reminders'].forEach(p => App.navigate(p));
            App.openServiceModal(Storage.getServices('all')[0]);
            await tick(60);
            App.closeModal();
            this.eq('drawing every screen writes nothing to the shared copy',
                JSON.stringify(Storage._read().cars) + JSON.stringify(Storage._read().services) + JSON.stringify(Storage._read().reminders),
                JSON.stringify(Storage.getAll().cars) + JSON.stringify(Storage.getAll().services) + JSON.stringify(Storage.getAll().reminders));
            const raw = JSON.parse(W.localStorage.getItem('autocare_data'));
            raw.cars[0].make = 'Direct';
            W.localStorage.setItem('autocare_data', JSON.stringify(raw));
            this.eq('a write from elsewhere is seen straight away', firstCar().make, 'Direct');
        });

        // -- Arabic --
        await T('automatic reminders in Arabic', async () => {
            I18N.set('ar'); I18N.translateDOM();
            App.navigate('reminders');
            const text = D.getElementById('reminders-list').innerText;
            this.ok('an automatic reminder note is translated', !/Auto:|or at/.test(text), text.slice(0, 200));
            I18N.set('en'); I18N.translateDOM();
        });
    },

    _paint(final) {
        if (!this._log) return;
        const f = this.failures, w = this.warnings, p = this.passes;
        const state = final ? (f.length ? 'fail' : 'pass') : 'running';
        this._log.innerHTML = `
            <div class="summary ${state}">
                <strong>${p.length}</strong> passed ·
                <strong>${f.length}</strong> failed ·
                <strong>${w.reduce((n, x) => n + x.items.length, 0)}</strong> warnings
                ${final ? '' : ' · running…'}
            </div>
            ${f.length ? `<h3>Failures</h3><ul class="fails">${f.map(x =>
                `<li><b>${x.name}</b>${x.detail ? `<span>${String(x.detail).replace(/</g, '&lt;')}</span>` : ''}</li>`).join('')}</ul>` : ''}
            ${w.length ? `<h3>Warnings — known gaps, tracked in README</h3>${w.map(x =>
                `<p class="wname">${x.name} (${x.items.length})</p><ul class="warns">${x.items.map(i =>
                    `<li>${String(i).replace(/</g, '&lt;')}</li>`).join('')}</ul>`).join('')}` : ''}
            ${final && !f.length ? '<p class="allgood">Everything the suite knows how to check is passing.</p>' : ''}
            <details><summary>${p.length} passing checks</summary><ul class="passes">${p.map(x => `<li>${x}</li>`).join('')}</ul></details>`;
    }
};
