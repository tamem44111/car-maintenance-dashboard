const Storage = {
    _key: 'autocare_data',

    _defaults() {
        return { cars: [], services: [], reminders: [] };
    },

    getAll() {
        const raw = localStorage.getItem(this._key);
        return raw ? JSON.parse(raw) : this._defaults();
    },

    save(data) {
        localStorage.setItem(this._key, JSON.stringify(data));
    },

    getCars() {
        return this.getAll().cars;
    },

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
        if (idx !== -1) {
            data.cars[idx] = { ...data.cars[idx], ...updates };
            this.save(data);
        }
        return data.cars[idx];
    },

    deleteCar(id) {
        const data = this.getAll();
        data.cars = data.cars.filter(c => c.id !== id);
        data.services = data.services.filter(s => s.carId !== id);
        data.reminders = data.reminders.filter(r => r.carId !== id);
        this.save(data);
    },

    getServices(carId) {
        const services = this.getAll().services;
        if (carId && carId !== 'all') return services.filter(s => s.carId === carId);
        return services;
    },

    addService(service) {
        const data = this.getAll();
        service.id = Date.now().toString();
        data.services.push(service);
        this.save(data);
        return service;
    },

    updateService(id, updates) {
        const data = this.getAll();
        const idx = data.services.findIndex(s => s.id === id);
        if (idx !== -1) {
            data.services[idx] = { ...data.services[idx], ...updates };
            this.save(data);
        }
    },

    deleteService(id) {
        const data = this.getAll();
        data.services = data.services.filter(s => s.id !== id);
        this.save(data);
    },

    getReminders(carId) {
        const reminders = this.getAll().reminders;
        if (carId && carId !== 'all') return reminders.filter(r => r.carId === carId);
        return reminders;
    },

    addReminder(reminder) {
        const data = this.getAll();
        reminder.id = Date.now().toString();
        data.reminders.push(reminder);
        this.save(data);
        return reminder;
    },

    updateReminder(id, updates) {
        const data = this.getAll();
        const idx = data.reminders.findIndex(r => r.id === id);
        if (idx !== -1) {
            data.reminders[idx] = { ...data.reminders[idx], ...updates };
            this.save(data);
        }
    },

    deleteReminder(id) {
        const data = this.getAll();
        data.reminders = data.reminders.filter(r => r.id !== id);
        this.save(data);
    },

    getTotalExpenses(carId) {
        return this.getServices(carId).reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);
    },

    getUpcomingReminders(carId) {
        const now = new Date();
        return this.getReminders(carId)
            .filter(r => !r.completed)
            .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    }
};
