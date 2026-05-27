const App = {
    currentPage: 'dashboard',
    selectedCarId: 'all',

    init() {
        this.bindNavigation();
        this.bindModal();
        this.bindCarSelector();
        this.navigate('dashboard');
    },

    // --- Navigation ---
    bindNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigate(page);
            });
        });
    },

    navigate(page) {
        this.currentPage = page;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');

        const titles = { dashboard: 'Dashboard', cars: 'My Cars', services: 'Services', expenses: 'Expenses', reminders: 'Reminders' };
        document.getElementById('page-title').textContent = titles[page];

        const addBtn = document.getElementById('add-btn');
        if (page === 'dashboard') {
            addBtn.style.display = 'none';
        } else {
            addBtn.style.display = 'block';
            const labels = { cars: '+ Add Car', services: '+ Add Service', expenses: '+ Add Expense', reminders: '+ Add Reminder' };
            addBtn.textContent = labels[page];
            addBtn.onclick = () => this.openAddModal(page);
        }

        this.renderPage(page);
    },

    renderPage(page) {
        switch(page) {
            case 'dashboard': this.renderDashboard(); break;
            case 'cars': this.renderCars(); break;
            case 'services': this.renderServices(); break;
            case 'expenses': this.renderExpenses(); break;
            case 'reminders': this.renderReminders(); break;
        }
        this.updateCarSelector();
    },

    // --- Car Selector ---
    bindCarSelector() {
        document.getElementById('car-selector').addEventListener('change', (e) => {
            this.selectedCarId = e.target.value;
            this.renderPage(this.currentPage);
        });
    },

    updateCarSelector() {
        const select = document.getElementById('car-selector');
        const cars = Storage.getCars();
        const current = this.selectedCarId;
        select.innerHTML = '<option value="all">All Cars</option>' +
            cars.map(c => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('');
    },

    // --- Modal ---
    bindModal() {
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal')) this.closeModal();
        });
    },

    openModal(title, bodyHTML, onSave) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHTML;
        document.getElementById('modal').style.display = 'flex';
        document.getElementById('modal-save').onclick = onSave;
    },

    closeModal() {
        document.getElementById('modal').style.display = 'none';
    },

    // --- Add Modals ---
    openAddModal(page) {
        switch(page) {
            case 'cars': this.openCarModal(); break;
            case 'services': this.openServiceModal(); break;
            case 'expenses': this.openServiceModal(); break;
            case 'reminders': this.openReminderModal(); break;
        }
    },

    openCarModal(car = null) {
        const html = `
            <div class="form-group">
                <label>Make</label>
                <input type="text" id="f-make" placeholder="e.g. Toyota" value="${car ? car.make : ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Model</label>
                    <input type="text" id="f-model" placeholder="e.g. Camry" value="${car ? car.model : ''}">
                </div>
                <div class="form-group">
                    <label>Year</label>
                    <input type="number" id="f-year" placeholder="e.g. 2022" value="${car ? car.year : ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Current Mileage (km)</label>
                    <input type="number" id="f-mileage" placeholder="e.g. 50000" value="${car ? car.mileage : ''}">
                </div>
                <div class="form-group">
                    <label>License Plate</label>
                    <input type="text" id="f-plate" placeholder="e.g. ABC 1234" value="${car ? car.plate : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Color</label>
                <input type="text" id="f-color" placeholder="e.g. Silver" value="${car ? car.color : ''}">
            </div>
        `;
        this.openModal(car ? 'Edit Car' : 'Add Car', html, () => {
            const data = {
                make: document.getElementById('f-make').value.trim(),
                model: document.getElementById('f-model').value.trim(),
                year: document.getElementById('f-year').value.trim(),
                mileage: document.getElementById('f-mileage').value.trim(),
                plate: document.getElementById('f-plate').value.trim(),
                color: document.getElementById('f-color').value.trim(),
            };
            if (!data.make || !data.model || !data.year) return alert('Please fill in make, model, and year.');
            if (car) {
                Storage.updateCar(car.id, data);
            } else {
                Storage.addCar(data);
            }
            this.closeModal();
            this.renderPage(this.currentPage);
        });
    },

    openServiceModal(service = null) {
        const cars = Storage.getCars();
        if (cars.length === 0) return alert('Please add a car first.');
        const types = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs', 'Alignment', 'Other'];
        const isEdit = !!service;
        const isOil = service && service.type === 'Oil Change';

        const servicesCheckboxes = types.map(t => {
            const checked = isEdit && service.type === t ? 'checked' : '';
            const id = 'svc-' + t.toLowerCase().replace(/\s+/g, '-');
            return `<label class="service-chip">
                <input type="checkbox" id="${id}" value="${t}" ${checked} ${isEdit ? 'disabled' : ''}
                    onchange="(function(){ var oil=document.getElementById('oil-options'); var cb=document.getElementById('svc-oil-change'); oil.style.display=cb&&cb.checked?'block':'none'; })()">
                <span class="service-chip-label">${t}</span>
            </label>`;
        }).join('');

        const html = `
            <div class="form-group">
                <label>Car</label>
                <select id="f-car">
                    ${cars.map(c => `<option value="${c.id}" ${service && service.carId === c.id ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>${isEdit ? 'Service Type' : 'Services Performed (select all that apply)'}</label>
                ${isEdit
                    ? `<select id="f-type" onchange="document.getElementById('oil-options').style.display = this.value === 'Oil Change' ? 'block' : 'none'">
                        ${types.map(t => `<option value="${t}" ${service.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                       </select>`
                    : `<div class="service-chips">${servicesCheckboxes}</div>`
                }
            </div>
            <div id="oil-options" style="display:${isOil ? 'block' : 'none'}">
                <div class="form-group">
                    <label>Oil Type (next change interval)</label>
                    <div class="oil-interval-group">
                        <label class="oil-option">
                            <input type="radio" name="oil-interval" value="5000" ${service && service.oilInterval && service.oilInterval !== '5000' ? '' : 'checked'}>
                            <span class="oil-option-card">
                                <strong>5,000 km</strong>
                                <small>Regular / Mineral</small>
                            </span>
                        </label>
                        <label class="oil-option">
                            <input type="radio" name="oil-interval" value="7000" ${service && service.oilInterval === '7000' ? 'checked' : ''}>
                            <span class="oil-option-card">
                                <strong>7,000 km</strong>
                                <small>Semi-synthetic</small>
                            </span>
                        </label>
                        <label class="oil-option">
                            <input type="radio" name="oil-interval" value="10000" ${service && service.oilInterval === '10000' ? 'checked' : ''}>
                            <span class="oil-option-card">
                                <strong>10,000 km</strong>
                                <small>Full synthetic</small>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Date</label>
                    <input type="date" id="f-date" value="${service ? service.date : new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Total Cost (SAR)</label>
                    <input type="number" id="f-cost" placeholder="0.00" step="0.01" value="${service ? service.cost : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Mileage at Service (km)</label>
                <input type="number" id="f-smileage" placeholder="e.g. 50000" value="${service ? service.mileage : ''}">
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="f-notes" rows="2" placeholder="Optional notes...">${service ? service.notes || '' : ''}</textarea>
            </div>
        `;
        this.openModal(isEdit ? 'Edit Service' : 'Add Service', html, () => {
            const carId = document.getElementById('f-car').value;
            const date = document.getElementById('f-date').value;
            const cost = document.getElementById('f-cost').value;
            const mileage = document.getElementById('f-smileage').value;
            const notes = document.getElementById('f-notes').value.trim();

            if (!date) return alert('Please select a date.');

            const car = Storage.getCars().find(c => c.id === carId);

            if (isEdit) {
                const data = { carId, type: document.getElementById('f-type').value, date, cost, mileage, notes };
                if (data.type === 'Oil Change') {
                    this._handleOilReminder(data);
                } else if (mileage && car) {
                    Recommendations.createReminderFromService(car, data.type, mileage, date);
                }
                Storage.updateService(service.id, data);
            } else {
                const selected = [...document.querySelectorAll('.service-chips input:checked')].map(cb => cb.value);
                if (selected.length === 0) return alert('Please select at least one service.');

                const costPerService = selected.length > 1
                    ? (parseFloat(cost) / selected.length).toFixed(2)
                    : cost;

                selected.forEach(type => {
                    const data = { carId, type, date, cost: costPerService, mileage, notes };
                    if (type === 'Oil Change') {
                        this._handleOilReminder(data);
                    } else if (mileage && car) {
                        Recommendations.createReminderFromService(car, type, mileage, date);
                    }
                    Storage.addService(data);
                });
            }

            this.closeModal();
            this.renderPage(this.currentPage);
        });
    },

    _handleOilReminder(data) {
        const interval = document.querySelector('input[name="oil-interval"]:checked');
        data.oilInterval = interval ? interval.value : '5000';

        if (data.mileage) {
            const nextMileage = parseInt(data.mileage) + parseInt(data.oilInterval);
            const existingReminders = Storage.getReminders(data.carId)
                .filter(r => r.type === 'Oil Change' && !r.completed && r.autoCreated);
            existingReminders.forEach(r => Storage.deleteReminder(r.id));

            const oilLabels = { '5000': 'Regular', '7000': 'Semi-synthetic', '10000': 'Full synthetic' };
            Storage.addReminder({
                carId: data.carId,
                type: 'Oil Change',
                dueDate: this._estimateNextDate(data.date, data.mileage, data.oilInterval),
                dueMileage: nextMileage.toString(),
                notes: `Auto-created: next oil change at ${nextMileage.toLocaleString()} km (${oilLabels[data.oilInterval]} oil)`,
                completed: false,
                autoCreated: true,
            });
        }
    },

    openCustomRecModal(carId) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const types = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs', 'Alignment', 'Other'];
        const html = `
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Add a custom maintenance interval for <strong>${car.make} ${car.model}</strong>. This overrides any manufacturer recommendation.</p>
            <div class="form-group">
                <label>Service Type</label>
                <select id="f-rec-type">
                    ${types.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Interval (km)</label>
                    <input type="number" id="f-rec-km" placeholder="e.g. 15000">
                </div>
                <div class="form-group">
                    <label>Interval (months)</label>
                    <input type="number" id="f-rec-months" placeholder="e.g. 12">
                </div>
            </div>
            <div class="form-group">
                <label>Note</label>
                <input type="text" id="f-rec-note" placeholder="e.g. Per dealer recommendation">
            </div>
        `;
        this.openModal('Custom Maintenance Schedule', html, () => {
            const type = document.getElementById('f-rec-type').value;
            const km = parseInt(document.getElementById('f-rec-km').value);
            const months = parseInt(document.getElementById('f-rec-months').value) || 12;
            const note = document.getElementById('f-rec-note').value.trim() || 'Custom recommendation';
            if (!km || km <= 0) return alert('Please enter a valid km interval.');
            Recommendations.saveCustom(carId, type, km, months, note);
            this.closeModal();
            this.renderPage(this.currentPage);
        });
    },

    _estimateNextDate(serviceDate, currentMileage, interval) {
        const avgDailyKm = 40;
        const daysUntilNext = Math.round(parseInt(interval) / avgDailyKm);
        const date = new Date(serviceDate);
        date.setDate(date.getDate() + daysUntilNext);
        return date.toISOString().split('T')[0];
    },

    openReminderModal(reminder = null) {
        const cars = Storage.getCars();
        if (cars.length === 0) return alert('Please add a car first.');
        const types = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Registration Renewal', 'Insurance Renewal', 'Inspection', 'Other'];
        const html = `
            <div class="form-group">
                <label>Car</label>
                <select id="f-car">
                    ${cars.map(c => `<option value="${c.id}" ${reminder && reminder.carId === c.id ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Reminder For</label>
                <select id="f-type">
                    ${types.map(t => `<option value="${t}" ${reminder && reminder.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Due Date</label>
                    <input type="date" id="f-duedate" value="${reminder ? reminder.dueDate : ''}">
                </div>
                <div class="form-group">
                    <label>Due Mileage (km)</label>
                    <input type="number" id="f-duemileage" placeholder="Optional" value="${reminder ? reminder.dueMileage || '' : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Notes</label>
                <textarea id="f-rnotes" rows="2" placeholder="Optional notes...">${reminder ? reminder.notes || '' : ''}</textarea>
            </div>
        `;
        this.openModal(reminder ? 'Edit Reminder' : 'Add Reminder', html, () => {
            const data = {
                carId: document.getElementById('f-car').value,
                type: document.getElementById('f-type').value,
                dueDate: document.getElementById('f-duedate').value,
                dueMileage: document.getElementById('f-duemileage').value,
                notes: document.getElementById('f-rnotes').value.trim(),
                completed: reminder ? reminder.completed : false,
            };
            if (!data.dueDate) return alert('Please select a due date.');
            if (reminder) {
                Storage.updateReminder(reminder.id, data);
            } else {
                Storage.addReminder(data);
            }
            this.closeModal();
            this.renderPage(this.currentPage);
        });
    },

    // --- Render: Dashboard ---
    renderDashboard() {
        const carId = this.selectedCarId;
        const cars = Storage.getCars();
        const services = Storage.getServices(carId);
        const reminders = Storage.getUpcomingReminders(carId);
        const total = Storage.getTotalExpenses(carId);

        document.getElementById('stat-cars').textContent = cars.length;
        document.getElementById('stat-services').textContent = services.length;
        document.getElementById('stat-expenses').textContent = total.toFixed(2) + ' SAR';
        document.getElementById('stat-reminders').textContent = reminders.length;

        const recentEl = document.getElementById('recent-services');
        const recent = services.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        if (recent.length === 0) {
            recentEl.innerHTML = '<p class="empty-state">No services recorded yet</p>';
        } else {
            recentEl.innerHTML = recent.map(s => {
                const car = cars.find(c => c.id === s.carId);
                const carName = car ? `${car.make} ${car.model}` : 'Unknown';
                return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                    <div><strong>${s.type}</strong><br><small style="color:var(--text-secondary)">${carName} &middot; ${s.date}</small></div>
                    <div style="font-weight:600">${parseFloat(s.cost || 0).toFixed(2)} SAR</div>
                </div>`;
            }).join('');
        }

        const remEl = document.getElementById('upcoming-reminders');
        if (reminders.length === 0) {
            remEl.innerHTML = '<p class="empty-state">No upcoming reminders</p>';
        } else {
            remEl.innerHTML = reminders.slice(0, 5).map(r => {
                const car = cars.find(c => c.id === r.carId);
                const carName = car ? `${car.make} ${car.model}` : 'Unknown';
                const days = Math.ceil((new Date(r.dueDate) - new Date()) / 86400000);
                let badge = 'badge-blue';
                if (days < 0) badge = 'badge-red';
                else if (days <= 7) badge = 'badge-orange';
                const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `In ${days}d`;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                    <div><strong>${r.type}</strong><br><small style="color:var(--text-secondary)">${carName}</small></div>
                    <span class="badge ${badge}">${label}</span>
                </div>`;
            }).join('');
        }
    },

    // --- Render: Cars ---
    renderCars() {
        const cars = Storage.getCars();
        const el = document.getElementById('cars-list');
        if (cars.length === 0) {
            el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">&#128663;</span><p class="empty-state-text">No cars added yet</p><button class="btn btn-primary" onclick="App.openCarModal()">+ Add Your First Car</button></div>`;
            return;
        }
        el.innerHTML = cars.map(c => {
            const serviceCount = Storage.getServices(c.id).length;
            const totalCost = Storage.getTotalExpenses(c.id);
            const recs = Recommendations.getAllForCar(c);
            const hasRecs = Object.keys(recs).length > 0;
            const services = Storage.getServices(c.id);
            const currentMileage = parseInt(c.mileage) || 0;

            let recsHTML = '';
            if (hasRecs) {
                recsHTML = `<div class="car-recs">
                    <div class="car-recs-title">Maintenance Schedule</div>
                    ${Object.entries(recs).map(([type, rec]) => {
                        const lastService = services
                            .filter(s => s.type === type)
                            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                        const lastKm = lastService ? parseInt(lastService.mileage) || 0 : 0;
                        const nextKm = lastKm > 0 ? lastKm + rec.km : currentMileage + rec.km;
                        const remaining = nextKm - currentMileage;
                        let statusBadge = '';
                        if (remaining <= 0) {
                            statusBadge = '<span class="badge badge-red">Overdue</span>';
                        } else if (remaining <= 1000) {
                            statusBadge = '<span class="badge badge-orange">Soon</span>';
                        } else {
                            statusBadge = '<span class="badge badge-green">OK</span>';
                        }
                        const sourceIcon = rec.source === 'custom' ? '&#9998;' : '&#9881;';
                        return `<div class="rec-row">
                            <div class="rec-info">
                                <span class="rec-type">${type}</span>
                                <span class="rec-detail">Every ${rec.km.toLocaleString()} km &middot; <span title="${rec.note}">${sourceIcon} ${rec.note}</span></span>
                            </div>
                            <div class="rec-status">
                                ${statusBadge}
                                <span class="rec-next">${remaining > 0 ? remaining.toLocaleString() + ' km left' : Math.abs(remaining).toLocaleString() + ' km overdue'}</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            } else {
                recsHTML = `<div class="car-recs"><div class="car-recs-title">Maintenance Schedule</div><p style="font-size:13px;color:var(--text-secondary);padding:8px 0;">No manufacturer data for ${c.make} ${c.model}. <a href="#" onclick="event.preventDefault();App.openCustomRecModal('${c.id}')">Add custom schedule</a></p></div>`;
            }

            return `<div class="car-card">
                <div class="car-card-header">
                    <div>
                        <div class="car-card-name">${c.make} ${c.model}</div>
                        <div class="car-card-year">${c.year}</div>
                    </div>
                    <span class="badge badge-blue">${c.color || ''}</span>
                </div>
                <div class="car-card-details">
                    <div class="car-detail"><span>Mileage</span><span>${c.mileage ? parseInt(c.mileage).toLocaleString() + ' km' : '-'}</span></div>
                    <div class="car-detail"><span>Plate</span><span>${c.plate || '-'}</span></div>
                    <div class="car-detail"><span>Services</span><span>${serviceCount}</span></div>
                    <div class="car-detail"><span>Total Spent</span><span>${totalCost.toFixed(2)} SAR</span></div>
                </div>
                ${recsHTML}
                <div class="car-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.openCarModal(Storage.getCars().find(c=>c.id==='${c.id}'))">Edit</button>
                    ${hasRecs ? `<button class="btn btn-secondary btn-sm" onclick="App.openCustomRecModal('${c.id}')">+ Custom</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete this car and all its records?')){Storage.deleteCar('${c.id}');App.renderPage(App.currentPage);}">Delete</button>
                </div>
            </div>`;
        }).join('');
    },

    // --- Render: Services ---
    renderServices() {
        const carId = this.selectedCarId;
        const services = Storage.getServices(carId).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cars = Storage.getCars();
        const el = document.getElementById('services-list');

        if (services.length === 0) {
            el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">&#128295;</span><p class="empty-state-text">No services recorded yet</p></div>`;
            return;
        }

        el.innerHTML = `<table>
            <thead><tr><th>Date</th><th>Car</th><th>Service</th><th>Mileage</th><th>Cost</th><th>Actions</th></tr></thead>
            <tbody>${services.map(s => {
                const car = cars.find(c => c.id === s.carId);
                const carName = car ? `${car.year} ${car.make} ${car.model}` : 'Unknown';
                return `<tr>
                    <td>${s.date}</td>
                    <td>${carName}</td>
                    <td><span class="badge badge-green">${s.type}</span></td>
                    <td>${s.mileage ? parseInt(s.mileage).toLocaleString() + ' km' : '-'}</td>
                    <td><strong>${parseFloat(s.cost || 0).toFixed(2)} SAR</strong></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="App.openServiceModal(Storage.getServices().find(x=>x.id==='${s.id}'))">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteService('${s.id}');App.renderPage(App.currentPage);}">Del</button>
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    },

    // --- Render: Expenses ---
    renderExpenses() {
        const carId = this.selectedCarId;
        const services = Storage.getServices(carId).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cars = Storage.getCars();

        const monthlyData = {};
        services.forEach(s => {
            const month = s.date ? s.date.substring(0, 7) : 'Unknown';
            monthlyData[month] = (monthlyData[month] || 0) + (parseFloat(s.cost) || 0);
        });

        const months = Object.keys(monthlyData).sort().slice(-6);
        const maxVal = Math.max(...months.map(m => monthlyData[m]), 1);

        const summaryEl = document.getElementById('expenses-summary');
        const total = Storage.getTotalExpenses(carId);
        const avgMonthly = months.length ? total / months.length : 0;
        summaryEl.innerHTML = `
            <div class="stat-card"><div class="stat-icon green">&#128176;</div><div class="stat-info"><span class="stat-value">${total.toFixed(2)} SAR</span><span class="stat-label">Total Spent</span></div></div>
            <div class="stat-card"><div class="stat-icon blue">&#128197;</div><div class="stat-info"><span class="stat-value">${avgMonthly.toFixed(2)} SAR</span><span class="stat-label">Monthly Avg</span></div></div>
            <div class="stat-card"><div class="stat-icon orange">&#128295;</div><div class="stat-info"><span class="stat-value">${services.length}</span><span class="stat-label">Total Services</span></div></div>
        `;

        const listEl = document.getElementById('expenses-list');

        let chartHTML = '';
        if (months.length > 0) {
            chartHTML = `<div class="chart-container"><h3 style="margin-bottom:16px;font-size:16px;">Monthly Expenses</h3><div class="bar-chart">${months.map(m => {
                const pct = (monthlyData[m] / maxVal) * 100;
                return `<div class="bar-group"><span class="bar-value">${monthlyData[m].toFixed(0)} SAR</span><div class="bar" style="height:${Math.max(pct, 3)}%"></div><span class="bar-label">${m.substring(5)}</span></div>`;
            }).join('')}</div></div>`;
        }

        if (services.length === 0) {
            listEl.innerHTML = chartHTML + `<div class="empty-state"><span class="empty-state-icon">&#128176;</span><p class="empty-state-text">No expenses recorded yet</p></div>`;
            return;
        }

        listEl.innerHTML = chartHTML + `<table>
            <thead><tr><th>Date</th><th>Car</th><th>Service</th><th>Cost</th><th>Notes</th></tr></thead>
            <tbody>${services.map(s => {
                const car = cars.find(c => c.id === s.carId);
                const carName = car ? `${car.make} ${car.model}` : 'Unknown';
                return `<tr><td>${s.date}</td><td>${carName}</td><td>${s.type}</td><td><strong>${parseFloat(s.cost || 0).toFixed(2)} SAR</strong></td><td>${s.notes || '-'}</td></tr>`;
            }).join('')}</tbody>
        </table>`;
    },

    // --- Render: Reminders ---
    renderReminders() {
        const carId = this.selectedCarId;
        const reminders = Storage.getReminders(carId).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const cars = Storage.getCars();
        const el = document.getElementById('reminders-list');

        if (reminders.length === 0) {
            el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">&#128276;</span><p class="empty-state-text">No reminders set</p></div>`;
            return;
        }

        el.innerHTML = reminders.map(r => {
            const car = cars.find(c => c.id === r.carId);
            const carName = car ? `${car.year} ${car.make} ${car.model}` : 'Unknown';
            const days = Math.ceil((new Date(r.dueDate) - new Date()) / 86400000);
            let statusClass = '';
            let statusLabel = '';
            if (r.completed) {
                statusClass = '';
                statusLabel = '<span class="badge badge-green">Completed</span>';
            } else if (days < 0) {
                statusClass = 'overdue';
                statusLabel = `<span class="badge badge-red">${Math.abs(days)} days overdue</span>`;
            } else if (days <= 7) {
                statusClass = 'soon';
                statusLabel = `<span class="badge badge-orange">${days === 0 ? 'Due today' : `Due in ${days} days`}</span>`;
            } else {
                statusLabel = `<span class="badge badge-blue">Due in ${days} days</span>`;
            }

            return `<div class="reminder-card ${statusClass}">
                <div class="reminder-card-header">
                    <span class="reminder-card-title">${r.type}</span>
                    ${statusLabel}
                </div>
                <div class="reminder-card-car">${carName}</div>
                <div class="reminder-card-date">Due: ${r.dueDate}${r.dueMileage ? ` or at ${parseInt(r.dueMileage).toLocaleString()} km` : ''}</div>
                ${r.notes ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${r.notes}</div>` : ''}
                <div class="reminder-card-actions">
                    ${!r.completed ? `<button class="btn btn-primary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:true});App.renderPage(App.currentPage);">Mark Done</button>` : `<button class="btn btn-secondary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:false});App.renderPage(App.currentPage);">Undo</button>`}
                    <button class="btn btn-secondary btn-sm" onclick="App.openReminderModal(Storage.getReminders().find(x=>x.id==='${r.id}'))">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteReminder('${r.id}');App.renderPage(App.currentPage);}">Delete</button>
                </div>
            </div>`;
        }).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
