// ═══════════════════════════════════════════
// FEATURES.JS — Export/Import, Analytics, Quick-Add, Tire, Mechanic, Climate
// ═══════════════════════════════════════════

const Features = {

    // ── Export/Import ──
    // Everything that makes the app behave as configured must ride along: the
    // records, custom intervals, the settings that change how intervals are
    // calculated, and every receipt image (which lives in IndexedDB, not here).
    SETTING_KEYS: { climate: 'autocare_climate', mechanics: 'autocare_mechanics', theme: 'autocare_theme', lang: 'autocare_lang' },

    collectSettings() {
        const raw = k => localStorage.getItem(k);
        return {
            climate: raw(this.SETTING_KEYS.climate) || 'normal',
            mechanics: JSON.parse(raw(this.SETTING_KEYS.mechanics) || '[]'),
            theme: raw(this.SETTING_KEYS.theme) || 'light',
            lang: raw(this.SETTING_KEYS.lang) || 'en'
        };
    },

    applySettings(settings) {
        if (!settings) return 0;
        let n = 0;
        if (settings.climate) { localStorage.setItem(this.SETTING_KEYS.climate, settings.climate); n++; }
        if (Array.isArray(settings.mechanics)) { localStorage.setItem(this.SETTING_KEYS.mechanics, JSON.stringify(settings.mechanics)); n++; }
        if (settings.theme) {
            localStorage.setItem(this.SETTING_KEYS.theme, settings.theme);
            document.documentElement.setAttribute('data-theme', settings.theme);
            n++;
        }
        if (settings.lang && typeof I18N !== 'undefined') {
            I18N.set(settings.lang);
            I18N.translateDOM();
            n++;
        }
        return n;
    },

    exportData() {
        const data = Storage.getAll();
        const custom = localStorage.getItem('autocare_custom_recs');
        // Include photos for trashed records too, so restoring one keeps its receipt
        const ids = [...new Set(Storage.getAllReferencedBills().flatMap(b => Photos.idsFor(b)))];
        Promise.all(ids.map(id => Photos.get(id).then(d => [id, d]).catch(() => [id, null])))
            .then(pairs => {
                const photos = {};
                let missing = 0;
                pairs.forEach(([id, d]) => { if (d) photos[id] = d; else missing++; });
                const payload = {
                    formatVersion: 2,
                    exportedAt: new Date().toISOString(),
                    ...data,
                    customRecs: custom ? JSON.parse(custom) : {},
                    settings: this.collectSettings(),
                    photos
                };
                const json = JSON.stringify(payload, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `autocare-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                Storage.markBackedUp();
                if (App.currentPage === 'dashboard') App.renderPage('dashboard');

                const n = Object.keys(photos).length;
                const mb = (json.length / 1048576).toFixed(1);
                alert(
                    'Backup saved (' + mb + ' MB)\n\n' +
                    data.cars.length + ' car(s)\n' +
                    data.services.length + ' service record(s)\n' +
                    n + ' receipt photo(s)' + (missing ? ' (' + missing + ' could not be read)' : '') + '\n' +
                    'Settings and custom intervals included\n\n' +
                    'Keep this file in Files or iCloud Drive.'
                );
            })
            .catch(() => alert('Could not build the backup file.'));
    },

    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            let data;
            try { data = JSON.parse(e.target.result); }
            catch (err) { return alert('That file is not readable: ' + err.message); }
            if (!data || !data.cars || !data.services || !data.reminders) return alert('That does not look like an AutoCare backup.');

            const merge = confirm('Merge with existing data? (Cancel = Replace all)');
            const existing = Storage.getAll();
            if (merge) {
                const mergeBy = (key) => {
                    if (!Array.isArray(data[key])) return;
                    if (!Array.isArray(existing[key])) existing[key] = [];
                    const seen = new Set(existing[key].map(x => x.id));
                    data[key].forEach(x => { if (!seen.has(x.id)) existing[key].push(x); });
                };
                ['cars', 'services', 'reminders', 'fuelLogs', 'odometerLogs', 'trash'].forEach(mergeBy);
                Storage.save(existing);
            } else {
                Storage.save({
                    cars: data.cars, services: data.services, reminders: data.reminders,
                    fuelLogs: data.fuelLogs || [], odometerLogs: data.odometerLogs || [], trash: data.trash || []
                });
            }
            if (data.customRecs) localStorage.setItem('autocare_custom_recs', JSON.stringify(data.customRecs));
            const settingsRestored = this.applySettings(data.settings);

            // Wait for the images to actually land before reporting success
            const entries = Object.entries(data.photos || {});
            Promise.all(entries.map(([id, d]) => d ? Photos.put(id, d).then(() => true).catch(() => false) : Promise.resolve(false)))
                .then(results => {
                    const ok = results.filter(Boolean).length;
                    const failed = results.length - ok;
                    App.renderPage(App.currentPage);
                    alert(
                        'Import complete\n\n' +
                        Storage.getCars().length + ' car(s)\n' +
                        Storage.getServices('all').length + ' service record(s)\n' +
                        ok + ' receipt photo(s) restored' + (failed ? ' (' + failed + ' failed)' : '') + '\n' +
                        (settingsRestored ? 'Settings restored' : 'No settings in this file — check climate mode in Settings')
                    );
                })
                .catch(() => { App.renderPage(App.currentPage); alert('Records imported, but some receipt photos could not be restored.'); });
        };
        reader.onerror = () => alert('Could not read that file.');
        reader.readAsText(file);
    },

    // ── Bills & Receipts ──
    BILL_KINDS: ['Parts', 'Labour', 'Other'],

    // Small indicator in the services table
    billsCell(service) {
        const bills = service.bills || [];
        if (!bills.length) return '<span class="bill-none">' + t('No bill') + '</span>';
        const withPhoto = bills.reduce((n, b) => n + Photos.idsFor(b).length, 0);
        return `<span class="bill-count">${bills.length}</span>${withPhoto ? `<span class="bill-cam" title="${withPhoto} receipt photo(s)">&#128247;</span>` : ''}`;
    },

    _billRowHTML(b) {
        b = b || {};
        const rid = 'br_' + Math.random().toString(36).slice(2, 8);
        const pids = Photos.idsFor(b);
        return `<div class="bill-row" data-photos="${pids.join(',')}">
            <div class="bill-line bill-line-1">
                <select class="bill-kind">${this.BILL_KINDS.map(k => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${I18N.t(k)}</option>`).join('')}</select>
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
                <input type="file" id="${rid}" accept="image/*" multiple style="display:none" onchange="Features.pickBillPhoto(this)">
                <button type="button" class="bill-photo-btn" onclick="document.getElementById('${rid}').click()">${t('Attach receipt')}</button>
                <span class="bill-photo-state">${pids.length ? `<span class="bill-photo-ok">${pids.length} ${t(pids.length === 1 ? 'page' : 'pages')}</span>` : ''}</span>
                ${pids.length ? `<button type="button" class="bill-photo-view" onclick="Photos.view(['${pids.join("','")}'])">${t('View')}</button>` : ''}
            </div>
        </div>`;
    },

    renderBillsEditor(bills) {
        const rows = (bills || []).map(b => this._billRowHTML(b)).join('');
        return `<div class="bills-block">
            <div class="bills-head">
                <span class="bills-title">${t("Bills & Receipts")}</span>
                <button type="button" class="btn btn-secondary btn-sm" onclick="Features.addBillRow()">${t("+ Add Bill")}</button>
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
        (row.getAttribute('data-photos') || '').split(',').filter(Boolean)
            .forEach(pid => Photos.remove(pid).catch(() => {}));
        row.remove();
        this.recalcBillTotal();
    },

    pickBillPhoto(input) {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        const row = input.closest('.bill-row');
        const state = row.querySelector('.bill-photo-state');
        state.innerHTML = '<span class="bill-photo-working">' + t('Compressing…') + '</span>';
        Promise.all(files.map(f => Photos.save(f).then(id => id).catch(() => null)))
            .then(ids => {
                const good = ids.filter(Boolean);
                const failed = ids.length - good.length;
                const existing = (row.getAttribute('data-photos') || '').split(',').filter(Boolean);
                const all = existing.concat(good);
                row.setAttribute('data-photos', all.join(','));
                state.innerHTML = all.length
                    ? '<span class="bill-photo-ok">' + all.length + ' ' + t(all.length === 1 ? 'page' : 'pages') + '</span>' +
                      (failed ? ' <span class="bill-photo-err">' + failed + ' ' + t('failed') + '</span>' : '')
                    : '<span class="bill-photo-err">' + t('Could not read those images') + '</span>';
                let viewBtn = row.querySelector('.bill-photo-view');
                const call = "Photos.view(['" + all.join("','") + "'])";
                if (all.length && !viewBtn) {
                    row.querySelector('.bill-line-3').insertAdjacentHTML('beforeend',
                        '<button type="button" class="bill-photo-view" onclick="' + call + '">' + t('View') + '</button>');
                } else if (viewBtn) {
                    viewBtn.setAttribute('onclick', call);
                }
            })
            .catch(err => { state.innerHTML = '<span class="bill-photo-err">' + err.message + '</span>'; });
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
            const photoIds = (row.getAttribute('data-photos') || '').split(',').filter(Boolean);
            // keep a row only if it carries something meaningful
            if (!amount && !label && !vendor && !photoIds.length) return;
            out.push({
                id: 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                kind: row.querySelector('.bill-kind').value,
                label, vendor, photoIds,
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

    // Drop receipt photos no bill references any more. Trashed services still count
    // as referencing theirs, so restoring a deleted service keeps its receipts.
    cleanupPhotos() {
        if (typeof Photos === 'undefined') return;
        Photos.keys().then(keys => {
            const used = new Set(Storage.getAllReferencedBills().flatMap(b => Photos.idsFor(b)));
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
            el.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M32 8l18 8v16c0 11-8 19-18 24-10-5-18-13-18-24V16l18-8z" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M24 32l6 6 12-13" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="empty-state-text">${t("No part warranties yet")}</p><p class="warranty-empty-hint">Add a bill to a service and give it a warranty in months or km — it will appear here.</p></div>`;
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
                        <div class="wc-title">${bill.label || I18N.t(bill.kind)}</div>
                        <div class="wc-sub">${car ? car.make + ' ' + car.model : ''} &middot; ${I18N.t(bill.serviceType)}</div>
                    </div>
                    <span class="badge badge-${cls}">${label}</span>
                </div>
                <div class="wc-remaining">${warranty.detail}</div>
                <div class="wc-meta">
                    <div class="wc-meta-row"><span>${t("Shop")}</span><span>${bill.vendor || '—'}</span></div>
                    <div class="wc-meta-row"><span>${t("Paid")}</span><span>${(parseFloat(bill.amount) || 0).toFixed(0)} SAR on ${bill.date || bill.serviceDate || '—'}</span></div>
                    <div class="wc-meta-row"><span>${t("Cover")}</span><span>${terms.join(' or ') || '—'}</span></div>
                    ${warranty.expiryDate ? `<div class="wc-meta-row"><span>${t("Until")}</span><span>${warranty.expiryDate}</span></div>` : ''}
                    ${warranty.endKm ? `<div class="wc-meta-row"><span>${t("Or at")}</span><span>${warranty.endKm.toLocaleString()} km</span></div>` : ''}
                </div>
                <div class="wc-actions">
                    ${Photos.idsFor(bill).length ? `<button class="btn btn-secondary btn-sm" onclick="Photos.view(['${Photos.idsFor(bill).join("','")}'])">${t("View receipt")}</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="App.navigate('services');App.openServiceModal(Storage.getServices().find(x=>x.id==='${bill.serviceId}'))">${Photos.idsFor(bill).length ? t('Edit') : t('Add receipt / edit')}</button>
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

    // ── Service Insights ──
    // What the records already know but never said: how the interval you actually
    // achieve compares with the recommended one, and what that habit costs a year.
    renderServiceInsights(carId) {
        const el = document.getElementById('insights-section');
        if (!el) return;
        const groups = Storage.getServiceInsights(carId);
        if (!groups.length) {
            el.innerHTML = '<div class="card"><h3>Service Insights</h3>' +
                '<p class="insight-empty">Log the same service twice, each with its mileage, ' +
                'and this will compare the interval you actually achieve against the recommended one.</p></div>';
            return;
        }
        const badge = { frequent: 'blue', onschedule: 'green', stretched: 'orange' };
        const esc = v => String(v);

        const rowHTML = (i) => {
            const parts = [];
            parts.push('<div class="insight-row">');
            parts.push('<div class="insight-top"><span class="insight-type">' + I18N.t(i.type) + '</span>');
            if (i.verdict) parts.push('<span class="badge badge-' + badge[i.verdict] + '">' + esc(i.note) + '</span>');
            parts.push('</div>');

            parts.push('<div class="insight-nums">');
            parts.push('<span>You: <strong>' + i.avgKm.toLocaleString() + ' km</strong></span>');
            if (i.recKm) parts.push('<span>Recommended: <strong>' + i.recKm.toLocaleString() + ' km</strong></span>');
            if (i.avgCost) parts.push('<span>Avg cost: <strong>' + i.avgCost.toFixed(0) + ' SAR</strong></span>');
            parts.push('</div>');

            if (i.ratio !== null) {
                // bar is scaled so the recommended interval sits at the fixed mark
                const w = Math.max(3, Math.min(100, i.ratio * 62.5));
                parts.push('<div class="insight-bar"><div class="insight-bar-fill ' + i.verdict +
                           '" style="width:' + w.toFixed(1) + '%"></div><span class="insight-bar-mark"></span></div>');
            }

            if (i.yearlyDelta && i.yearlyDelta > 50) {
                const times = i.perYear ? i.perYear.toFixed(1) : '?';
                const wouldBe = (i.perYear && i.ratio) ? (i.perYear * i.ratio).toFixed(1) : '?';
                parts.push('<div class="insight-note">About <strong>' + Math.round(i.yearlyDelta) +
                           ' SAR a year</strong> more than following the schedule — roughly ' + times +
                           ' times a year instead of ' + wouldBe + '. Reasonable on a high-mileage engine if it is deliberate.</div>');
            } else if (i.verdict === 'stretched' && i.ratio) {
                parts.push('<div class="insight-note">Running about ' + Math.round((i.ratio - 1) * 100) +
                           '% past the recommended interval.</div>');
            }

            parts.push('</div>');
            return parts.join('');
        };

        el.innerHTML = groups.map(g =>
            '<div class="card insight-card"><h3>Service Insights' +
            (groups.length > 1 ? ' — ' + esc(g.carName) : '') + '</h3>' +
            '<div class="insight-list">' + g.items.map(rowHTML).join('') + '</div></div>'
        ).join('');
    },

    // ── Action Center (prioritized "do this now") ──
    renderActionCenter(carId) {
        const el = document.getElementById('action-center');
        if (!el) return;
        const cars = Storage.getCars().filter(c => carId === 'all' || c.id === carId);
        if (!cars.length) { el.innerHTML = ''; return; }

        const items = [];
        const today = new Date();
        const recTypes = Recommendations.ALL_TYPES;

        cars.forEach(c => {
            const name = `${c.make} ${c.model}`;
            // Odometer freshness — km-based reminders are only as good as the last reading
            const fresh = Storage.getOdometerFreshness(c);
            if (fresh.never || fresh.daysSince === null) {
                items.push({ priority: 1, icon: 'gauge', title: t('Add an odometer reading'), sub: `${name} · ${t('needed to track km-based services')}`, action: { label: 'Update', fn: `Features.openOdometerModal('${c.id}')` } });
            } else if (fresh.stale) {
                items.push({ priority: fresh.daysSince >= 60 ? 1 : 2, icon: 'gauge', title: t('Odometer not updated in {d} days', {d: fresh.daysSince}), sub: `${name} · ${t('last read {km} km on {d}', {km: fresh.lastKm.toLocaleString(), d: fresh.lastDate})}`, action: { label: 'Update', fn: `Features.openOdometerModal('${c.id}')` } });
            }
            // Maintenance schedule (whichever comes first)
            recTypes.forEach(type => {
                const st = Recommendations.getMaintenanceStatus(c, type);
                if (!st || st.status === 'ok') return;
                items.push({
                    priority: st.status === 'overdue' ? 0 : 1,
                    icon: 'wrench',
                    title: st.status === 'overdue' ? t('{type} overdue', {type: I18N.t(type)}) : t('{type} due soon', {type: I18N.t(type)}),
                    sub: `${name} · ${st.detail}`,
                    action: { label: 'Log', fn: `App.openServiceModal(null,'${c.id}','${type}')` }
                });
            });
            // Documents
            if (c.insuranceExpiry) {
                const d = Math.ceil((new Date(c.insuranceExpiry) - today) / 86400000);
                if (d < 0) items.push({ priority: 0, icon: 'shield', title: t('Insurance expired'), sub: `${name} · expired ${c.insuranceExpiry}`, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
                else if (d <= 30) items.push({ priority: 1, icon: 'shield', title: t('Insurance expires in {d} days', {d}), sub: name, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
            }
            // Fahes (periodic technical inspection)
            const fahesDays = c.fahesExpiry ? Math.ceil((new Date(c.fahesExpiry) - today) / 86400000) : null;
            if (fahesDays !== null) {
                if (fahesDays < 0) items.push({ priority: 0, icon: 'doc', title: t('Fahes (inspection) expired'), sub: `${name} · expired ${c.fahesExpiry}`, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
                else if (fahesDays <= 30) items.push({ priority: 1, icon: 'doc', title: t('Fahes expires in {d} days', {d: fahesDays}), sub: name, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
            }
            if (c.registrationExpiry) {
                const d = Math.ceil((new Date(c.registrationExpiry) - today) / 86400000);
                // Istimara renewal needs a valid Fahes and insurance, so say which to do first
                const insDays = c.insuranceExpiry ? Math.ceil((new Date(c.insuranceExpiry) - today) / 86400000) : null;
                const blockers = [];
                if (fahesDays !== null && fahesDays < d) blockers.push('Fahes');
                if (insDays !== null && insDays < d) blockers.push('insurance');
                const chain = (d <= 60 && blockers.length) ? ` · ${t('renew {what} first', {what: blockers.map(x => t(x === 'Fahes' ? 'Fahes' : 'Insurance')).join(' + ')})}` : '';
                if (d < 0) items.push({ priority: 0, icon: 'doc', title: t('Registration (Istimara) expired'), sub: `${name} · expired ${c.registrationExpiry}${chain}`, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
                else if (d <= 30) items.push({ priority: 1, icon: 'doc', title: t('Registration expires in {d} days', {d}), sub: name + chain, action: { label: 'Edit', fn: `App.openCarModal(Storage.getCars().find(x=>x.id==='${c.id}'))` } });
            }
            // Measured brake pad wear beats any fixed interval. Front and rear wear at
            // very different rates, so report the latest reading for each separately.
            const padByAxle = {};
            Storage.getServices(c.id)
                .filter(s => s.padThickness && parseFloat(s.padThickness) > 0 && Recommendations.isBrakeType(s.type))
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .forEach(s => { padByAxle[s.type] = s; });
            Object.values(padByAxle).forEach(padLog => {
                const mm = parseFloat(padLog.padThickness);
                const axle = padLog.type;
                if (mm <= 3) {
                    items.push({ priority: 0, icon: 'wrench', title: t('{t} at {mm} mm — replace now', {t: I18N.t(axle), mm}), sub: `${name} · ${t('measured {d}', {d: padLog.date})}`, action: { label: 'Log', fn: `App.openServiceModal(null,'${c.id}','${axle}')` } });
                } else if (mm <= 4.5) {
                    items.push({ priority: 1, icon: 'wrench', title: t('{t} low ({mm} mm)', {t: I18N.t(axle), mm}), sub: `${name} · ${t('replace at 3 mm')} · ${t('measured {d}', {d: padLog.date})}`, action: { label: 'Log', fn: `App.openServiceModal(null,'${c.id}','${axle}')` } });
                }
            });
            // Warranty
            if (c.warrantyExpiry) {
                const d = Math.ceil((new Date(c.warrantyExpiry) - today) / 86400000);
                if (d >= 0 && d <= 60) items.push({ priority: 2, icon: 'star', title: t('Vehicle warranty ends in {d} days', {d}), sub: `${name} · ${t('use it before it expires')}`, action: null });
            }
            // Fuel anomaly
            const anomaly = Storage.getFuelAnomaly(c.id);
            if (anomaly) items.push({ priority: 1, icon: 'fuel', title: t('Fuel use up {p}%', {p: anomaly.pct}), sub: `${name} · ${anomaly.latest} vs ${anomaly.avg} L/100km avg — check tire pressure & air filter`, action: null });
            // Tyre age — rubber degrades with heat and time, not just tread wear
            const tyre = Storage.getTyreAge(c);
            if (tyre && tyre.status !== 'ok') {
                items.push({
                    priority: tyre.status === 'replace' ? 0 : 1,
                    icon: 'shield',
                    title: tyre.status === 'replace' ? t('Tyres are {y} years old — replace', {y: tyre.years}) : t('Tyres are {y} years old', {y: tyre.years}),
                    sub: `${name} · ${tyre.madeOn} · ${t('rubber hardens with age regardless of tread')}`,
                    action: { label: 'Tyres', fn: `Features.openTireModal('${c.id}')` }
                });
            }
            // Part warranties about to lapse — worth checking the part before cover ends
            Storage.getActiveWarranties(c.id).forEach(w => {
                if (w.warranty.status !== 'expiring') return;
                items.push({
                    priority: 2, icon: 'shield',
                    title: t('Warranty ending: {part}', {part: w.bill.label || I18N.t(w.bill.kind)}),
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

        // Backup nudge — everything lives in this browser, so an old backup is a real risk
        const backup = Storage.getBackupStatus();
        if (backup.never && cars.length) {
            items.push({ priority: 1, icon: 'save', title: t('No backup yet'), sub: t('Your records live only in this browser — save a copy to Files or iCloud Drive'), action: { label: t('Back up'), fn: 'Features.exportData()' } });
        } else if (backup.needed) {
            items.push({ priority: 1, icon: 'save', title: t('Last backup was {d} days ago', {d: backup.daysSinceBackup}), sub: t('You have changes since then — save a fresh copy'), action: { label: t('Back up'), fn: 'Features.exportData()' } });
        }

        items.sort((a, b) => a.priority - b.priority);

        if (!items.length) {
            el.innerHTML = `<div class="action-center-card all-clear">
                <div class="ac-clear-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="var(--green)" stroke-width="2"/><path d="M8 12l3 3 5-6" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <div><div class="ac-clear-title">${t("All caught up")}</div><div class="ac-clear-sub">${t("No maintenance, documents, or alerts need attention right now.")}</div></div>
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
            gauge: '<path d="M4 18a9 9 0 1116 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 14l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6" fill="currentColor"/>',
            save: '<path d="M5 3h11l3 3v15H5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M8 3v6h7V3M8 21v-6h8v6" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>'
        };
        const pClass = ['ac-critical', 'ac-warning', 'ac-info'];
        const shown = items.slice(0, 6);
        el.innerHTML = `<div class="action-center-card">
            <div class="ac-header"><span class="ac-title">${t("Action Center")}</span><span class="ac-count">${items.length > 1 ? t('{n} items', {n: items.length}) : t('{n} item', {n: items.length})}</span></div>
            <div class="ac-list">${shown.map(it => `
                <div class="ac-item ${pClass[it.priority]}">
                    <span class="ac-icon"><svg viewBox="0 0 24 24" width="18" height="18">${icons[it.icon]}</svg></span>
                    <div class="ac-text"><div class="ac-item-title">${it.title}</div><div class="ac-item-sub">${it.sub}</div></div>
                    ${it.action ? `<button class="btn btn-sm btn-secondary ac-btn" onclick="${it.action.fn}">${it.action.label}</button>` : ''}
                </div>`).join('')}
                ${items.length > 6 ? `<div class="ac-more">${t('+ {n} more', {n: items.length - 6})}</div>` : ''}
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
        // Print through a hidden iframe rather than a popup window — iOS Safari and
        // installed PWAs block window.open(), which made this fail on a phone.
        let frame = document.getElementById('print-frame');
        if (frame) frame.remove();
        frame = document.createElement('iframe');
        frame.id = 'print-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
        document.body.appendChild(frame);
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
            try { frame.contentWindow.focus(); frame.contentWindow.print(); }
            catch (e) { alert('Could not open the print dialog on this device.'); }
        }, 400);
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
            <button class="quick-btn quick-btn-primary" onclick="Features.openOdometerModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 18a9 9 0 1116 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M12 14l4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6" fill="currentColor"/></svg> ${t("Update km")}</button>
            <button class="quick-btn" onclick="App.openFuelModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/><path d="M13 10h2a2 2 0 012 2v3a2 2 0 002 2v0a2 2 0 002-2V8l-3-3" stroke="currentColor" stroke-width="2" fill="none"/></svg> ${t("Quick Fuel")}</button>
            <button class="quick-btn" onclick="App.openRepeatPicker()" title="Log a job you've done before"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12a9 9 0 0115-6.7L21 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12a9 9 0 01-15 6.7L3 16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M3 21v-5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> ${t("Repeat")}</button>
            <button class="quick-btn" onclick="App.openServiceModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a5 5 0 01-7 7l-7.4 7.4a2.1 2.1 0 01-3-3L10.7 10.3a5 5 0 017-7l-3 3z" stroke="currentColor" stroke-width="2" fill="none"/></svg> ${t("Quick Service")}</button>
            <button class="quick-btn" onclick="App.openReminderModal()"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none"/></svg> ${t("Add Reminder")}</button>
            <button class="quick-btn" onclick="Features.exportData()" title="Save a backup file"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 3h11l3 3v15H5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M8 3v6h7V3M8 21v-6h8v6" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg> ${t("Back Up")}</button>
            <button class="quick-btn" onclick="Features.showSettingsModal()"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> ${t("Settings")}</button>
        </div>`;
    },

    // ── Settings Modal ──
    showSettingsModal() {
        const climate = localStorage.getItem('autocare_climate') || 'normal';
        const html = `
            <div class="form-group">
                <label>${t("Language")}</label>
                <select id="f-lang">
                    <option value="en" ${I18N.lang === 'en' ? 'selected' : ''}>English</option>
                    <option value="ar" ${I18N.lang === 'ar' ? 'selected' : ''}>العربية</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t("Driving Climate")}</label>
                <select id="f-climate">
                    <option value="normal" ${climate === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="severe" ${climate === 'severe' ? 'selected' : ''}>Severe (Hot climate / Saudi Arabia)</option>
                </select>
                <small style="color:var(--text3);display:block;margin-top:4px">Severe climate reduces recommended intervals by 20% (heat accelerates wear)</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Backup")}</label>
                <div class="backup-status">${Features.backupStatusLine()}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                    <button class="btn btn-primary btn-sm" onclick="Features.exportData()">${t("Export Backup")}</button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">${t("Import Backup")}</button>
                    <input type="file" id="import-file" accept=".json" style="display:none" onchange="Features.importData(this.files[0])">
                </div>
                <small class="field-note">Everything is stored in this browser only. Save the file to Files or iCloud Drive so a lost phone doesn't take your records with it.</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Recently Deleted")}</label>
                <div id="trash-list">${Features.renderTrash()}</div>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Receipt Storage")}</label>
                <div id="storage-usage" class="backup-status">Checking…</div>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Notifications")}</label>
                <button class="btn btn-secondary btn-sm" id="btn-notif" onclick="Features.requestNotifications()">Enable Browser Notifications</button>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>Mechanics & Shops</label>
                <div id="mechanics-list" style="margin-bottom:8px">${Features.renderMechanicsList()}</div>
                <button class="btn btn-secondary btn-sm" onclick="Features.addMechanicRow()">${t("+ Add Mechanic")}</button>
            </div>`;
        setTimeout(() => {
            const el = document.getElementById('storage-usage');
            if (!el) return;
            Photos.usage().then(u => {
                const mb = u.bytes / 1048576;
                el.innerHTML = u.count
                    ? `${u.count} receipt${u.count > 1 ? 's' : ''} using about ${mb.toFixed(1)} MB`
                    : 'No receipt photos stored yet';
            }).catch(() => { el.textContent = 'Could not read storage usage'; });
        }, 40);
        App.openModal('Settings', html, () => {
            const cl = document.getElementById('f-climate').value;
            localStorage.setItem('autocare_climate', cl);
            const langEl = document.getElementById('f-lang');
            if (langEl && langEl.value !== I18N.lang) { I18N.set(langEl.value); I18N.translateDOM(); }
            Features.saveMechanics();
            App.closeModal();
            App.renderPage(App.currentPage);
        });
    },

    backupStatusLine() {
        const b = Storage.getBackupStatus();
        if (b.never) return '<span class="backup-warn">Never backed up</span>';
        const when = new Date(b.lastBackup).toISOString().split('T')[0];
        const age = b.daysSinceBackup === 0 ? 'today' : `${b.daysSinceBackup} day${b.daysSinceBackup === 1 ? '' : 's'} ago`;
        if (b.unsavedChanges) return `<span class="backup-warn">Last backup ${when} (${age}) — changed since</span>`;
        return `<span class="backup-ok">Last backup ${when} (${age}) — up to date</span>`;
    },

    // ── Recently Deleted ──
    renderTrash() {
        const trash = Storage.getTrash();
        if (!trash.length) return '<p class="trash-empty">Nothing deleted in the last 30 days.</p>';
        const describe = t => {
            const r = t.record || {};
            if (t.kind === 'car') {
                const n = t.extras ? (t.extras.services || []).length : 0;
                return `${r.year || ''} ${r.make || ''} ${r.model || ''}`.trim() + (n ? ` · ${n} service${n > 1 ? 's' : ''}` : '');
            }
            if (t.kind === 'service') return `${r.type || 'Service'} · ${r.date || ''} · ${Storage.getServiceCost(r).toFixed(0)} SAR`;
            if (t.kind === 'fuel') return `Fuel ${r.liters || '?'} L · ${r.date || ''} · ${parseFloat(r.totalCost || 0).toFixed(0)} SAR`;
            if (t.kind === 'reminder') return `${r.type || 'Reminder'} · due ${r.dueDate || ''}`;
            return t.kind;
        };
        const label = { car: 'Car', service: 'Service', fuel: 'Fuel log', reminder: 'Reminder' };
        return trash.map(t => {
            const daysLeft = Storage.TRASH_DAYS - Math.floor((Date.now() - new Date(t.deletedAt)) / 86400000);
            return `<div class="trash-row">
                <div class="trash-info">
                    <div class="trash-title">${label[t.kind] || t.kind}: ${describe(t)}</div>
                    <div class="trash-sub">Deleted ${new Date(t.deletedAt).toISOString().split('T')[0]} · removed for good in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="Features.restoreTrash('${t.id}')">${I18N.t("Restore")}</button>
            </div>`;
        }).join('');
    },

    restoreTrash(id) {
        if (!Storage.restoreFromTrash(id)) return;
        const list = document.getElementById('trash-list');
        if (list) list.innerHTML = this.renderTrash();
        App.renderPage(App.currentPage);
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
                <div class="form-group"><label>${t("Tire Brand")}</label><input type="text" id="f-tire-brand" placeholder="e.g. Michelin" value="${tires.brand}"></div>
                <div class="form-group"><label>${t("Tire Size")}</label><input type="text" id="f-tire-size" placeholder="e.g. 215/55R17" value="${tires.size}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Installed Date</label><input type="date" id="f-tire-date" value="${tires.installedDate}"></div>
                <div class="form-group"><label>Installed at (km)</label><input type="number" id="f-tire-km" placeholder="45000" value="${tires.installedMileage}"></div>
            </div>
            <div class="form-group">
                <label>Manufacture Date (DOT)</label>
                <input type="month" id="f-tire-made" value="${tires.manufactureDate || ''}">
                <small class="field-note">From the 4-digit DOT code on the sidewall — e.g. 2419 means week 24 of 2019. Heat hardens rubber, so tyres are usually replaced by 6 years old whatever the tread looks like.</small>
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
                manufactureDate: document.getElementById('f-tire-made').value,
                warrantyKm: document.getElementById('f-tire-warranty').value,
            };
            Storage.updateCar(carId, { tires: data });
            App.closeModal();
            App.renderPage(App.currentPage);
        });
    }
};
