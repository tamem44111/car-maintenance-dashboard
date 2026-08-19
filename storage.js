const Storage = {
    _key: 'autocare_data',

    _defaults() {
        return { cars: [], services: [], reminders: [], fuelLogs: [], odometerLogs: [] };
    },

    getAll() {
        const raw = localStorage.getItem(this._key);
        if (!raw) return this._defaults();
        const data = JSON.parse(raw);
        if (!data.fuelLogs) data.fuelLogs = [];
        if (!data.odometerLogs) data.odometerLogs = [];
        return data;
    },

    save(data) {
        localStorage.setItem(this._key, JSON.stringify(data));
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

    deleteCar(id) {
        const data = this.getAll();
        data.cars = data.cars.filter(c => c.id !== id);
        data.services = data.services.filter(s => s.carId !== id);
        data.reminders = data.reminders.filter(r => r.carId !== id);
        data.fuelLogs = data.fuelLogs.filter(f => f.carId !== id);
        data.odometerLogs = (data.odometerLogs || []).filter(o => o.carId !== id);
        this.save(data);
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
        return service;
    },

    updateService(id, updates) {
        const data = this.getAll();
        const idx = data.services.findIndex(s => s.id === id);
        if (idx !== -1) { data.services[idx] = { ...data.services[idx], ...updates }; this.save(data); }
    },

    deleteService(id) {
        const data = this.getAll();
        data.services = data.services.filter(s => s.id !== id);
        this.save(data);
    },

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

    deleteReminder(id) {
        const data = this.getAll();
        data.reminders = data.reminders.filter(r => r.id !== id);
        this.save(data);
    },

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

    // Average km/day derived from the spread of readings (null when not enough data)
    getDailyKmRate(carId) {
        const readings = this.getOdometerReadings(carId);
        if (readings.length < 2) return null;
        const first = readings[0], last = readings[readings.length - 1];
        const days = (new Date(last.date) - new Date(first.date)) / 86400000;
        const km = last.km - first.km;
        if (days < 1 || km <= 0) return null;
        return km / days;
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

    deleteFuelLog(id) {
        const data = this.getAll();
        data.fuelLogs = data.fuelLogs.filter(f => f.id !== id);
        this.save(data);
    },

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
        const recTypes = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs'];
        const seen = new Set();
        const items = [];

        cars.forEach(c => {
            recTypes.forEach(type => {
                const st = Recommendations.getMaintenanceStatus(c, type);
                if (!st) return;
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
    getCostPerKm(carId) {
        const total = this.getTotalExpenses(carId);
        const car = this.getCars().find(c => c.id === carId);
        if (!car) return null;
        // Use every known reading — manual odometer entries included
        const readings = this.getOdometerReadings(carId).map(r => r.km).filter(m => m > 0);
        if (readings.length < 1) return null;
        const minKm = Math.min(...readings);
        const maxKm = this.getEffectiveMileage(car);
        const span = maxKm - minKm;
        if (span <= 0) return null;
        return total / span;
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

    getCarHealthScore(car) {
        const recs = Recommendations.getAllForCar(car);
        const reminders = this.getUpcomingReminders(car.id);
        let totalItems = 0, healthyItems = 0;

        // Each scheduled service evaluated on whichever-comes-first (km OR time)
        Object.keys(recs).forEach(type => {
            const st = Recommendations.getMaintenanceStatus(car, type);
            if (!st) return;
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

        if (totalItems === 0) return { score: 100, label: 'New', color: 'blue' };
        const score = Math.round((healthyItems / totalItems) * 100);
        if (score >= 80) return { score, label: 'Good', color: 'green' };
        if (score >= 50) return { score, label: 'Fair', color: 'orange' };
        return { score, label: 'Needs Attention', color: 'red' };
    }
};
