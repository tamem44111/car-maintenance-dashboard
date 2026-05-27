const Storage = {
    _key: 'autocare_data',

    _defaults() {
        return { cars: [], services: [], reminders: [], fuelLogs: [] };
    },

    getAll() {
        const raw = localStorage.getItem(this._key);
        if (!raw) return this._defaults();
        const data = JSON.parse(raw);
        if (!data.fuelLogs) data.fuelLogs = [];
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
        return log;
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

    // --- Computed ---
    getTotalExpenses(carId) {
        const serviceCost = this.getServices(carId).reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
        const fuelCost = this.getFuelLogs(carId).reduce((sum, f) => sum + (parseFloat(f.totalCost) || 0), 0);
        return serviceCost + fuelCost;
    },

    getServiceExpenses(carId) {
        return this.getServices(carId).reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
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

    getCarHealthScore(car) {
        const recs = Recommendations.getAllForCar(car);
        const currentMileage = parseInt(car.mileage) || 0;
        const services = this.getServices(car.id);
        const reminders = this.getUpcomingReminders(car.id);
        let totalItems = 0, healthyItems = 0;

        Object.entries(recs).forEach(([type, rec]) => {
            totalItems++;
            const lastService = services.filter(s => s.type === type).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const lastKm = lastService ? parseInt(lastService.mileage) || 0 : 0;
            const nextKm = lastKm > 0 ? lastKm + rec.km : currentMileage + rec.km;
            const remaining = nextKm - currentMileage;
            if (remaining > rec.km * 0.2) healthyItems++;
            else if (remaining > 0) healthyItems += 0.5;
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
