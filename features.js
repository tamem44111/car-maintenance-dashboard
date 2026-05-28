// ═══════════════════════════════════════════
// FEATURES.JS — Export/Import, Analytics, Quick-Add, Tire, Mechanic, Climate
// ═══════════════════════════════════════════

const Features = {

    // ── Export/Import ──
    exportData() {
        const data = Storage.getAll();
        const custom = localStorage.getItem('autocare_custom_recs');
        const blob = new Blob([JSON.stringify({ ...data, customRecs: custom ? JSON.parse(custom) : {} }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `autocare-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click(); URL.revokeObjectURL(url);
    },

    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.cars && data.services && data.reminders) {
                    const existing = Storage.getAll();
                    const merge = confirm('Merge with existing data? (Cancel = Replace all)');
                    if (merge) {
                        const ids = new Set(existing.cars.map(c => c.id));
                        data.cars.forEach(c => { if (!ids.has(c.id)) existing.cars.push(c); });
                        const sids = new Set(existing.services.map(s => s.id));
                        data.services.forEach(s => { if (!sids.has(s.id)) existing.services.push(s); });
                        const rids = new Set(existing.reminders.map(r => r.id));
                        data.reminders.forEach(r => { if (!rids.has(r.id)) existing.reminders.push(r); });
                        if (data.fuelLogs) {
                            const fids = new Set((existing.fuelLogs || []).map(f => f.id));
                            data.fuelLogs.forEach(f => { if (!fids.has(f.id)) existing.fuelLogs.push(f); });
                        }
                        Storage.save(existing);
                    } else {
                        Storage.save({ cars: data.cars, services: data.services, reminders: data.reminders, fuelLogs: data.fuelLogs || [] });
                    }
                    if (data.customRecs) localStorage.setItem('autocare_custom_recs', JSON.stringify(data.customRecs));
                    alert('Data imported successfully!');
                    App.renderPage(App.currentPage);
                } else { alert('Invalid backup file.'); }
            } catch (err) { alert('Error reading file: ' + err.message); }
        };
        reader.readAsText(file);
    },

    // ── Analytics ──
    renderAnalytics(carId) {
        const el = document.getElementById('analytics-section');
        if (!el) return;
        const cars = Storage.getCars();
        if (cars.length === 0) { el.innerHTML = ''; return; }

        const svcTotal = Storage.getServiceExpenses(carId);
        const fuelTotal = Storage.getFuelExpenses(carId);
        const grand = svcTotal + fuelTotal;

        // Expense breakdown pie
        const services = Storage.getServices(carId);
        const byType = {};
        services.forEach(s => { byType[s.type] = (byType[s.type] || 0) + (parseFloat(s.cost) || 0); });
        if (fuelTotal > 0) byType['Fuel'] = fuelTotal;

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
        const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, e) => s + e[1], 0) || 1;

        let pieHTML = '';
        if (entries.length > 0 && total > 0) {
            let cumPct = 0;
            const segments = entries.map(([type, cost], i) => {
                const pct = (cost / total) * 100;
                const start = cumPct;
                cumPct += pct;
                return { type, cost, pct, color: colors[i % colors.length], start };
            });

            const gradientStops = segments.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

            pieHTML = `<div class="analytics-row">
                <div class="card" style="flex:1">
                    <h3>Expense Breakdown</h3>
                    <div class="pie-container">
                        <div class="pie-chart" style="background:conic-gradient(${gradientStops})"></div>
                        <div class="pie-legend">${segments.map(s => `<div class="pie-item"><span class="pie-dot" style="background:${s.color}"></span><span class="pie-label">${s.type}</span><span class="pie-val">${s.cost.toFixed(0)} SAR (${s.pct.toFixed(0)}%)</span></div>`).join('')}</div>
                    </div>
                </div>
                ${cars.length > 1 ? `<div class="card" style="flex:1"><h3>Cost per Car</h3><div class="car-compare">${cars.map((c, i) => {
                    const ct = Storage.getTotalExpenses(c.id);
                    const maxCost = Math.max(...cars.map(cc => Storage.getTotalExpenses(cc.id)), 1);
                    return `<div class="compare-row"><span class="compare-name">${c.make} ${c.model}</span><div class="compare-bar-wrap"><div class="compare-bar" style="width:${(ct/maxCost)*100}%;background:${colors[i%colors.length]}"></div></div><span class="compare-val">${ct.toFixed(0)} SAR</span></div>`;
                }).join('')}</div></div>` : ''}
            </div>`;
        }

        // Driving pattern
        let driveHTML = '';
        const fuelLogs = Storage.getFuelLogs(carId).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (fuelLogs.length >= 2) {
            const first = fuelLogs[0], last = fuelLogs[fuelLogs.length - 1];
            const days = Math.max(1, (new Date(last.date) - new Date(first.date)) / 86400000);
            const totalKm = parseInt(last.odometer) - parseInt(first.odometer);
            const kmPerDay = (totalKm / days).toFixed(1);
            const kmPerMonth = (kmPerDay * 30).toFixed(0);
            driveHTML = `<div class="analytics-row"><div class="card" style="flex:1"><h3>Driving Pattern</h3><div class="drive-stats"><div class="drive-stat"><span class="drive-val">${kmPerDay}</span><span class="drive-label">km/day</span></div><div class="drive-stat"><span class="drive-val">${kmPerMonth}</span><span class="drive-label">km/month</span></div><div class="drive-stat"><span class="drive-val">${(kmPerDay * 365).toFixed(0)}</span><span class="drive-label">km/year (est)</span></div></div></div></div>`;
        }

        el.innerHTML = pieHTML + driveHTML;
    },

    // ── Quick Actions ──
    renderQuickActions() {
        const el = document.getElementById('quick-actions');
        if (!el) return;
        const cars = Storage.getCars();
        if (!cars.length) { el.innerHTML = ''; return; }
        el.innerHTML = `<div class="quick-bar">
            <button class="quick-btn" onclick="App.openFuelModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/><path d="M13 10h2a2 2 0 012 2v3a2 2 0 002 2v0a2 2 0 002-2V8l-3-3" stroke="currentColor" stroke-width="2" fill="none"/></svg> Quick Fuel</button>
            <button class="quick-btn" onclick="App.openServiceModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a5 5 0 01-7 7l-7.4 7.4a2.1 2.1 0 01-3-3L10.7 10.3a5 5 0 017-7l-3 3z" stroke="currentColor" stroke-width="2" fill="none"/></svg> Quick Service</button>
            <button class="quick-btn" onclick="App.openReminderModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none"/></svg> Add Reminder</button>
            <button class="quick-btn" onclick="Features.showSettingsModal()"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Settings</button>
        </div>`;
    },

    // ── Settings Modal ──
    showSettingsModal() {
        const climate = localStorage.getItem('autocare_climate') || 'normal';
        const html = `
            <div class="form-group">
                <label>Driving Climate</label>
                <select id="f-climate">
                    <option value="normal" ${climate === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="severe" ${climate === 'severe' ? 'selected' : ''}>Severe (Hot climate / Saudi Arabia)</option>
                </select>
                <small style="color:var(--text3);display:block;margin-top:4px">Severe climate reduces recommended intervals by 20% (heat accelerates wear)</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>Data Management</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                    <button class="btn btn-primary btn-sm" onclick="Features.exportData()">Export Backup</button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">Import Backup</button>
                    <input type="file" id="import-file" accept=".json" style="display:none" onchange="Features.importData(this.files[0])">
                </div>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>Notifications</label>
                <button class="btn btn-secondary btn-sm" id="btn-notif" onclick="Features.requestNotifications()">Enable Browser Notifications</button>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>Mechanics & Shops</label>
                <div id="mechanics-list" style="margin-bottom:8px">${Features.renderMechanicsList()}</div>
                <button class="btn btn-secondary btn-sm" onclick="Features.addMechanicRow()">+ Add Mechanic</button>
            </div>`;
        App.openModal('Settings', html, () => {
            const cl = document.getElementById('f-climate').value;
            localStorage.setItem('autocare_climate', cl);
            Features.saveMechanics();
            App.closeModal();
            App.renderPage(App.currentPage);
        });
    },

    // ── Notifications ──
    requestNotifications() {
        if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                alert('Notifications enabled! You will be reminded about upcoming services.');
                Features.scheduleNotifications();
            }
        });
    },

    scheduleNotifications() {
        if (Notification.permission !== 'granted') return;
        const reminders = Storage.getUpcomingReminders('all');
        const now = new Date();
        reminders.forEach(r => {
            const due = new Date(r.dueDate);
            const diff = due - now;
            if (diff > 0 && diff < 7 * 86400000) {
                const days = Math.ceil(diff / 86400000);
                setTimeout(() => {
                    new Notification('AutoCare Reminder', { body: `${r.type} is due in ${days} day(s)!`, icon: '/icon-192.png' });
                }, Math.min(diff, 5000));
            }
        });
    },

    // ── Mechanics ──
    getMechanics() {
        const raw = localStorage.getItem('autocare_mechanics');
        return raw ? JSON.parse(raw) : [];
    },

    renderMechanicsList() {
        const mechs = this.getMechanics();
        if (!mechs.length) return '<p style="font-size:12px;color:var(--text3)">No saved mechanics yet.</p>';
        return mechs.map((m, i) => `<div class="mechanic-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
            <input type="text" class="mech-name" value="${m.name}" placeholder="Name" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-phone" value="${m.phone}" placeholder="Phone" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-specialty" value="${m.specialty || ''}" placeholder="Specialty" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">X</button>
        </div>`).join('');
    },

    addMechanicRow() {
        const list = document.getElementById('mechanics-list');
        const row = document.createElement('div');
        row.className = 'mechanic-row';
        row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
        row.innerHTML = `<input type="text" class="mech-name" placeholder="Name" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-phone" placeholder="Phone" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-specialty" placeholder="Specialty" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">X</button>`;
        list.appendChild(row);
    },

    saveMechanics() {
        const rows = document.querySelectorAll('.mechanic-row');
        const mechs = [];
        rows.forEach(r => {
            const name = r.querySelector('.mech-name')?.value.trim();
            const phone = r.querySelector('.mech-phone')?.value.trim();
            const specialty = r.querySelector('.mech-specialty')?.value.trim();
            if (name) mechs.push({ name, phone, specialty });
        });
        localStorage.setItem('autocare_mechanics', JSON.stringify(mechs));
    },

    // ── Climate Adjustment ──
    getClimateMultiplier() {
        const climate = localStorage.getItem('autocare_climate') || 'normal';
        return climate === 'severe' ? 0.8 : 1.0;
    },

    // ── Tire Tracking ──
    openTireModal(carId) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const tires = car.tires || { brand: '', size: '', installedDate: '', installedMileage: '', pattern: 'cross' };
        const html = `
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">Tire information for <strong>${car.make} ${car.model}</strong></p>
            <div class="form-row">
                <div class="form-group"><label>Tire Brand</label><input type="text" id="f-tire-brand" placeholder="e.g. Michelin" value="${tires.brand}"></div>
                <div class="form-group"><label>Tire Size</label><input type="text" id="f-tire-size" placeholder="e.g. 215/55R17" value="${tires.size}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Installed Date</label><input type="date" id="f-tire-date" value="${tires.installedDate}"></div>
                <div class="form-group"><label>Installed at (km)</label><input type="number" id="f-tire-km" placeholder="45000" value="${tires.installedMileage}"></div>
            </div>
            <div class="form-group">
                <label>Rotation Pattern</label>
                <select id="f-tire-pattern">
                    <option value="cross" ${tires.pattern === 'cross' ? 'selected' : ''}>Cross pattern (FL&#8596;RR, FR&#8596;RL)</option>
                    <option value="forward" ${tires.pattern === 'forward' ? 'selected' : ''}>Forward cross (front to rear)</option>
                    <option value="rearward" ${tires.pattern === 'rearward' ? 'selected' : ''}>Rearward cross (rear to front)</option>
                    <option value="side" ${tires.pattern === 'side' ? 'selected' : ''}>Side to side (left&#8596;right)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Warranty (km)</label>
                <input type="number" id="f-tire-warranty" placeholder="e.g. 80000" value="${tires.warrantyKm || ''}">
            </div>`;
        App.openModal('Tire Information', html, () => {
            const data = {
                brand: document.getElementById('f-tire-brand').value.trim(),
                size: document.getElementById('f-tire-size').value.trim(),
                installedDate: document.getElementById('f-tire-date').value,
                installedMileage: document.getElementById('f-tire-km').value,
                pattern: document.getElementById('f-tire-pattern').value,
                warrantyKm: document.getElementById('f-tire-warranty').value,
            };
            Storage.updateCar(carId, { tires: data });
            App.closeModal();
            App.renderPage(App.currentPage);
        });
    }
};
