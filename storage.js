const Storage = {
    _key: 'autocare_data',

    _defaults() {
        return { cars: [], services: [], reminders: [], fuelLogs: [], odometerLogs: [], trash: [], snoozes: [] };
    },

    getAll() {
        const raw = localStorage.getItem(this._key);
        if (!raw) return this._defaults();
        const data = JSON.parse(raw);
        if (!data.fuelLogs) data.fuelLogs = [];
        if (!data.odometerLogs) data.odometerLogs = [];
        if (!data.trash) data.trash = [];
        if (!data.snoozes) data.snoozes = [];
        return data;
    },

    save(data) {
        localStorage.setItem(this._key, JSON.stringify(data));
        // Stamp every change so the backup nudge knows there is something new to save
        localStorage.setItem('autocare_lastChange', new Date().toISOString());
    },

    // ── Backup tracking ──
    markBackedUp() { localStorage.setItem('autocare_lastBackup', new Date().toISOString()); },

    getBackupStatus() {
        const lastBackup = localStorage.getItem('autocare_lastBackup');
        const lastChange = localStorage.getItem('autocare_lastChange');
        const days = d => Math.floor((Date.now() - new Date(d)) / 86400000);
        const hasData = this.getCars().length > 0;
        if (!hasData) return { needed: false, never: !lastBackup, lastBackup, daysSinceBackup: null };
        if (!lastBackup) return { needed: true, never: true, lastBackup: null, daysSinceBackup: null, unsavedChanges: true };
        const daysSinceBackup = days(lastBackup);
        const unsavedChanges = lastChange ? new Date(lastChange) > new Date(lastBackup) : false;
        return { needed: unsavedChanges && daysSinceBackup >= 30, never: false, lastBackup, daysSinceBackup, unsavedChanges };
    },

    // ── Trash (30-day undo for deletes) ──
    TRASH_DAYS: 30,

    _toTrash(kind, arrayKey, id, extras) {
        const data = this.getAll();
        const idx = data[arrayKey].findIndex(x => x.id === id);
        if (idx === -1) return;
        const [record] = data[arrayKey].splice(idx, 1);
        data.trash.push({
            id: 'tr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            kind, arrayKey, record,
            extras: extras || null,
            deletedAt: new Date().toISOString()
        });
        this.save(data);
    },

    getTrash() {
        this.purgeTrash();
        return this.getAll().trash.slice().sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    },

    // Drop anything past the retention window
    purgeTrash() {
        const data = this.getAll();
        const cutoff = Date.now() - this.TRASH_DAYS * 86400000;
        const kept = data.trash.filter(t => new Date(t.deletedAt).getTime() >= cutoff);
        if (kept.length !== data.trash.length) { data.trash = kept; this.save(data); }
    },

    restoreFromTrash(trashId) {
        const data = this.getAll();
        const idx = data.trash.findIndex(t => t.id === trashId);
        if (idx === -1) return false;
        const [entry] = data.trash.splice(idx, 1);
        data[entry.arrayKey].push(entry.record);
        // A deleted car takes its history with it, so put that back too
        if (entry.extras) {
            Object.entries(entry.extras).forEach(([key, rows]) => {
                if (Array.isArray(rows) && Array.isArray(data[key])) data[key].push(...rows);
            });
        }
        this.save(data);
        return true;
    },

    deleteFromTrash(trashId) {
        const data = this.getAll();
        data.trash = data.trash.filter(t => t.id !== trashId);
        this.save(data);
    },

    // Every bill still referenced by a live OR trashed service (so restores keep photos)
    getAllReferencedBills() {
        const data = this.getAll();
        const out = [];
        data.services.forEach(s => (s.bills || []).forEach(b => out.push(b)));
        data.trash.forEach(t => {
            if (t.record && t.record.bills) t.record.bills.forEach(b => out.push(b));
            if (t.extras && t.extras.services) t.extras.services.forEach(s => (s.bills || []).forEach(b => out.push(b)));
        });
        return out;
    },

    // ── Duplicate detection ──
    // Same car, same service type, same date and same odometer is almost always a
    // double-tap rather than two genuine jobs.
    findDuplicateService(candidate, ignoreId) {
        return this.getServices(candidate.carId).find(s =>
            s.id !== ignoreId &&
            s.type === candidate.type &&
            s.date === candidate.date &&
            String(s.mileage || '') === String(candidate.mileage || '')
        ) || null;
    },

    // --- Cars ---
    getCars() { return this.getAll().cars; },

    addCar(car) {
        const data = this.getAll();
        car.id = Date.now().toString();
        data.cars.push(car);
        this.save(data);
        return car;
    },

    updateCar(id, updates) {
        const data = this.getAll();
        const idx = data.cars.findIndex(c => c.id === id);
        if (idx !== -1) { data.cars[idx] = { ...data.cars[idx], ...updates }; this.save(data); }
        return data.cars[idx];
    },

    // A car takes its whole history with it, so the trash entry carries the lot
    // and a restore brings everything back together.
    deleteCar(id) {
        const data = this.getAll();
        const car = data.cars.find(c => c.id === id);
        if (!car) return;
        const extras = {
            services: data.services.filter(s => s.carId === id),
            reminders: data.reminders.filter(r => r.carId === id),
            fuelLogs: data.fuelLogs.filter(f => f.carId === id),
            odometerLogs: (data.odometerLogs || []).filter(o => o.carId === id)
        };
        data.services = data.services.filter(s => s.carId !== id);
        data.reminders = data.reminders.filter(r => r.carId !== id);
        data.fuelLogs = data.fuelLogs.filter(f => f.carId !== id);
        data.odometerLogs = (data.odometerLogs || []).filter(o => o.carId !== id);
        this.save(data);
        this._toTrash('car', 'cars', id, extras);
    },

    // --- Services ---
    getServices(carId) {
        const services = this.getAll().services;
        if (carId && carId !== 'all') return services.filter(s => s.carId === carId);
        return services;
    },

    addService(service) {
        const data = this.getAll();
        service.id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
        data.services.push(service);
        this.save(data);
        this._syncOdometer(service.carId, service.mileage, service.date);
        // Actually doing the job ends any postponement of it
        this.clearSnooze(service.carId, service.type);
        return service;
    },

    updateService(id, updates) {
        const data = this.getAll();
        const idx = data.services.findIndex(s => s.id === id);
        if (idx !== -1) { data.services[idx] = { ...data.services[idx], ...updates }; this.save(data); }
    },

    deleteService(id) { this._toTrash('service', 'services', id); },

    // --- Reminders ---
    getReminders(carId) {
        const reminders = this.getAll().reminders;
        if (carId && carId !== 'all') return reminders.filter(r => r.carId === carId);
        return reminders;
    },

    addReminder(reminder) {
        const data = this.getAll();
        reminder.id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
        data.reminders.push(reminder);
        this.save(data);
        return reminder;
    },

    updateReminder(id, updates) {
        const data = this.getAll();
        const idx = data.reminders.findIndex(r => r.id === id);
        if (idx !== -1) { data.reminders[idx] = { ...data.reminders[idx], ...updates }; this.save(data); }
    },

    deleteReminder(id) { this._toTrash('reminder', 'reminders', id); },

    // --- Fuel Logs ---
    getFuelLogs(carId) {
        const logs = this.getAll().fuelLogs;
        if (carId && carId !== 'all') return logs.filter(f => f.carId === carId);
        return logs;
    },

    addFuelLog(log) {
        const data = this.getAll();
        log.id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
        data.fuelLogs.push(log);
        this.save(data);
        this._syncOdometer(log.carId, log.odometer, log.date);
        return log;
    },

    // Keep the car's odometer current using the latest reading from any log/service
    _syncOdometer(carId, reading, date) {
        const km = parseInt(reading);
        if (!km || !carId) return;
        const data = this.getAll();
        const idx = data.cars.findIndex(c => c.id === carId);
        if (idx !== -1 && km > (parseInt(data.cars[idx].mileage) || 0)) {
            data.cars[idx].mileage = km.toString();
            data.cars[idx].mileageDate = date || new Date().toISOString().split('T')[0];
            this.save(data);
        }
    },

    // --- Odometer readings ---
    logOdometer(carId, km, date) {
        const reading = parseInt(km);
        if (!reading || !carId) return null;
        const data = this.getAll();
        const entry = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            carId,
            km: reading,
            date: date || new Date().toISOString().split('T')[0]
        };
        data.odometerLogs.push(entry);
        this.save(data);
        this._syncOdometer(carId, reading, entry.date);
        return entry;
    },

    getOdometerLogs(carId) {
        const logs = this.getAll().odometerLogs;
        if (carId && carId !== 'all') return logs.filter(o => o.carId === carId);
        return logs;
    },

    deleteOdometerLog(id) {
        const data = this.getAll();
        data.odometerLogs = data.odometerLogs.filter(o => o.id !== id);
        this.save(data);
    },

    // Every known odometer reading for a car (manual, service, fuel), oldest first
    getOdometerReadings(carId) {
        const out = [];
        this.getOdometerLogs(carId).forEach(o => out.push({ km: o.km, date: o.date, source: 'manual' }));
        this.getServices(carId).forEach(s => { const m = parseInt(s.mileage) || 0; if (m > 0 && s.date) out.push({ km: m, date: s.date, source: 'service' }); });
        this.getFuelLogs(carId).forEach(f => { const m = parseInt(f.odometer) || 0; if (m > 0 && f.date) out.push({ km: m, date: f.date, source: 'fuel' }); });
        return out.sort((a, b) => new Date(a.date) - new Date(b.date) || a.km - b.km);
    },

    // The most recent confirmed reading (what the user actually saw on the dash)
    getLastReading(car) {
        const readings = this.getOdometerReadings(car.id);
        if (readings.length) {
            const last = readings[readings.length - 1];
            const carKm = parseInt(car.mileage) || 0;
            // car.mileage may be newer if it was typed directly on the car record
            if (carKm > last.km) return { km: carKm, date: car.mileageDate || last.date, source: 'car' };
            return last;
        }
        const carKm = parseInt(car.mileage) || 0;
        if (carKm > 0) return { km: carKm, date: car.mileageDate || null, source: 'car' };
        return null;
    },

    // How recent a stretch counts as "how you drive now", and how much of it is
    // needed before that stretch is trusted over the lifetime figure.
    RECENT_WINDOW_DAYS: 120,
    RECENT_MIN_SPAN_DAYS: 21,
    RECENT_MIN_KM: 500,

    _rateBetween(a, b) {
        const days = (new Date(b.date) - new Date(a.date)) / 86400000;
        const km = b.km - a.km;
        if (days < 1 || km <= 0) return null;
        return km / days;
    },

    // Average km/day. Prefers how the car is being driven *now* over its lifetime
    // average, because the lifetime figure is what every due date is projected
    // against and it lags badly when driving picks up: this car's own readings gave
    // 93 km/day across fifteen months while the last five weeks ran at 121, which
    // put every km-based date about 30% late.
    //
    // A recent window is only trusted when it is long enough and far enough to mean
    // something; otherwise the full span still answers, so a single fresh reading
    // can never swing the estimate.
    getDailyKmRate(carId, opts) {
        const readings = this.getOdometerReadings(carId);
        if (readings.length < 2) return null;
        const full = this._rateBetween(readings[0], readings[readings.length - 1]);
        if (opts && opts.lifetime) return full;

        const last = readings[readings.length - 1];
        const cutoff = new Date(last.date);
        cutoff.setDate(cutoff.getDate() - this.RECENT_WINDOW_DAYS);
        const window = readings.filter(r => new Date(r.date) >= cutoff);
        if (window.length >= 2) {
            const a = window[0];
            const spanDays = (new Date(last.date) - new Date(a.date)) / 86400000;
            const spanKm = last.km - a.km;
            if (spanDays >= this.RECENT_MIN_SPAN_DAYS && spanKm >= this.RECENT_MIN_KM) {
                const recent = this._rateBetween(a, last);
                if (recent) return recent;
            }
        }
        return full;
    },

    // Both figures, for saying plainly when the two disagree
    getRateDetail(carId) {
        const now = this.getDailyKmRate(carId);
        const lifetime = this.getDailyKmRate(carId, { lifetime: true });
        if (!now || !lifetime) return null;
        const changePct = Math.round((now / lifetime - 1) * 100);
        // A percent or two apart is the same answer; only call it a change when it
        // would actually move a due date.
        return { now, lifetime, changePct, recent: Math.abs(changePct) >= 5 };
    },

    // Estimated odometer *right now*: last confirmed reading projected forward
    // at the car's average daily rate. This is what keeps km-based reminders
    // counting down between manual updates.
    getProjectedMileage(car) {
        const last = this.getLastReading(car);
        if (!last) return { km: 0, estimated: false, daysSince: 0, rate: null, lastKm: 0, lastDate: null };
        const rate = this.getDailyKmRate(car.id);
        const daysSince = last.date ? Math.max(0, Math.floor((new Date() - new Date(last.date)) / 86400000)) : 0;
        if (!rate || daysSince < 1) {
            return { km: last.km, estimated: false, daysSince, rate, lastKm: last.km, lastDate: last.date };
        }
        return {
            km: Math.round(last.km + rate * daysSince),
            estimated: true,
            daysSince, rate,
            lastKm: last.km,
            lastDate: last.date
        };
    },

    // Highest known odometer, projected to today — used by all due-date logic
    getEffectiveMileage(car) {
        return this.getProjectedMileage(car).km;
    },

    // Driving pattern from every reading source. For "all cars" the per-car
    // rates are summed (odometers of different cars can't be differenced).
    getDrivingStats(carId) {
        const rateFor = id => this.getDailyKmRate(id);
        let kmPerDay = null;
        if (carId && carId !== 'all') {
            kmPerDay = rateFor(carId);
        } else {
            const rates = this.getCars().map(c => rateFor(c.id)).filter(r => r && r > 0);
            if (rates.length) kmPerDay = rates.reduce((s, r) => s + r, 0);
        }
        if (!kmPerDay || kmPerDay <= 0) return null;
        return {
            kmPerDay,
            kmPerMonth: kmPerDay * 30.44,
            kmPerYear: kmPerDay * 365
        };
    },

    // How stale the odometer is; drives the "update your odometer" nudge
    getOdometerFreshness(car) {
        const last = this.getLastReading(car);
        if (!last || !last.date) return { stale: true, daysSince: null, never: !last };
        const daysSince = Math.floor((new Date() - new Date(last.date)) / 86400000);
        return { stale: daysSince >= 30, daysSince, never: false, lastKm: last.km, lastDate: last.date };
    },

    updateFuelLog(id, updates) {
        const data = this.getAll();
        const idx = data.fuelLogs.findIndex(f => f.id === id);
        if (idx !== -1) { data.fuelLogs[idx] = { ...data.fuelLogs[idx], ...updates }; this.save(data); }
    },

    deleteFuelLog(id) { this._toTrash('fuel', 'fuelLogs', id); },

    // --- Bills ---
    // A service may carry several bills (parts from one shop, labour from another).
    // When bills exist they are the source of truth for cost; otherwise the
    // manually typed cost is used, so "no bill, just the price" keeps working.
    getServiceCost(service) {
        if (!service) return 0;
        const bills = service.bills || [];
        if (bills.length) return bills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
        return parseFloat(service.cost) || 0;
    },

    getBills(carId) {
        const out = [];
        this.getServices(carId).forEach(s => {
            (s.bills || []).forEach(b => out.push({ ...b, serviceId: s.id, serviceType: s.type, carId: s.carId, serviceDate: s.date }));
        });
        return out;
    },

    // Warranty on a purchased part: months and/or km, due on whichever ends first.
    // km uses the projected odometer, so it stays accurate between manual updates.
    getWarrantyStatus(bill, car) {
        if (!bill) return null;
        const months = parseInt(bill.warrantyMonths) || 0;
        const km = parseInt(bill.warrantyKm) || 0;
        if (!months && !km) return null;

        const today = new Date();
        let daysRemaining = null, expiryDate = null;
        if (months && bill.date) {
            const exp = new Date(bill.date);
            exp.setMonth(exp.getMonth() + months);
            expiryDate = exp.toISOString().split('T')[0];
            daysRemaining = Math.ceil((exp - today) / 86400000);
        }

        let kmRemaining = null, endKm = null;
        const startKm = parseInt(bill.startKm) || 0;
        if (km && startKm && car) {
            endKm = startKm + km;
            kmRemaining = endKm - this.getEffectiveMileage(car);
        }

        const expired = (daysRemaining !== null && daysRemaining <= 0) || (kmRemaining !== null && kmRemaining <= 0);
        const expiring = !expired && (
            (daysRemaining !== null && daysRemaining <= 60) ||
            (kmRemaining !== null && kmRemaining <= 2000)
        );

        // A km-only warranty needs the odometer reading from the day it was bought.
        // Without it there is nothing to measure against, so say so rather than guess.
        if (daysRemaining === null && kmRemaining === null) {
            return {
                status: 'unknown',
                detail: 'Add the odometer reading for this service to track it',
                daysRemaining: null, kmRemaining: null, expiryDate: null, endKm: null, months, km
            };
        }

        // Describe by whichever limit is closest to running out
        let detail;
        const dRatio = daysRemaining !== null && months ? daysRemaining / (months * 30.44) : Infinity;
        const kRatio = kmRemaining !== null && km ? kmRemaining / km : Infinity;
        if (expired) {
            detail = 'Expired';
        } else if (kmRemaining !== null && kRatio < dRatio) {
            detail = `${kmRemaining.toLocaleString()} km left`;
        } else if (daysRemaining !== null) {
            detail = daysRemaining <= 60 ? `${daysRemaining} days left` : `${Math.round(daysRemaining / 30)} months left`;
        } else {
            detail = `${kmRemaining.toLocaleString()} km left`;
        }

        return {
            status: expired ? 'expired' : expiring ? 'expiring' : 'active',
            detail, daysRemaining, kmRemaining, expiryDate, endKm, months, km
        };
    },

    // Every bill that still carries a live warranty, soonest to lapse first
    getActiveWarranties(carId) {
        const cars = this.getCars();
        const out = [];
        this.getBills(carId).forEach(b => {
            const car = cars.find(c => c.id === b.carId);
            const w = this.getWarrantyStatus(b, car);
            if (w && w.status !== 'expired') out.push({ bill: b, car, warranty: w });
        });
        return out.sort((a, b) => {
            const rank = x => {
                const d = x.warranty.daysRemaining, k = x.warranty.kmRemaining;
                const dScore = d !== null ? d : Infinity;
                const kScore = k !== null ? k / 50 : Infinity;   // ~50 km/day so km compares to days
                return Math.min(dScore, kScore);
            };
            return rank(a) - rank(b);
        });
    },

    getExpiredWarranties(carId) {
        const cars = this.getCars();
        const out = [];
        this.getBills(carId).forEach(b => {
            const car = cars.find(c => c.id === b.carId);
            const w = this.getWarrantyStatus(b, car);
            if (w && w.status === 'expired') out.push({ bill: b, car, warranty: w });
        });
        return out.sort((a, b) => new Date(b.bill.date) - new Date(a.bill.date));
    },

    // --- Computed ---
    getTotalExpenses(carId) {
        const serviceCost = this.getServices(carId).reduce((sum, s) => sum + this.getServiceCost(s), 0);
        const fuelCost = this.getFuelLogs(carId).reduce((sum, f) => sum + (parseFloat(f.totalCost) || 0), 0);
        return serviceCost + fuelCost;
    },

    getServiceExpenses(carId) {
        return this.getServices(carId).reduce((sum, s) => sum + this.getServiceCost(s), 0);
    },

    getFuelExpenses(carId) {
        return this.getFuelLogs(carId).reduce((sum, f) => sum + (parseFloat(f.totalCost) || 0), 0);
    },

    getUpcomingReminders(carId) {
        return this.getReminders(carId)
            .filter(r => !r.completed)
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    },

    getFuelConsumption(carId) {
        const logs = this.getFuelLogs(carId).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (logs.length < 2) return null;
        const results = [];
        for (let i = 1; i < logs.length; i++) {
            if (logs[i].carId === logs[i-1].carId) {
                const dist = parseFloat(logs[i].odometer) - parseFloat(logs[i-1].odometer);
                const liters = parseFloat(logs[i].liters);
                if (dist > 0 && liters > 0) {
                    results.push({
                        date: logs[i].date,
                        lPer100km: (liters / dist * 100).toFixed(1),
                        costPerKm: (parseFloat(logs[i].totalCost) / dist).toFixed(2),
                        distance: dist,
                    });
                }
            }
        }
        return results;
    },

    // Flags an abnormal jump in fuel consumption (early warning of a mechanical issue)
    getFuelAnomaly(carId) {
        const c = this.getFuelConsumption(carId);
        if (!c || c.length < 4) return null;
        const latest = parseFloat(c[c.length - 1].lPer100km);
        const prior = c.slice(0, -1);
        const avg = prior.reduce((s, x) => s + parseFloat(x.lPer100km), 0) / prior.length;
        if (avg <= 0) return null;
        const pct = ((latest - avg) / avg) * 100;
        if (pct >= 15) {
            return { latest: latest.toFixed(1), avg: avg.toFixed(1), pct: Math.round(pct), date: c[c.length - 1].date };
        }
        return null;
    },

    // Average historical cost for a service type (used to estimate upcoming spend)
    getAverageServiceCost(type, carId) {
        const matches = this.getServices(carId).filter(s => s.type === type && this.getServiceCost(s) > 0);
        if (!matches.length) return null;
        return matches.reduce((s, x) => s + this.getServiceCost(x), 0) / matches.length;
    },

    // Fallback estimates (SAR) when no personal history exists yet
    _defaultCost: {
        'Oil Change': 180, 'Tire Rotation': 60, 'Brake Inspection': 120, 'Air Filter': 90,
        'Transmission': 450, 'Coolant Flush': 200, 'Battery': 350, 'Spark Plugs': 280,
        'Alignment': 150, 'Registration Renewal': 300, 'Insurance Renewal': 1200, 'Inspection': 150, 'Other': 200
    },

    estimateServiceCost(type, carId) {
        return this.getAverageServiceCost(type, carId) || this._defaultCost[type] || 200;
    },

    // Projected spend over the next `months`: combines scheduled maintenance that is
    // overdue/due within the horizon (whichever-first engine) plus any manual reminders.
    getCostForecast(carId, months = 6) {
        const horizon = new Date();
        horizon.setMonth(horizon.getMonth() + months);
        const cars = this.getCars().filter(c => carId === 'all' || c.id === carId);
        const recTypes = Recommendations.ALL_TYPES;
        const seen = new Set();
        const items = [];

        cars.forEach(c => {
            recTypes.forEach(type => {
                const st = Recommendations.getMaintenanceStatus(c, type);
                if (!st || st.status === 'unknown') return;   // no record, so no date to forecast from
                // include if overdue, or its next-due date falls within the horizon
                if (st.status === 'overdue' || new Date(st.nextDate) <= horizon) {
                    seen.add(c.id + '|' + type);
                    items.push({ type, carId: c.id, dueDate: st.nextDate, est: this.estimateServiceCost(type, c.id) });
                }
            });
            // manual reminders not already covered by the schedule
            this.getUpcomingReminders(c.id).forEach(r => {
                if (r.autoCreated) return;
                if (seen.has(c.id + '|' + r.type)) return;
                if (new Date(r.dueDate) > horizon) return;
                items.push({ type: r.type, carId: c.id, dueDate: r.dueDate, est: this.estimateServiceCost(r.type, c.id) });
            });
        });

        const total = items.reduce((s, i) => s + i.est, 0);
        return { items, total, months };
    },

    // Total cost of ownership per km (lifetime spend / km driven since first record)
    // Distance covered by the records we hold, used as the divisor for every
    // per-km figure. Null when there is not enough history to divide by.
    getTrackedKm(carId) {
        // "all" is a real selector value, not a car id. Looking it up returned
        // undefined, so every per-km figure silently fell back to zero whenever no
        // single car was chosen — which is the default with one car.
        if (!carId || carId === 'all') {
            const spans = this.getCars().map(c => this.getTrackedKm(c.id)).filter(v => v > 0);
            if (!spans.length) return null;
            return spans.reduce((a, b) => a + b, 0);
        }
        const car = this.getCars().find(c => c.id === carId);
        if (!car) return null;
        const readings = this.getOdometerReadings(carId).map(r => r.km).filter(m => m > 0);
        if (!readings.length) return null;
        const span = this.getEffectiveMileage(car) - Math.min(...readings);
        return span > 0 ? span : null;
    },

    // Running cost split into its parts. Fuel is almost always the larger half,
    // and it is estimated rather than logged — see Features.getFuelEstimate —
    // so the two are kept separate and labelled rather than silently summed.
    getCostBreakdown(carId) {
        const span = this.getTrackedKm(carId);
        if (!span) return null;
        const maintenance = this.getServiceExpenses(carId) + this.getFuelExpenses(carId);
        // The estimate needs a car to read a driving rate from; across "all" use the
        // first, since the consumption setting is per-owner rather than per-car.
        const rateCar = (!carId || carId === 'all') ? (this.getCars()[0] || {}).id : carId;
        const est = (typeof Features !== 'undefined') ? Features.getFuelEstimateFor(rateCar, span) : null;
        const fuel = est ? est.cost : 0;
        return {
            km: span,
            maintenance, fuel,
            total: maintenance + fuel,
            maintPerKm: maintenance / span,
            fuelPerKm: fuel / span,
            totalPerKm: (maintenance + fuel) / span,
            fuelEstimated: !!est
        };
    },

    getCostPerKm(carId) {
        const b = this.getCostBreakdown(carId);
        return b ? b.totalPerKm : null;
    },

    // Spend within a given YYYY-MM month
    getMonthlySpend(carId, yearMonth) {
        let total = 0;
        this.getServices(carId).forEach(s => { if (s.date && s.date.substring(0, 7) === yearMonth) total += this.getServiceCost(s); });
        this.getFuelLogs(carId).forEach(f => { if (f.date && f.date.substring(0, 7) === yearMonth) total += parseFloat(f.totalCost) || 0; });
        return total;
    },

    // This-month vs last-month delta (for trend arrows)
    getSpendTrend(carId) {
        const now = new Date();
        const thisYM = now.toISOString().substring(0, 7);
        const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastYM = lastDate.toISOString().substring(0, 7);
        const cur = this.getMonthlySpend(carId, thisYM);
        const prev = this.getMonthlySpend(carId, lastYM);
        let pct = null;
        if (prev > 0) pct = Math.round(((cur - prev) / prev) * 100);
        else if (cur > 0) pct = 100;
        return { current: cur, previous: prev, pct };
    },

    // ── Reminder status ──
    // Reminders carry both a due date and a due odometer. Judging them on the date
    // alone made the Reminders page disagree with the maintenance schedule — a
    // reminder already past its km target could still read "In 789d".
    getReminderStatus(reminder, car) {
        const today = new Date();
        let daysRemaining = null;
        if (reminder.dueDate) daysRemaining = Math.ceil((new Date(reminder.dueDate) - today) / 86400000);

        let kmRemaining = null, kmDays = null;
        const dueKm = parseInt(reminder.dueMileage) || 0;
        if (dueKm && car) {
            kmRemaining = dueKm - this.getEffectiveMileage(car);
            const rate = this.getDailyKmRate(car.id);
            if (rate && rate > 0) kmDays = Math.round(kmRemaining / rate);
        }

        const overdue = (daysRemaining !== null && daysRemaining <= 0) ||
                        (kmRemaining !== null && kmRemaining <= 0);
        const horizons = [daysRemaining, kmDays].filter(v => v !== null);
        const effDays = horizons.length ? Math.min(...horizons) : null;
        const soon = !overdue && effDays !== null && effDays <= 7;

        // Describe by whichever limit runs out first
        const kmIsBinding = kmDays !== null && (daysRemaining === null || kmDays < daysRemaining);
        let detail;
        const T = (str, vars) => (typeof I18N !== 'undefined' ? I18N.t(str, vars) : str);
        if (overdue) {
            if (kmRemaining !== null && kmRemaining <= 0) detail = T('{km} km over', {km: Math.abs(kmRemaining).toLocaleString()});
            else detail = T('{d}d overdue', {d: Math.abs(daysRemaining)});
        } else if (kmIsBinding) {
            detail = T('{km} km left', {km: kmRemaining.toLocaleString()});
        } else if (daysRemaining !== null) {
            detail = daysRemaining === 0 ? T('Due today') : T('In {d}d', {d: daysRemaining});
        } else {
            detail = '—';
        }

        return {
            status: reminder.completed ? 'done' : overdue ? 'overdue' : soon ? 'soon' : 'ok',
            detail, daysRemaining, kmRemaining, effDays, kmIsBinding
        };
    },

    // Push a reminder out without pretending it was done. Moves the km target as
    // well, otherwise a km-bound reminder would fire again immediately.
    snoozeReminder(id, days) {
        const data = this.getAll();
        const r = data.reminders.find(x => x.id === id);
        if (!r) return;
        const base = r.dueDate ? new Date(r.dueDate) : new Date();
        const from = base > new Date() ? base : new Date();
        from.setDate(from.getDate() + days);
        r.dueDate = from.toISOString().split('T')[0];
        const rate = this.getDailyKmRate(r.carId);
        if (r.dueMileage && rate) {
            const car = data.cars.find(c => c.id === r.carId);
            const now = car ? this.getEffectiveMileage(car) : 0;
            const target = Math.max(parseInt(r.dueMileage) || 0, now) + Math.round(rate * days);
            r.dueMileage = String(target);
        }
        r.snoozed = true;
        this.save(data);
    },

    // Insurance / Istimara / Fahes should appear on the Reminders page too, not
    // only as Action Center warnings, so they exist wherever you happen to look.
    DOC_REMINDERS: [
        { field: 'insuranceExpiry',    type: 'Insurance Renewal' },
        { field: 'registrationExpiry', type: 'Registration Renewal' },
        { field: 'fahesExpiry',        type: 'Inspection' }
    ],

    syncDocumentReminders(carId) {
        const data = this.getAll();
        const car = data.cars.find(c => c.id === carId);
        if (!car) return;
        let changed = false;
        this.DOC_REMINDERS.forEach(({ field, type }) => {
            const due = car[field];
            const existing = data.reminders.find(r => r.carId === carId && r.type === type && r.autoDoc);
            if (!due) {
                if (existing && !existing.completed) {
                    data.reminders = data.reminders.filter(r => r !== existing);
                    changed = true;
                }
                return;
            }
            if (existing) {
                if (existing.dueDate !== due) { existing.dueDate = due; existing.completed = false; changed = true; }
            } else {
                data.reminders.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
                    carId, type, dueDate: due, dueMileage: '',
                    notes: 'Auto: from the date on your car record',
                    completed: false, autoCreated: true, autoDoc: true
                });
                changed = true;
            }
        });
        if (changed) this.save(data);
    },

    // ── Service insights ──
    // Compares the interval you actually achieve against the recommended one, using
    // the mileage on your own records. Everything needed is already stored; this
    // just surfaces it.
    getServiceInsights(carId) {
        const cars = this.getCars().filter(c => carId === 'all' || c.id === carId);
        const groups = [];
        cars.forEach(car => {
            const byType = {};
            this.getServices(car.id).forEach(s => {
                if (!s.mileage || !s.date) return;
                (byType[s.type] = byType[s.type] || []).push(s);
            });
            const rate = this.getDailyKmRate(car.id);
            const kmPerYear = rate ? rate * 365 : null;
            const items = [];
            Object.entries(byType).forEach(([type, list]) => {
                list.sort((a, b) => parseInt(a.mileage) - parseInt(b.mileage));
                const costs = list.map(s => this.getServiceCost(s)).filter(c => c > 0);
                const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
                const gaps = [];
                for (let i = 1; i < list.length; i++) {
                    const km = parseInt(list[i].mileage) - parseInt(list[i - 1].mileage);
                    if (km > 0) gaps.push(km);
                }
                if (!gaps.length) return;                       // need at least two to compare
                const avgKm = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                const rec = Recommendations.getEffective(car, type);
                const recKm = rec && rec.km ? rec.km : null;
                const ratio = recKm ? avgKm / recKm : null;

                let verdict = null, note = null, yearlyDelta = null;
                if (ratio !== null) {
                    if (ratio < 0.7) {
                        verdict = 'frequent';
                        note = 'More often than the schedule asks';
                        if (kmPerYear && avgCost) {
                            yearlyDelta = ((kmPerYear / avgKm) - (kmPerYear / recKm)) * avgCost;
                        }
                    } else if (ratio <= 1.15) {
                        verdict = 'onschedule'; note = 'Matching the schedule';
                    } else {
                        verdict = 'stretched'; note = 'Going further than recommended';
                    }
                }
                items.push({
                    type, count: list.length, avgKm: Math.round(avgKm), recKm, ratio, verdict, note,
                    avgCost, lastCost: costs.length ? costs[costs.length - 1] : null,
                    firstCost: costs.length ? costs[0] : null,
                    yearlyDelta, perYear: kmPerYear && avgKm ? kmPerYear / avgKm : null
                });
            });
            items.sort((a, b) => (b.yearlyDelta || 0) - (a.yearlyDelta || 0) || a.type.localeCompare(b.type));
            if (items.length) groups.push({ car, carName: car.make + ' ' + car.model, items });
        });
        return groups;
    },

    // ── Tyre age ──
    // Rubber hardens with heat and time regardless of tread depth, which matters
    // more here than tread wear does.
    // ── Postponing ────────────────────────────────────────────────────────
    // Not every due job can be done the week it falls due — time and money get in
    // the way. Without a way to say "later", the only tool to hand is logging the
    // job as done, which tells the schedule the opposite of the truth and quietly
    // pushes the next one out by a full interval.
    //
    // A postponement changes WHEN YOU ARE TOLD, never WHETHER IT IS DUE. The
    // schedule is untouched: getMaintenanceStatus still reports overdue, and the
    // item stays visible under Postponed with the date it comes back. Nothing can
    // disappear by being postponed.
    snoozeItem(carId, type, days, note) {
        const data = this.getAll();
        const until = new Date();
        until.setDate(until.getDate() + Math.max(1, parseInt(days) || 7));
        const untilStr = until.toISOString().split('T')[0];
        const existing = data.snoozes.find(s => s.carId === carId && s.type === type);
        if (existing) {
            existing.until = untilStr;
            existing.times = (existing.times || 1) + 1;
            if (note !== undefined) existing.note = note;
        } else {
            data.snoozes.push({
                id: 'sn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                carId, type, until: untilStr, times: 1,
                createdAt: new Date().toISOString().split('T')[0],
                note: note || ''
            });
        }
        this.save(data);
        return untilStr;
    },

    // Expired postponements are dropped on read, so an item returns on its own.
    getSnooze(carId, type) {
        const today = new Date().toISOString().split('T')[0];
        return this.getAll().snoozes.find(s =>
            s.carId === carId && s.type === type && s.until > today) || null;
    },

    getActiveSnoozes(carId) {
        const today = new Date().toISOString().split('T')[0];
        return this.getAll().snoozes
            .filter(s => s.until > today && (!carId || carId === 'all' || s.carId === carId))
            .sort((a, b) => a.until.localeCompare(b.until));
    },

    clearSnooze(carId, type) {
        const data = this.getAll();
        const before = data.snoozes.length;
        data.snoozes = data.snoozes.filter(s => !(s.carId === carId && s.type === type));
        if (data.snoozes.length !== before) this.save(data);
    },

    // ── Planning a journey ────────────────────────────────────────────────
    // This owner drives between cities, so the useful question is not "what is
    // due?" but "what runs out while I am 700 km from home?". Everything here is
    // the existing schedule read forward over one trip's distance.
    planTrip(carId, tripKm) {
        const car = this.getCars().find(c => c.id === carId);
        if (!car || !(tripKm > 0)) return null;
        const startKm = this.getEffectiveMileage(car);
        const endKm = startKm + tripKm;

        // What is already overdue before setting off, and what falls due en route
        const overdue = [], during = [];
        Recommendations.ALL_TYPES.forEach(type => {
            const st = Recommendations.getMaintenanceStatus(car, type);
            if (!st || st.status === 'unknown') return;
            if (st.status === 'overdue') { overdue.push(st); return; }
            if (st.nextKm && st.nextKm > startKm && st.nextKm <= endKm) {
                during.push({ ...st, atKm: st.nextKm, intoTrip: st.nextKm - startKm });
            }
        });
        during.sort((a, b) => a.intoTrip - b.intoTrip);

        // Tyres are the item that strands you at speed, and they are judged
        // separately from the schedule, so they are checked separately here too.
        const tyre = this.getTyreStatus(car);
        const tyreRunsOut = tyre && tyre.kmLeft !== null && tyre.kmLeft < tripKm
            ? { atKm: startKm + Math.max(0, tyre.kmLeft), intoTrip: Math.max(0, tyre.kmLeft) } : null;

        // Cost of the drive itself
        const fuelEst = (typeof Features !== 'undefined') ? Features.getFuelEstimateFor(carId, tripKm) : null;
        const breakdown = this.getCostBreakdown(carId);
        const wear = breakdown ? breakdown.maintPerKm * tripKm : null;

        return {
            tripKm, startKm, endKm,
            overdue, during, tyre, tyreRunsOut,
            unknown: Recommendations.unknownTypes(car),
            fuelCost: fuelEst ? fuelEst.cost : null,
            litres: fuelEst ? fuelEst.litres : null,
            wearCost: wear,
            totalCost: (fuelEst ? fuelEst.cost : 0) + (wear || 0),
            days: (() => { const r = this.getDailyKmRate(carId); return r > 0 ? Math.round(tripKm / r) : null; })()
        };
    },

    // Tyres get their own logic rather than joining the generic schedule, because
    // they are judged three ways at once: distance on the set, age of the rubber
    // (which hardens in heat regardless of tread), and the tread itself. Keeping
    // one authority here avoids the two-sources-of-truth problem — a logged
    // "Tires" service and the tyre record are merged, latest wins.
    TYRE_KM_LIFE: 50000,
    TYRE_AGE_REPLACE: 6,
    TYRE_AGE_WARN: 5,

    getTyreStatus(car) {
        if (!car) return null;
        const rec = car.tires || {};
        const svc = this.getServices(car.id)
            .filter(s => s.type === 'Tires' && s.date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        let fittedDate = rec.installedDate || null;
        let fittedKm = parseInt(rec.installedMileage) || 0;
        // A logged replacement is newer than whatever the tyre record says
        if (svc && (!fittedDate || new Date(svc.date) > new Date(fittedDate))) {
            fittedDate = svc.date;
            fittedKm = parseInt(svc.mileage) || fittedKm;
        }

        const age = this.getTyreAge(car);
        if (!fittedDate && !fittedKm && !age) return null;

        const climate = (typeof Features !== 'undefined') ? Features.getClimateMultiplier() : 1;
        const kmLife = Math.round(this.TYRE_KM_LIFE * climate);
        const currentKm = this.getEffectiveMileage(car);
        const kmOnSet = fittedKm > 0 ? Math.max(0, currentKm - fittedKm) : null;
        const kmLeft = kmOnSet === null ? null : kmLife - kmOnSet;

        // whichever runs out first, distance or rubber age
        let status = 'ok', reason = null;
        if (kmLeft !== null && kmLeft <= 0) { status = 'replace'; reason = 'km'; }
        else if (age && age.status === 'replace') { status = 'replace'; reason = 'age'; }
        else if (kmLeft !== null && kmLeft <= kmLife * 0.15) { status = 'soon'; reason = 'km'; }
        else if (age && age.status === 'ageing') { status = 'soon'; reason = 'age'; }

        const T = (str, vars) => (typeof I18N !== 'undefined' ? I18N.t(str, vars) : str);
        let detail;
        if (reason === 'age') detail = T('{y} years old', { y: age.years });
        else if (kmOnSet !== null) {
            detail = kmLeft <= 0 ? T('{km} km past the usual life', { km: Math.abs(kmLeft).toLocaleString() })
                                 : T('{km} km on this set', { km: kmOnSet.toLocaleString() });
        } else detail = age ? T('{y} years old', { y: age.years }) : '';

        // how long the remaining distance actually lasts at this car's rate
        const rate = this.getDailyKmRate(car.id);
        const daysLeft = (kmLeft !== null && kmLeft > 0 && rate > 0) ? Math.round(kmLeft / rate) : null;

        return { status, reason, detail, kmOnSet, kmLeft, kmLife, daysLeft, fittedDate, fittedKm,
                 ageYears: age ? age.years : null, brand: rec.brand || '', size: rec.size || '' };
    },

    getTyreAge(car) {
        const t = car && car.tires;
        const made = t && (t.manufactureDate || '');
        if (!made) return null;
        const d = new Date(made + (made.length === 7 ? '-01' : ''));
        if (isNaN(d)) return null;
        const years = (Date.now() - d) / (365.25 * 86400000);
        return {
            years: Math.round(years * 10) / 10,
            madeOn: made,
            status: years >= 6 ? 'replace' : years >= 5 ? 'ageing' : 'ok'
        };
    },

    // ── Keep-or-sell analysis ──
    // Fuel is deliberately excluded from the verdict: you would pay it on any car,
    // so it says nothing about whether THIS car is worth keeping. Maintenance does.
    getOwnershipAnalysis(carId) {
        const car = this.getCars().find(c => c.id === carId);
        if (!car) return null;
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        let maint12 = 0, fuel12 = 0;
        this.getServices(carId).forEach(s => { if (s.date && new Date(s.date) >= yearAgo) maint12 += this.getServiceCost(s); });
        this.getFuelLogs(carId).forEach(f => { if (f.date && new Date(f.date) >= yearAgo) fuel12 += parseFloat(f.totalCost) || 0; });

        // Distance per year. Readings inside the window rarely span a full 12 months,
        // so scale the observed span up to a year rather than reporting a short span
        // as if it were annual — otherwise cost-per-km comes out far too high.
        const readings = this.getOdometerReadings(carId).filter(r => new Date(r.date) >= yearAgo);
        let km12 = null;
        if (readings.length >= 2) {
            const first = readings[0], last = readings[readings.length - 1];
            const spanDays = (new Date(last.date) - new Date(first.date)) / 86400000;
            const km = last.km - first.km;
            if (spanDays >= 1 && km > 0) {
                km12 = spanDays >= 300 ? km : Math.round((km / spanDays) * 365);
            }
        }
        if (km12 === null) {
            const rate = this.getDailyKmRate(carId);
            if (rate) km12 = Math.round(rate * 365);
        }

        const value = parseFloat(car.marketValue) || 0;
        const ratio = value > 0 ? maint12 / value : null;
        let verdict = null, headline = null;
        if (ratio !== null) {
            if (ratio < 0.15) { verdict = 'healthy'; headline = 'Worth keeping'; }
            else if (ratio < 0.30) { verdict = 'watch'; headline = 'Keep an eye on it'; }
            else { verdict = 'consider'; headline = 'Consider replacing'; }
        }
        return {
            maint12, fuel12, total12: maint12 + fuel12, km12, value, ratio, verdict, headline,
            maintPerKm: km12 && km12 > 0 ? maint12 / km12 : null,
            totalPerKm: km12 && km12 > 0 ? (maint12 + fuel12) / km12 : null,
            hasValue: value > 0
        };
    },

    getCarHealthScore(car) {
        const recs = Recommendations.getAllForCar(car);
        const reminders = this.getUpcomingReminders(car.id);
        let totalItems = 0, healthyItems = 0, unknownItems = 0;

        // Each scheduled service evaluated on whichever-comes-first (km OR time).
        // Items with no record are left out of the score altogether rather than
        // counted as healthy — scoring a guess is how a 429,000 km car came to
        // read 93/100 on services nobody had ever recorded.
        Object.keys(recs).forEach(type => {
            const st = Recommendations.getMaintenanceStatus(car, type);
            if (!st) return;
            if (st.status === 'unknown') { unknownItems++; return; }
            totalItems++;
            if (st.status === 'ok') healthyItems++;
            else if (st.status === 'soon') healthyItems += 0.5;
            // overdue contributes 0
        });

        // Check insurance
        if (car.insuranceExpiry) {
            totalItems++;
            const days = Math.ceil((new Date(car.insuranceExpiry) - new Date()) / 86400000);
            if (days > 30) healthyItems++;
            else if (days > 0) healthyItems += 0.5;
        }
        // Check registration
        if (car.registrationExpiry) {
            totalItems++;
            const days = Math.ceil((new Date(car.registrationExpiry) - new Date()) / 86400000);
            if (days > 30) healthyItems++;
            else if (days > 0) healthyItems += 0.5;
        }

        // Overdue reminders penalty
        const overdueCount = reminders.filter(r => new Date(r.dueDate) < new Date()).length;
        healthyItems = Math.max(0, healthyItems - overdueCount * 0.5);

        if (totalItems === 0) return { score: null, label: 'Not enough records', color: 'blue', totalItems, unknownItems };
        const score = Math.round((healthyItems / totalItems) * 100);
        const base = { score, totalItems, unknownItems };
        if (score >= 80) return { ...base, label: 'Good', color: 'green' };
        if (score >= 50) return { ...base, label: 'Fair', color: 'orange' };
        return { ...base, label: 'Needs Attention', color: 'red' };
    }
};
