const Recommendations = {
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
        const m = make.toLowerCase().trim();
        const md = model.toLowerCase().trim();
        const brand = this.database[m];
        if (!brand) return null;
        return brand[md] || brand['_default'] || null;
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
        if (custom[car.id] && custom[car.id][serviceType]) {
            return { ...custom[car.id][serviceType], source: 'custom' };
        }
        const rec = this.getForService(car.make, car.model, serviceType);
        if (rec) return { ...rec, source: 'manufacturer' };
        return null;
    },

    getAllForCar(car) {
        const types = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs', 'Alignment'];
        const result = {};
        types.forEach(type => {
            const rec = this.getEffective(car, type);
            if (rec) result[type] = rec;
        });
        return result;
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
