// ═══════════════════════════════════════════
// FEATURES.JS — Export/Import, Analytics, Quick-Add, Tire, Mechanic, Climate
// ═══════════════════════════════════════════

const Features = {

    // ── Export/Import ──
    exportData() {
        const data = Storage.getAll();
        const custom = localStorage.getItem('autocare_custom_recs');
        // Receipt photos live in IndexedDB, so pull them in or a restore would lose them
        const ids = Storage.getBills('all').map(b => b.photoId).filter(Boolean);
        Promise.all(ids.map(id => Photos.get(id).then(d => [id, d]).catch(() => [id, null])))
            .then(pairs => {
                const photos = {};
                pairs.forEach(([id, d]) => { if (d) photos[id] = d; });
                const payload = { ...data, customRecs: custom ? JSON.parse(custom) : {}, photos };
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `autocare-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch(() => alert('Could not build the backup file.'));
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
                        if (data.odometerLogs) {
                            if (!existing.odometerLogs) existing.odometerLogs = [];
                            const oids = new Set(existing.odometerLogs.map(o => o.id));
                            data.odometerLogs.forEach(o => { if (!oids.has(o.id)) existing.odometerLogs.push(o); });
                        }
                        Storage.save(existing);
                    } else {
                        Storage.save({ cars: data.cars, services: data.services, reminders: data.reminders, fuelLogs: data.fuelLogs || [], odometerLogs: data.odometerLogs || [] });
                    }
                    if (data.customRecs) localStorage.setItem('autocare_custom_recs', JSON.stringify(data.customRecs));
                    if (data.photos) {
                        Object.entries(data.photos).forEach(([id, d]) => { if (d) Photos.put(id, d).catch(() => {}); });
                    }
                    alert('Data imported successfully!');
                    App.renderPage(App.currentPage);
                } else { alert('Invalid backup file.'); }
            } catch (err) { alert('Error reading file: ' + err.message); }
        };
        reader.readAsText(file);
    },

    // ── Bills & Receipts ──
    BILL_KINDS: ['Parts', 'Labour', 'Other'],

    // Small indicator in the services table
    billsCell(service) {
        const bills = service.bills || [];
        if (!bills.length) return '<span class="bill-none">No bill</span>';
        const withPhoto = bills.filter(b => b.photoId).length;
        return `<span class="bill-count">${bills.length}</span>${withPhoto ? `<span class="bill-cam" title="${withPhoto} receipt photo(s)">&#128247;</span>` : ''}`;
    },

    _billRowHTML(b) {
        b = b || {};
        const rid = 'br_' + Math.random().toString(36).slice(2, 8);
        return `<div class="bill-row" data-photo="${b.photoId || ''}">
            <div class="bill-line bill-line-1">
                <select class="bill-kind">${this.BILL_KINDS.map(k => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
                <input type="text" class="bill-label" placeholder="What is it for? e.g. Spark plugs" value="${(b.label || '').replace(/"/g, '&quot;')}">
                <input type="number" class="bill-amount" placeholder="0" step="0.01" value="${b.amount || ''}" oninput="Features.recalcBillTotal()">
                <button type="button" class="bill-del" title="Remove this bill" onclick="Features.removeBillRow(this)">&times;</button>
            </div>
            <div class="bill-line bill-line-2">
                <input type="text" class="bill-vendor" placeholder="Shop / store name" value="${(b.vendor || '').replace(/"/g, '&quot;')}">
                <input type="number" class="bill-wmonths" placeholder="Warranty months" value="${b.warrantyMonths || ''}">
                <input type="number" class="bill-wkm" placeholder="Warranty km" value="${b.warrantyKm || ''}">
            </div>
            <div class="bill-line bill-line-3">
                <input type="file" id="${rid}" accept="image/*" style="display:none" onchange="Features.pickBillPhoto(this)">
                <button type="button" class="bill-photo-btn" onclick="document.getElementById('${rid}').click()">${b.photoId ? 'Replace receipt' : 'Attach receipt'}</button>
                <span class="bill-photo-state">${b.photoId ? '<span class="bill-photo-ok">Receipt attached</span>' : ''}</span>
                ${b.photoId ? `<button type="button" class="bill-photo-view" onclick="Photos.view('${b.photoId}')">View</button>` : ''}
            </div>
        </div>`;
    },

    renderBillsEditor(bills) {
        const rows = (bills || []).map(b => this._billRowHTML(b)).join('');
        return `<div class="bills-block">
            <div class="bills-head">
                <span class="bills-title">Bills &amp; Receipts</span>
                <button type="button" class="btn btn-secondary btn-sm" onclick="Features.addBillRow()">+ Add Bill</button>
            </div>
            <p class="bills-hint">Add one row per bill — parts from one shop, labour from another. Leave this empty and just type the cost below if you have no bill.</p>
            <div id="bills-list">${rows}</div>
            <div id="bills-total" class="bills-total"></div>
        </div>`;
    },

    addBillRow() {
        const list = document.getElementById('bills-list');
        if (!list) return;
        list.insertAdjacentHTML('beforeend', this._billRowHTML({}));
        this.recalcBillTotal();
    },

    removeBillRow(btn) {
        const row = btn.closest('.bill-row');
        const pid = row.getAttribute('data-photo');
        if (pid) Photos.remove(pid).catch(() => {});
        row.remove();
        this.recalcBillTotal();
    },

    pickBillPhoto(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const row = input.closest('.bill-row');
        const state = row.querySelector('.bill-photo-state');
        state.innerHTML = '<span class="bill-photo-working">Compressing…</span>';
        const old = row.getAttribute('data-photo');
        Photos.save(file).then(id => {
            if (old) Photos.remove(old).catch(() => {});
            row.setAttribute('data-photo', id);
            state.innerHTML = '<span class="bill-photo-ok">Receipt attached</span>';
            row.querySelector('.bill-photo-btn').textContent = 'Replace receipt';
            let viewBtn = row.querySelector('.bill-photo-view');
            if (!viewBtn) {
                row.querySelector('.bill-line-3').insertAdjacentHTML('beforeend',
                    `<button type="button" class="bill-photo-view" onclick="Photos.view('${id}')">View</button>`);
            } else {
                viewBtn.setAttribute('onclick', `Photos.view('${id}')`);
            }
        }).catch(err => {
            state.innerHTML = `<span class="bill-photo-err">${err.message}</span>`;
        });
        input.value = '';
    },

    collectBills(startKm) {
        // A km warranty is measured from the odometer at purchase. If the service has
        // no mileage typed in, fall back to the car's current reading.
        if (!startKm) {
            const sel = document.getElementById('f-car');
            const car = sel ? Storage.getCars().find(c => c.id === sel.value) : null;
            if (car) startKm = String(Storage.getEffectiveMileage(car) || '');
        }
        const out = [];
        document.querySelectorAll('#bills-list .bill-row').forEach(row => {
            const amount = row.querySelector('.bill-amount').value;
            const label = row.querySelector('.bill-label').value.trim();
            const vendor = row.querySelector('.bill-vendor').value.trim();
            const wm = row.querySelector('.bill-wmonths').value;
            const wk = row.querySelector('.bill-wkm').value;
            const photoId = row.getAttribute('data-photo') || '';
            // keep a row only if it carries something meaningful
            if (!amount && !label && !vendor && !photoId) return;
            out.push({
                id: 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                kind: row.querySelector('.bill-kind').value,
                label, vendor, photoId,
                amount: amount || '0',
                warrantyMonths: wm || '',
                warrantyKm: wk || '',
                startKm: startKm || '',
                date: document.getElementById('f-date') ? document.getElementById('f-date').value : ''
            });
        });
        return out;
    },

    recalcBillTotal() {
        const el = document.getElementById('bills-total');
        if (!el) return;
        const rows = document.querySelectorAll('#bills-list .bill-row');
        let total = 0, n = 0;
        rows.forEach(r => { const v = parseFloat(r.querySelector('.bill-amount').value); if (!isNaN(v)) { total += v; n++; } });
        const costField = document.getElementById('f-cost');
        const note = document.getElementById('cost-note');
        if (rows.length) {
            el.innerHTML = `<span>Total from ${rows.length} bill${rows.length > 1 ? 's' : ''}</span><strong>${total.toFixed(2)} SAR</strong>`;
            if (costField) { costField.value = total.toFixed(2); costField.readOnly = true; costField.classList.add('input-locked'); }
            if (note) note.textContent = 'Calculated from the bills above.';
        } else {
            el.innerHTML = '';
            if (costField) { costField.readOnly = false; costField.classList.remove('input-locked'); }
            if (note) note.textContent = 'No bill? Just type the amount you paid.';
        }
    },

    // Drop receipt photos no bill references any more
    cleanupPhotos() {
        if (typeof Photos === 'undefined') return;
        Photos.keys().then(keys => {
            const used = new Set(Storage.getBills('all').map(b => b.photoId).filter(Boolean));
            keys.forEach(k => { if (!used.has(k)) Photos.remove(k).catch(() => {}); });
        }).catch(() => {});
    },

    // ── Warranty Center ──
    renderWarrantyCenter() {
        const el = document.getElementById('warranty-list');
        if (!el) return;
        const cid = App.selectedCarId;
        const active = Storage.getActiveWarranties(cid);
        const expired = Storage.getExpiredWarranties(cid);

        if (!active.length && !expired.length) {
            el.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M32 8l18 8v16c0 11-8 19-18 24-10-5-18-13-18-24V16l18-8z" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M24 32l6 6 12-13" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="empty-state-text">No part warranties yet</p><p class="warranty-empty-hint">Add a bill to a service and give it a warranty in months or km — it will appear here.</p></div>`;
            return;
        }

        const card = ({ bill, car, warranty }) => {
            const clsMap = { expired: 'red', expiring: 'orange', unknown: 'blue', active: 'green' };
            const labelMap = { expired: 'Expired', expiring: 'Ending soon', unknown: 'Not tracked', active: 'Active' };
            const cls = clsMap[warranty.status] || 'green';
            const label = labelMap[warranty.status] || 'Active';
            const terms = [];
            if (warranty.months) terms.push(`${warranty.months} months`);
            if (warranty.km) terms.push(`${warranty.km.toLocaleString()} km`);
            return `<div class="warranty-card wc-${cls}">
                <div class="wc-head">
                    <div>
                        <div class="wc-title">${bill.label || bill.kind}</div>
                        <div class="wc-sub">${car ? car.make + ' ' + car.model : ''} &middot; ${bill.serviceType}</div>
                    </div>
                    <span class="badge badge-${cls}">${label}</span>
                </div>
                <div class="wc-remaining">${warranty.detail}</div>
                <div class="wc-meta">
                    <div class="wc-meta-row"><span>Shop</span><span>${bill.vendor || '—'}</span></div>
                    <div class="wc-meta-row"><span>Paid</span><span>${(parseFloat(bill.amount) || 0).toFixed(0)} SAR on ${bill.date || bill.serviceDate || '—'}</span></div>
                    <div class="wc-meta-row"><span>Cover</span><span>${terms.join(' or ') || '—'}</span></div>
                    ${warranty.expiryDate ? `<div class="wc-meta-row"><span>Until</span><span>${warranty.expiryDate}</span></div>` : ''}
                    ${warranty.endKm ? `<div class="wc-meta-row"><span>Or at</span><span>${warranty.endKm.toLocaleString()} km</span></div>` : ''}
                </div>
                <div class="wc-actions">
                    ${bill.photoId ? `<button class="btn btn-secondary btn-sm" onclick="Photos.view('${bill.photoId}')">View receipt</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="App.navigate('services');App.openServiceModal(Storage.getServices().find(x=>x.id==='${bill.serviceId}'))">${bill.photoId ? 'Edit' : 'Add receipt / edit'}</button>
                </div>
            </div>`;
        };

        el.innerHTML = `
            ${active.length ? `<div class="warranty-section-title">Still covered (${active.length})</div><div class="warranty-grid">${active.map(card).join('')}</div>` : ''}
            ${expired.length ? `<div class="warranty-section-title warranty-section-muted">Expired (${expired.length})</div><div class="warranty-grid">${expired.map(card).join('')}</div>` : ''}`;
    },

    // ── Odometer Update ──
    openOdometerModal(carId = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert('Please add a car first.');
        const target = carId || cars[0].id;

        const panel = (cid) => {
            const car = cars.find(c => c.id === cid);
            if (!car) return '';
            const proj = Storage.getProjectedMileage(car);
            const fresh = Storage.getOdometerFreshness(car);
            if (!proj.lastKm) return `<div class="odo-panel"><div class="odo-hint">No reading recorded yet — enter the number on your dashboard now.</div></div>`;
            const rateTxt = proj.rate ? `${proj.rate.toFixed(0)} km/day average` : 'not enough history to estimate yet';
            return `<div class="odo-panel">
                <div class="odo-row"><span>Last confirmed</span><strong>${proj.lastKm.toLocaleString()} km</strong></div>
                <div class="odo-row"><span>Recorded</span><strong>${proj.lastDate || '—'}${fresh.daysSince !== null ? ` (${fresh.daysSince}d ago)` : ''}</strong></div>
                ${proj.estimated ? `<div class="odo-row odo-est"><span>Estimated today</span><strong>~ ${proj.km.toLocaleString()} km</strong></div>` : ''}
                <div class="odo-hint">${rateTxt}</div>
            </div>`;
        };

        const html = `
            <p class="odo-intro">Enter the number shown on your car's dashboard. This keeps every km-based service reminder counting down accurately.</p>
            <div class="form-group"><label>Car</label>
                <select id="f-odo-car" onchange="Features._refreshOdoPanel()">
                    ${cars.map(c => `<option value="${c.id}" ${c.id === target ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('')}
                </select>
            </div>
            <div id="odo-panel-wrap">${panel(target)}</div>
            <div class="form-row">
                <div class="form-group"><label>Current Odometer (km)</label><input type="number" id="f-odo-km" placeholder="e.g. 62500" inputmode="numeric" oninput="Features._checkOdoInput()"></div>
                <div class="form-group"><label>Reading Date</label><input type="date" id="f-odo-date" value="${new Date().toISOString().split('T')[0]}"></div>
            </div>
            <div id="odo-warn"></div>`;

        App.openModal('Update Odometer', html, () => {
            const cid = document.getElementById('f-odo-car').value;
            const km = parseInt(document.getElementById('f-odo-km').value);
            const date = document.getElementById('f-odo-date').value;
            if (!km || km <= 0) return alert('Please enter a valid odometer reading.');
            if (!date) return alert('Please choose the reading date.');

            const car = Storage.getCars().find(c => c.id === cid);
            const last = Storage.getLastReading(car);
            if (last && km < last.km) {
                if (!confirm(`That is lower than your last recorded reading (${last.km.toLocaleString()} km).\n\nSave it anyway? Choose Cancel if it was a typo.`)) return;
            }
            Storage.logOdometer(cid, km, date);
            App.closeModal();
            App.renderPage(App.currentPage);
        });

        setTimeout(() => { const i = document.getElementById('f-odo-km'); if (i) i.focus(); }, 60);
    },

    // Live typo guard: flags a reading below the last confirmed one as you type
    _checkOdoInput() {
        const input = document.getElementById('f-odo-km');
        const warn = document.getElementById('odo-warn');
        if (!input || !warn) return;
        const cid = document.getElementById('f-odo-car').value;
        const car = Storage.getCars().find(c => c.id === cid);
        const last = car ? Storage.getLastReading(car) : null;
        const v = parseInt(input.value);
        if (last && v && v < last.km) {
            warn.innerHTML = `<div class="odo-warning">Lower than your last reading of ${last.km.toLocaleString()} km — double-check the number.</div>`;
        } else {
            warn.innerHTML = '';
        }
    },

    _refreshOdoPanel() {
        const cid = document.getElementById('f-odo-car').value;
        const cars = Storage.getCars();
        const car = cars.find(c => c.id === cid);
        const wrap = document.getElementById('odo-panel-wrap');
        if (!car || !wrap) return;
        const proj = Storage.getProjectedMileage(car);
        const fresh = Storage.getOdometerFreshness(car);
        if (!proj.lastKm) { wrap.innerHTML = `<div class="odo-panel"><div class="odo-hint">No reading recorded yet — enter the number on your dashboard now.</div></div>`; return; }
        const rateTxt = proj.rate ? `${proj.rate.toFixed(0)} km/day average` : 'not enough history to estimate yet';
        wrap.innerHTML = `<div class="odo-panel">
            <div class="odo-row"><span>Last confirmed</span><strong>${proj.lastKm.toLocaleString()} km</strong></div>
            <div class="odo-row"><span>Recorded</span><strong>${proj.lastDate || '—'}${fresh.daysSince !== null ? ` (${fresh.daysSince}d ago)` : ''}</strong></div>
            ${proj.estimated ? `<div class="odo-row odo-est"><span>Estimated today</span><strong>~ ${proj.km.toLocaleString()} km</strong></div>` : ''}
            <div class="odo-hint">${rateTxt}</div>
        </div>`;
        document.getElementById('odo-warn').innerHTML = '';
    },

    // ── Action Center (prioritized "do this now") ──
    renderActionCenter(carId) {
        const el = document.getElementById('action-center');
        if (!el) return;
        const cars = Storage.getCars().filter(c => carId === 'all' || c.id === carId);
        if (!cars.length) { el.innerHTML = ''; return; }

        const items = [];
        const today = new Date();
        const recTypes = ['Oil Change', 'Tire Rotation', 'Brake Inspection', 'Air Filter', 'Transmission', 'Coolant Flush', 'Battery', 'Spark Plugs'];

        cars.forEach(c => {
            const name = `${c.make} ${c.model}`;
            // Odometer freshness — km-based reminders are only as good as the last reading
            const fresh = Storage.getOdometerFreshness(c);
            if (fresh.never || fresh.daysSince === null) {
                items.push({ priority: 1, icon: 'gauge', title: 'Add an odometer reading', sub: `${name} · needed to track km-based services`, action: { label: 'Update', fn: `Features.openOdometerModal('${c.id}')` } });
            } else if (fresh.stale) {
                items.push({ priority: fresh.daysSince >= 60 ? 1 : 2, icon: 'gauge', title: `Odometer not updated in ${fresh.daysSince} days`, sub: `${name} · last read ${fresh.lastKm.toLocaleString()} km on ${fresh.lastDate}`, action: { label: 'Update', fn: `Features.openOdometerModal('${c.id}')` } });
            }
            // Maintenance schedule (whichever comes first)
            recTypes.forEach(type => {
                const st = Recommendations.getMaintenanceStatus(c, type);
                if (!st || st.status === 'ok') return;
                items.push({
                    priority: st.status === 'overdue' ? 0 : 1,
                    icon: 'wrench',
                    title: `${type} ${st.status === 'overdue' ? 'overdue' : 'due soon'}`,
                    sub: `${name} · ${st.detail}`,
                    action: { label: 'Log', fn: `App.openServiceModal(null,'${c.id}','${type}')` }
                });
            });
            // Documents
            if (c.insuranceExpiry) {
                const d = Math.ceil((new Date(c.insuranceExpiry) - today) / 86400000);
                if (d < 0) items.push({ priority: 0, icon: 'shield', title: 'Insurance expired', sub: `${name} · expired ${c.insuranceExpiry}`, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
                else if (d <= 30) items.push({ priority: 1, icon: 'shield', title: `Insurance expires in ${d} days`, sub: name, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
            }
            if (c.registrationExpiry) {
                const d = Math.ceil((new Date(c.registrationExpiry) - today) / 86400000);
                if (d < 0) items.push({ priority: 0, icon: 'doc', title: 'Registration (Istimara) expired', sub: `${name} · expired ${c.registrationExpiry}`, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
                else if (d <= 30) items.push({ priority: 1, icon: 'doc', title: `Registration expires in ${d} days`, sub: name, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
            }
            // Warranty
            if (c.warrantyExpiry) {
                const d = Math.ceil((new Date(c.warrantyExpiry) - today) / 86400000);
                if (d >= 0 && d <= 60) items.push({ priority: 2, icon: 'star', title: `Vehicle warranty ends in ${d} days`, sub: `${name} · use it before it expires`, action: null });
            }
            // Fuel anomaly
            const anomaly = Storage.getFuelAnomaly(c.id);
            if (anomaly) items.push({ priority: 1, icon: 'fuel', title: `Fuel use up ${anomaly.pct}%`, sub: `${name} · ${anomaly.latest} vs ${anomaly.avg} L/100km avg — check tire pressure & air filter`, action: null });
            // Part warranties about to lapse — worth checking the part before cover ends
            Storage.getActiveWarranties(c.id).forEach(w => {
                if (w.warranty.status !== 'expiring') return;
                items.push({
                    priority: 2, icon: 'shield',
                    title: `Warranty ending: ${w.bill.label || w.bill.kind}`,
                    sub: `${name} · ${w.warranty.detail}${w.bill.vendor ? ' · ' + w.bill.vendor : ''}`,
                    action: { label: 'View', fn: `App.navigate('warranty')` }
                });
            });
            // Manual reminders not covered by the schedule
            Storage.getUpcomingReminders(c.id).forEach(r => {
                if (r.autoCreated || recTypes.includes(r.type)) return;
                const d = Math.ceil((new Date(r.dueDate) - today) / 86400000);
                if (d > 30) return;
                items.push({ priority: d < 0 ? 0 : 1, icon: 'bell', title: `${r.type} ${d < 0 ? 'overdue' : 'due soon'}`, sub: `${name} · ${d < 0 ? Math.abs(d) + ' days overdue' : 'in ' + d + ' days'}`, action: null });
            });
        });

        items.sort((a, b) => a.priority - b.priority);

        if (!items.length) {
            el.innerHTML = `<div class="action-center-card all-clear">
                <div class="ac-clear-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--green)" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <div><div class="ac-clear-title">All caught up</div><div class="ac-clear-sub">No maintenance, documents, or alerts need attention right now.</div></div>
            </div>`;
            return;
        }

        const icons = {
            wrench: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a5 5 0 01-7 7l-7.4 7.4a2.1 2.1 0 01-3-3L10.7 10.3a5 5 0 017-7l-3 3z" stroke="currentColor" stroke-width="2" fill="none"/>',
            shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
            doc: '<rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
            fuel: '<path d="M3 21V6a2 2 0 012-2h6a2 2 0 012 2v15M13 10h2a2 2 0 012 2v3a2 2 0 002 2 2 2 0 002-2V8l-3-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
            bell: '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
            star: '<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.8 1-6L3.3 9.4l6-.9z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
            gauge: '<path d="M4 18a9 9 0 1116 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 14l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6" fill="currentColor"/>'
        };
        const pClass = ['ac-critical', 'ac-warning', 'ac-info'];
        const shown = items.slice(0, 6);
        el.innerHTML = `<div class="action-center-card">
            <div class="ac-header"><span class="ac-title">Action Center</span><span class="ac-count">${items.length} item${items.length > 1 ? 's' : ''}</span></div>
            <div class="ac-list">${shown.map(it => `
                <div class="ac-item ${pClass[it.priority]}">
                    <span class="ac-icon"><svg viewBox="0 0 24 24" width="18" height="18">${icons[it.icon]}</svg></span>
                    <div class="ac-text"><div class="ac-item-title">${it.title}</div><div class="ac-item-sub">${it.sub}</div></div>
                    ${it.action ? `<button class="btn btn-sm btn-secondary ac-btn" onclick="${it.action.fn}">${it.action.label}</button>` : ''}
                </div>`).join('')}
                ${items.length > 6 ? `<div class="ac-more">+ ${items.length - 6} more</div>` : ''}
            </div>
        </div>`;
    },

    // ── Cost Forecast ──
    renderForecast(carId) {
        const el = document.getElementById('forecast-section');
        if (!el) return;
        if (!Storage.getCars().length) { el.innerHTML = ''; return; }
        const fc = Storage.getCostForecast(carId, 6);
        const trend = Storage.getSpendTrend(carId);
        const cars = Storage.getCars();

        let forecastHTML = '';
        if (fc.items.length) {
            const grouped = {};
            fc.items.forEach(i => { grouped[i.type] = (grouped[i.type] || 0) + i.est; });
            forecastHTML = `<div class="card" style="flex:1">
                <h3>6-Month Cost Forecast</h3>
                <div class="forecast-total">~ ${fc.total.toFixed(0)} <span>SAR</span></div>
                <div class="forecast-sub">Estimated upcoming maintenance over the next 6 months</div>
                <div class="forecast-list">${Object.entries(grouped).sort((a, b) => b[1] - a[1]).map(([type, est]) =>
                    `<div class="forecast-row"><span>${type}</span><span class="forecast-est">~ ${est.toFixed(0)} SAR</span></div>`).join('')}</div>
            </div>`;
        }

        // Cost per km per car
        let tcoHTML = '';
        const tcoCars = cars.filter(c => carId === 'all' || c.id === carId).map(c => ({ c, cpk: Storage.getCostPerKm(c.id) })).filter(x => x.cpk !== null);
        if (tcoCars.length) {
            tcoHTML = `<div class="card" style="flex:1">
                <h3>Running Cost (per km)</h3>
                <div class="tco-list">${tcoCars.map(({ c, cpk }) =>
                    `<div class="tco-row"><span class="tco-name">${c.make} ${c.model}</span><span class="tco-val">${cpk.toFixed(2)} <small>SAR/km</small></span></div>`).join('')}</div>
                <div class="forecast-sub" style="margin-top:10px">Total spend ÷ distance driven (fuel + maintenance)</div>
            </div>`;
        }

        el.innerHTML = (forecastHTML || tcoHTML) ? `<div class="analytics-row">${forecastHTML}${tcoHTML}</div>` : '';
    },

    // ── Printable Service History ──
    printServiceHistory(carId) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const services = Storage.getServices(carId).sort((a, b) => new Date(b.date) - new Date(a.date));
        const fuelTotal = Storage.getFuelExpenses(carId);
        const svcTotal = Storage.getServiceExpenses(carId);
        const cpk = Storage.getCostPerKm(carId);
        const rows = services.map(s => {
            const bills = s.bills || [];
            const detail = bills.length
                ? bills.map(b => `${b.label || b.kind} — ${b.vendor || 'shop n/a'} — ${(parseFloat(b.amount) || 0).toFixed(0)} SAR`).join('<br>')
                : (s.notes || '');
            return `<tr><td>${s.date}</td><td>${s.type}</td><td>${s.mileage ? parseInt(s.mileage).toLocaleString() + ' km' : '—'}</td><td>${Storage.getServiceCost(s).toFixed(0)} SAR</td><td>${detail}</td></tr>`;
        }).join('');
        const html = `<!DOCTYPE html><html><head><title>Service History — ${car.make} ${car.model}</title>
            <style>
                body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111;padding:40px;max-width:800px;margin:0 auto;}
                h1{font-size:24px;margin:0 0 4px;} .sub{color:#666;margin-bottom:24px;font-size:13px;}
                .meta{display:flex;flex-wrap:wrap;gap:24px;margin-bottom:24px;padding:16px;background:#f5f6fa;border-radius:8px;}
                .meta div span{display:block;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;}
                .meta div strong{font-size:16px;}
                table{width:100%;border-collapse:collapse;font-size:13px;} th{text-align:left;background:#111;color:#fff;padding:8px 10px;}
                td{padding:8px 10px;border-bottom:1px solid #e5e7eb;} tr:nth-child(even) td{background:#fafafa;}
                .foot{margin-top:24px;font-size:11px;color:#999;text-align:center;}
                @media print{body{padding:20px;}}
            </style></head><body>
            <h1>Vehicle Service History</h1>
            <div class="sub">${car.year} ${car.make} ${car.model}${car.plate ? ' · ' + car.plate : ''} · Generated ${new Date().toISOString().split('T')[0]}</div>
            <div class="meta">
                <div><span>Current Odometer</span><strong>${Storage.getEffectiveMileage(car).toLocaleString()} km</strong></div>
                <div><span>Total Services</span><strong>${services.length}</strong></div>
                <div><span>Maintenance Spend</span><strong>${svcTotal.toFixed(0)} SAR</strong></div>
                <div><span>Fuel Spend</span><strong>${fuelTotal.toFixed(0)} SAR</strong></div>
                ${cpk ? `<div><span>Running Cost</span><strong>${cpk.toFixed(2)} SAR/km</strong></div>` : ''}
            </div>
            <table><thead><tr><th>Date</th><th>Service</th><th>Mileage</th><th>Cost</th><th>Bills / Notes</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:20px">No services recorded</td></tr>'}</tbody></table>
            <div class="foot">Generated by AutoCare · Maintenance records for ${car.make} ${car.model}</div>
            </body></html>`;
        const w = window.open('', '_blank');
        if (!w) { alert('Please allow pop-ups to print the service history.'); return; }
        w.document.write(html);
        w.document.close();
        setTimeout(() => w.print(), 400);
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
        services.forEach(s => { byType[s.type] = (byType[s.type] || 0) + Storage.getServiceCost(s); });
        if (fuelTotal > 0) byType['Fuel'] = fuelTotal;

        const colors = ['#4f6ef7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#4f46e5', '#65a30d'];
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

        // Driving pattern — derived from every odometer reading (manual, service, fuel)
        let driveHTML = '';
        const drive = Storage.getDrivingStats(carId);
        if (drive) {
            driveHTML = `<div class="analytics-row"><div class="card" style="flex:1"><h3>Driving Pattern</h3><div class="drive-stats"><div class="drive-stat"><span class="drive-val">${drive.kmPerDay.toFixed(1)}</span><span class="drive-label">km/day</span></div><div class="drive-stat"><span class="drive-val">${drive.kmPerMonth.toFixed(0)}</span><span class="drive-label">km/month</span></div><div class="drive-stat"><span class="drive-val">${drive.kmPerYear.toFixed(0)}</span><span class="drive-label">km/year (est)</span></div></div></div></div>`;
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
            <button class="quick-btn quick-btn-primary" onclick="Features.openOdometerModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 18a9 9 0 1116 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 14l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6" fill="currentColor"/></svg> Update km</button>
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
