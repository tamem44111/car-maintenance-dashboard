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
                // 15,000 km interval last done at 62,000 -> due at 77,000, so ~23,000 km overdue
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
        W.localStorage.removeItem('autocare_custom_recs');
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
    async run(iframe, logEl) {
        this.failures = []; this.warnings = []; this.passes = []; this._log = logEl;
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

        try {
            W.alert = () => {}; W.confirm = () => true;
            // const-declared modules are not on window; eval sees the global lexical scope
            W.eval('window.__modules = {Storage, Recommendations, Features, App, I18N, Photos};');
            const A = { ...W.__modules, W, D };

            this.seed(W);
            await this.logic(A);
            this.seed(W);
            await this.render(A);
            this.seed(W);
            await this.regressions(A);
        } catch (e) {
            this.failures.push({ name: 'the run itself threw', detail: e.message + '\n' + (e.stack || '').split('\n')[1] });
        } finally {
            W.alert = realAlert; W.confirm = realConfirm;
            W.localStorage.clear();
            Object.keys(snapshot).forEach(k => W.localStorage.setItem(k, snapshot[k]));
            this._paint(true);
        }
        return { passed: this.passes.length, failed: this.failures.length, warned: this.warnings.length };
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
            Storage.addService({ carId: 'test-car', type: 'Tire Rotation', date: day(10), mileage: '', cost: '' });
            const st = Recommendations.getMaintenanceStatus(firstCar(), 'Tire Rotation');
            this.eq('there is no distance to count down', st.kmDaysRemaining, null);
            this.eq('so it runs on the calendar', st.binding, 'time');
            this.eq('and its due date is the calendar date', st.dueDate, st.nextDate);
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
