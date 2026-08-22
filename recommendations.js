const Recommendations = {
    // Items that apply to essentially any car. Merged under the brand data so a
    // manufacturer-specific interval always wins. These also give an unrecognised
    // make a usable schedule instead of none at all.
    universal: {
        'Cabin Air Filter': { km: 15000, months: 12, note: 'More often in dusty conditions' },
        'AC Service':       { km: 30000, months: 24, note: 'Check refrigerant and cooling performance' },
        'Front Brake Pads': { km: 40000, months: 24, note: 'Front does most of the braking — wears fastest' },
        'Rear Brake Pads':  { km: 70000, months: 36, note: 'Rear wears far slower than front' },
        'Timing Belt':      { km: 100000, months: 84, note: 'Critical — a snapped belt can destroy the engine' },
    },

    // Timing belts only apply to belt-driven engines; a chain is normally lifetime.
    appliesTo(car, type) {
        if (type === 'Timing Belt') return car && car.timingType === 'belt';
        return true;
    },

    database: {
        'ford': {
            '_default': {
                'Oil Change':        { km: 10000, months: 6, note: 'Ford general recommendation' },
                'Air Filter':        { km: 15000, months: 12, note: 'Ford general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Ford general recommendation' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Ford general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Ford general recommendation' },
                'Transmission':      { km: 60000, months: 48, note: 'Ford general recommendation' },
                'Coolant Flush':     { km: 50000, months: 36, note: 'Ford general recommendation' },
                'Battery':           { km: 80000, months: 48, note: 'Ford general recommendation' },
            },
            'taurus': {
                'Oil Change':        { km: 12000, months: 6, note: 'Ford Taurus owner manual' },
                'Air Filter':        { km: 15000, months: 12, note: 'Ford Taurus owner manual' },
                'Spark Plugs':       { km: 48000, months: 48, note: 'Ford Taurus - iridium plugs recommended' },
                'Tire Rotation':     { km: 12000, months: 6, note: 'Ford Taurus owner manual' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Ford Taurus owner manual' },
                'Transmission':      { km: 60000, months: 48, note: 'Ford Taurus owner manual' },
                'Coolant Flush':     { km: 50000, months: 36, note: 'Ford Taurus owner manual' },
                'Battery':           { km: 80000, months: 48, note: 'Ford Taurus owner manual' },
            },
            'explorer': {
                'Oil Change':        { km: 10000, months: 6, note: 'Ford Explorer owner manual' },
                'Air Filter':        { km: 20000, months: 12, note: 'Ford Explorer owner manual' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Ford Explorer owner manual' },
                'Transmission':      { km: 50000, months: 36, note: 'Ford Explorer owner manual' },
            },
        },
        'toyota': {
            '_default': {
                'Oil Change':        { km: 10000, months: 6, note: 'Toyota general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'Toyota general recommendation' },
                'Spark Plugs':       { km: 60000, months: 48, note: 'Toyota general recommendation' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Toyota general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Toyota general recommendation' },
                'Transmission':      { km: 60000, months: 48, note: 'Toyota general recommendation' },
                'Coolant Flush':     { km: 50000, months: 36, note: 'Toyota general recommendation' },
                'Battery':           { km: 80000, months: 48, note: 'Toyota general recommendation' },
            },
            'camry': {
                'Oil Change':        { km: 10000, months: 6, note: 'Toyota Camry owner manual' },
                'Air Filter':        { km: 20000, months: 12, note: 'Toyota Camry owner manual' },
                'Spark Plugs':       { km: 60000, months: 48, note: 'Toyota Camry - iridium plugs' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Toyota Camry owner manual' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Toyota Camry owner manual' },
                'Transmission':      { km: 40000, months: 36, note: 'Toyota Camry owner manual' },
                'Coolant Flush':     { km: 50000, months: 36, note: 'Toyota Camry owner manual' },
            },
            'corolla': {
                'Oil Change':        { km: 10000, months: 6, note: 'Toyota Corolla owner manual' },
                'Air Filter':        { km: 20000, months: 12, note: 'Toyota Corolla owner manual' },
                'Spark Plugs':       { km: 60000, months: 48, note: 'Toyota Corolla owner manual' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Toyota Corolla owner manual' },
            },
        },
        'honda': {
            '_default': {
                'Oil Change':        { km: 8000, months: 6, note: 'Honda general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'Honda general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Honda general recommendation' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Honda general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Honda general recommendation' },
                'Transmission':      { km: 45000, months: 36, note: 'Honda general recommendation' },
                'Coolant Flush':     { km: 50000, months: 36, note: 'Honda general recommendation' },
                'Battery':           { km: 80000, months: 48, note: 'Honda general recommendation' },
            },
        },
        'hyundai': {
            '_default': {
                'Oil Change':        { km: 10000, months: 6, note: 'Hyundai general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'Hyundai general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Hyundai general recommendation' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Hyundai general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Hyundai general recommendation' },
                'Transmission':      { km: 60000, months: 48, note: 'Hyundai general recommendation' },
                'Coolant Flush':     { km: 40000, months: 24, note: 'Hyundai general recommendation' },
            },
        },
        'nissan': {
            '_default': {
                'Oil Change':        { km: 8000, months: 6, note: 'Nissan general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'Nissan general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Nissan general recommendation' },
                'Tire Rotation':     { km: 10000, months: 6, note: 'Nissan general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Nissan general recommendation' },
                'Transmission':      { km: 60000, months: 48, note: 'Nissan general recommendation' },
            },
        },
        'chevrolet': {
            '_default': {
                'Oil Change':        { km: 12000, months: 6, note: 'Chevrolet general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'Chevrolet general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'Chevrolet general recommendation' },
                'Tire Rotation':     { km: 12000, months: 6, note: 'Chevrolet general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'Chevrolet general recommendation' },
                'Transmission':      { km: 70000, months: 60, note: 'Chevrolet general recommendation' },
            },
        },
        'gmc': {
            '_default': {
                'Oil Change':        { km: 12000, months: 6, note: 'GMC general recommendation' },
                'Air Filter':        { km: 20000, months: 12, note: 'GMC general recommendation' },
                'Spark Plugs':       { km: 50000, months: 48, note: 'GMC general recommendation' },
                'Tire Rotation':     { km: 12000, months: 6, note: 'GMC general recommendation' },
                'Brake Inspection':  { km: 20000, months: 12, note: 'GMC general recommendation' },
            },
        },
    },

    getForCar(make, model) {
        const m = (make || '').toLowerCase().trim();
        const md = (model || '').toLowerCase().trim();
        const brand = this.database[m];
        const brandRecs = brand ? (brand[md] || brand['_default'] || {}) : {};
        const merged = { ...this.universal, ...brandRecs };
        return Object.keys(merged).length ? merged : null;
    },

    getForService(make, model, serviceType) {
        const recs = this.getForCar(make, model);
        if (!recs) return null;
        return recs[serviceType] || null;
    },

    getCustom() {
        const raw = localStorage.getItem('autocare_custom_recs');
        return raw ? JSON.parse(raw) : {};
    },

    saveCustom(carId, serviceType, km, months, note) {
        const custom = this.getCustom();
        if (!custom[carId]) custom[carId] = {};
        custom[carId][serviceType] = { km, months, note: note || 'Custom recommendation' };
        localStorage.setItem('autocare_custom_recs', JSON.stringify(custom));
    },

    deleteCustom(carId, serviceType) {
        const custom = this.getCustom();
        if (custom[carId]) {
            delete custom[carId][serviceType];
            localStorage.setItem('autocare_custom_recs', JSON.stringify(custom));
        }
    },

    getEffective(car, serviceType) {
        const custom = this.getCustom();
        let rec = null;
        if (custom[car.id] && custom[car.id][serviceType]) {
            rec = { ...custom[car.id][serviceType], source: 'custom' };
        } else {
            const mfr = this.getForService(car.make, car.model, serviceType);
            if (mfr) rec = { ...mfr, source: 'manufacturer' };
        }
        // Apply climate multiplier (severe heat = 20% shorter intervals)
        if (rec && typeof Features !== 'undefined') {
            const mult = Features.getClimateMultiplier();
            if (mult !== 1.0) {
                rec.km = Math.round(rec.km * mult);
                if (rec.months) rec.months = Math.max(1, Math.round(rec.months * mult));
                if (rec.source === 'manufacturer') rec.note += ' (climate-adjusted)';
            }
        }
        return rec;
    },

    // Types carrying a schedule
    ALL_TYPES: ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Front Brake Pads', 'Rear Brake Pads', 'Air Filter', 'Cabin Air Filter', 'AC Service', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs', 'Timing Belt'],

    // Extra types you can log but that carry no default interval — discs and
    // alignment are done on symptom rather than mileage, and the plain "Brake Pads"
    // entry is kept so records made before the front/rear split still work.
    // Alignment sat in ALL_TYPES for a long time with no interval defined anywhere,
    // so it could never produce a status. This is where it always belonged.
    LOG_ONLY_TYPES: ['Periodic Inspection', 'Front Brake Discs', 'Rear Brake Discs', 'Brake Fluid', 'Brake Pads', 'Suspension', 'Wheel Bearing', 'Alignment'],

    // Kept working for old records, but no longer offered for new ones: a fresh
    // "Brake Pads" entry names no axle, so neither the front nor the rear schedule
    // can see it. Editing an existing one still works.
    LEGACY_TYPES: ['Brake Pads'],

    // Everything selectable when logging a job
    logTypes() { return this.ALL_TYPES.concat(this.LOG_ONLY_TYPES, ['Other']); },

    // How the picker is laid out. Grouping and order are presentation only —
    // the strings are data keys, so regrouping never touches stored history.
    // Every type in logTypes() appears here exactly once, except LEGACY_TYPES.
    GROUPS: [
        ['Routine',               ['Oil Change', 'Tire Rotation', 'Air Filter', 'Cabin Air Filter']],
        ['Brakes',                ['Brake Inspection', 'Front Brake Pads', 'Rear Brake Pads', 'Front Brake Discs', 'Rear Brake Discs', 'Brake Fluid']],
        ['Engine & drivetrain',   ['Transmission', 'Spark Plugs', 'Coolant Flush', 'Timing Belt']],
        ['Steering & suspension', ['Alignment', 'Suspension', 'Wheel Bearing']],
        ['Electrical & climate',  ['Battery', 'AC Service']],
        ['Other',                 ['Periodic Inspection', 'Other']]
    ],

    // What the car currently owes, most urgent first — the pinned row at the top
    // of the picker. Usually one to three items.
    dueTypes(car, limit = 5) {
        if (!car) return [];
        return this.ALL_TYPES
            .map(type => this.getMaintenanceStatus(car, type))
            .filter(st => st && st.status !== 'ok' && st.status !== 'unknown')
            .sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))
            .slice(0, limit);
    },

    isBrakeType(t) { return typeof t === 'string' && /brake/i.test(t); },

    // The periodic technical inspection (Fahes) is date-driven, not mileage-driven,
    // so it carries no km interval — the certificate's own expiry date governs it.
    isInspectionType(t) { return t === 'Periodic Inspection'; },

    // Scheduled items this car has no record for. Not overdue — just unknown.
    unknownTypes(car) {
        if (!car) return [];
        return this.ALL_TYPES.filter(type => {
            const st = this.getMaintenanceStatus(car, type);
            return st && st.status === 'unknown';
        });
    },

    getAllForCar(car) {
        const result = {};
        this.ALL_TYPES.forEach(type => {
            if (!this.appliesTo(car, type)) return;
            const rec = this.getEffective(car, type);
            if (rec) result[type] = rec;
        });
        return result;
    },

    // Full due-status for a service, evaluating BOTH km and time — due on whichever comes first.
    // Returns null if no recommendation exists for this type.
    getMaintenanceStatus(car, type) {
        const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);
        if (!this.appliesTo(car, type)) return null;
        const rec = this.getEffective(car, type);
        if (!rec || !rec.km) return null;

        const currentKm = Storage.getEffectiveMileage(car);
        const services = Storage.getServices(car.id)
            .filter(s => s.type === type)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const last = services[0];
        const months = rec.months || 12;
        const today = new Date();

        // No record is not the same as never done. Most owners start logging partway
        // through a car's life, so the honest answer is "we do not know" — inventing a
        // due date from an assumption would be a confident guess about a real car.
        if (!last) {
            return {
                type, rec, status: 'unknown', binding: null,
                detail: T('No record yet'),
                kmRemaining: null, daysRemaining: null, usedPct: 0,
                nextKm: null, nextDate: null, kmEtaDate: null, kmDaysRemaining: null,
                dueDate: null, dueDays: null, rate: Storage.getDailyKmRate(car.id),
                lastServiced: null
            };
        }

        // ── Distance dimension ──
        const lastKm = last ? (parseInt(last.mileage) || 0) : 0;
        const baseKm = lastKm > 0 ? lastKm : currentKm;          // assume done at current km if never logged
        const nextKm = baseKm + rec.km;
        const kmRemaining = nextKm - currentKm;
        const kmUsedPct = Math.min(100, Math.max(0, ((rec.km - kmRemaining) / rec.km) * 100));

        // ── Time dimension ──
        const baseDate = last ? new Date(last.date) : today;     // assume done today if never logged
        const nextDate = new Date(baseDate);
        nextDate.setMonth(nextDate.getMonth() + months);
        const daysRemaining = Math.ceil((nextDate - today) / 86400000);
        const totalDays = months * 30.44;
        const timeUsedPct = Math.min(100, Math.max(0, ((totalDays - daysRemaining) / totalDays) * 100));

        // ── Whichever comes first (compare raw "fraction of life remaining"; smaller = more urgent) ──
        const usedPct = Math.max(kmUsedPct, timeUsedPct);
        const kmRatio = kmRemaining / rec.km;
        const timeRatio = daysRemaining / totalDays;
        const binding = timeRatio < kmRatio ? 'time' : 'km';

        let status = 'ok';
        if (kmRemaining <= 0 || daysRemaining <= 0) status = 'overdue';
        else if (kmRemaining <= rec.km * 0.15 || daysRemaining <= 30) status = 'soon';

        // ── Predict WHEN the km threshold will be reached, using the car's driving rate.
        // This is what lets a km-based service produce a real calendar due date.
        const rate = Storage.getDailyKmRate(car.id);
        let kmDaysRemaining = null, kmEtaDate = null;
        if (rate && rate > 0) {
            kmDaysRemaining = Math.round(kmRemaining / rate);
            const eta = new Date();
            eta.setDate(eta.getDate() + kmDaysRemaining);
            kmEtaDate = eta.toISOString().split('T')[0];
            // A km threshold the driver will hit within a month counts as due soon
            if (status === 'ok' && kmDaysRemaining <= 30) status = 'soon';
        }

        // Effective due date = the earlier of the time-based date and the km ETA
        let dueDate = nextDate.toISOString().split('T')[0];
        let dueDays = daysRemaining;
        if (kmEtaDate && kmDaysRemaining !== null && kmDaysRemaining < daysRemaining) {
            dueDate = kmEtaDate;
            dueDays = kmDaysRemaining;
        }

        const fmtDays = d => d <= 0 ? T('{d} days overdue', {d: Math.abs(d)})
            : d <= 60 ? T('in {d} days', {d})
            : T('in {m} months', {m: Math.round(d / 30)});

        let detail;
        if (binding === 'time') {
            detail = fmtDays(daysRemaining);
        } else {
            detail = kmRemaining <= 0 ? T('{km} km over', {km: Math.abs(kmRemaining).toLocaleString()})
                : T('{km} km left', {km: kmRemaining.toLocaleString()});
            // add the ETA so a km-based item still reads as a date
            if (kmDaysRemaining !== null && kmRemaining > 0) detail += ' · ~' + fmtDays(kmDaysRemaining).replace('in ', '').replace('خلال ', '');
        }

        return {
            type, rec, status, binding, detail,
            kmRemaining, daysRemaining, usedPct: Math.round(usedPct),
            nextKm, nextDate: nextDate.toISOString().split('T')[0],
            kmEtaDate, kmDaysRemaining, dueDate, dueDays, rate,
            lastServiced: last ? last.date : null
        };
    },

    createReminderFromService(car, serviceType, serviceMileage, serviceDate) {
        if (serviceType === 'Oil Change') return;

        const rec = this.getEffective(car, serviceType);
        if (!rec || !rec.km) return;

        const nextMileage = parseInt(serviceMileage) + rec.km;
        const nextDate = new Date(serviceDate);
        nextDate.setMonth(nextDate.getMonth() + (rec.months || 12));

        const existing = Storage.getReminders(car.id)
            .filter(r => r.type === serviceType && !r.completed && r.autoCreated);
        existing.forEach(r => Storage.deleteReminder(r.id));

        Storage.addReminder({
            carId: car.id,
            type: serviceType,
            dueDate: nextDate.toISOString().split('T')[0],
            dueMileage: nextMileage.toString(),
            notes: `Auto: next ${serviceType} at ${nextMileage.toLocaleString()} km (${rec.note})`,
            completed: false,
            autoCreated: true,
        });
    }
};
