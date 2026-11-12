// ═══════════════════════════════════════════
// FEATURES.JS — Export/Import, Analytics, Quick-Add, Tire, Mechanic, Climate
// ═══════════════════════════════════════════

const Features = {

    // ── Export/Import ──
    // Everything that makes the app behave as configured must ride along: the
    // records, custom intervals, the settings that change how intervals are
    // calculated, and every receipt image (which lives in IndexedDB, not here).
    SETTING_KEYS: { climate: 'autocare_climate', mechanics: 'autocare_mechanics', theme: 'autocare_theme', lang: 'autocare_lang', fuel: 'autocare_fuel' },

    collectSettings() {
        const raw = k => localStorage.getItem(k);
        return {
            climate: raw(this.SETTING_KEYS.climate) || 'normal',
            mechanics: JSON.parse(raw(this.SETTING_KEYS.mechanics) || '[]'),
            theme: raw(this.SETTING_KEYS.theme) || 'light',
            lang: raw(this.SETTING_KEYS.lang) || 'en',
            fuel: this.getFuelSettings()
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
        if (settings.fuel) { localStorage.setItem(this.SETTING_KEYS.fuel, JSON.stringify(settings.fuel)); n++; }
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
                const name = `autocare-backup-${Storage.today()}.json`;
                return this._deliverBackup(json, name).then(how => {
                    // Backing out of the share sheet is a decision, not a backup
                    if (!how) return;
                    Storage.markBackedUp();
                    if (App.currentPage === 'dashboard') App.renderPage('dashboard');
                    const n = Object.keys(photos).length;
                    const mb = (json.length / 1048576).toFixed(1);
                    alert(
                        t(how === 'share' ? 'Backup shared ({mb} MB)' : 'Backup saved ({mb} MB)', { mb }) + '\n\n' +
                        t('{n} car(s)', { n: data.cars.length }) + '\n' +
                        t('{n} service record(s)', { n: data.services.length }) + '\n' +
                        t('{n} receipt photo(s)', { n }) +
                        (missing ? ' ' + t('({n} could not be read)', { n: missing }) : '') + '\n' +
                        t('Settings and custom intervals included') + '\n\n' +
                        t(how === 'share'
                            ? 'Save it to Files or iCloud Drive so your history is not on this phone alone.'
                            : 'Keep this file in Files or iCloud Drive.')
                    );
                });
            })
            .catch(() => alert(t('Could not build the backup file.')));
    },

    // A download inside an installed iOS PWA lands somewhere the owner will never
    // find again, which is how a backup ends up never being taken. The system share
    // sheet reaches Files, iCloud Drive or a message to yourself in one tap, so try
    // that first. Falls back to a download when sharing is unavailable, or when the
    // tap's user activation has expired while the receipt photos were being read.
    // Resolves to 'share' | 'download', or null if the owner cancelled.
    _deliverBackup(json, name) {
        const download = () => {
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            // Revoking straight away cancels the download in some browsers
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return 'download';
        };
        let file = null;
        try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
        const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share);
        if (!canShare) return Promise.resolve(download());
        return navigator.share({ files: [file], title: 'AutoCare backup' })
            .then(() => 'share')
            .catch(err => (err && err.name === 'AbortError') ? null : download());
    },

    // Reads the file and asks what to do with it. The choice used to be a system
    // prompt where Cancel meant "replace everything", so backing out wiped the phone.
    _pendingImport: null,

    importData(file) {
        if (!file) return Promise.resolve();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (e) => {
                let data = null;
                try { data = JSON.parse(e.target.result); }
                catch (err) { alert(t('That file is not readable.')); return resolve(); }
                if (!data || !Array.isArray(data.cars) || !Array.isArray(data.services) || !Array.isArray(data.reminders)) {
                    alert(t('That does not look like an AutoCare backup.'));
                    return resolve();
                }
                this._showImportChoice(data);
                this._pendingImport = data;
                resolve();
            };
            reader.onerror = () => { alert(t('Could not read that file.')); resolve(); };
            reader.readAsText(file);
        });
    },

    _showImportChoice(data) {
        const newest = list => (list || []).map(s => s.date).filter(Boolean).sort().pop() || '';
        const inFile = newest(data.services);
        const onPhone = newest(Storage.getServices('all'));
        // Several backups look alike in Files; picking an older one should not be silent
        const older = onPhone && inFile < onPhone;
        const html = `
            <p class="doc-intro">${t('This file has {n} service records, the latest on {d}.', { n: data.services.length, d: inFile || '—' })}</p>
            ${older ? `<div class="odo-warning imp-warn">${t('This phone has newer records, up to {d}. Replacing removes them.', { d: onPhone })}</div>` : ''}
            <div class="imp-choices">
                <button type="button" class="btn btn-primary" id="imp-replace" onclick="Features._applyImport('replace')">${t('Replace everything on this phone')}</button>
                <small class="field-note">${t('To restore a backup. The records and settings here become the ones in the file.')}</small>
                <button type="button" class="btn btn-secondary" id="imp-merge" onclick="Features._applyImport('merge')">${t('Add to what is here')}</button>
                <small class="field-note">${t('Keeps everything on this phone and adds only what it does not have.')}</small>
            </div>`;
        App.openModal('Import Backup', html, null);
        document.getElementById('modal-save').style.display = 'none';
    },

    _applyImport(mode) {
        const data = this._pendingImport;
        if (!data) return Promise.resolve();
        this._pendingImport = null;
        let settingsRestored = 0;
        if (mode === 'merge') {
            const existing = Storage.getAll();
            const mergeBy = (key) => {
                if (!Array.isArray(data[key])) return;
                if (!Array.isArray(existing[key])) existing[key] = [];
                const seen = new Set(existing[key].map(x => x.id));
                data[key].forEach(x => { if (!seen.has(x.id)) existing[key].push(x); });
            };
            ['cars', 'services', 'reminders', 'fuelLogs', 'odometerLogs', 'trash', 'snoozes'].forEach(mergeBy);
            Storage.save(existing);
            // Adding never overrides: an interval this phone already has stays
            if (data.customRecs) {
                const mine = Recommendations.getCustom();
                Object.entries(data.customRecs).forEach(([carId, recs]) => { mine[carId] = { ...recs, ...(mine[carId] || {}) }; });
                localStorage.setItem('autocare_custom_recs', JSON.stringify(mine));
            }
        } else {
            Storage.save({
                cars: data.cars, services: data.services, reminders: data.reminders,
                fuelLogs: data.fuelLogs || [], odometerLogs: data.odometerLogs || [], trash: data.trash || [],
                snoozes: data.snoozes || []
            });
            if (data.customRecs) localStorage.setItem('autocare_custom_recs', JSON.stringify(data.customRecs));
            settingsRestored = this.applySettings(data.settings);
        }

        // Wait for the images to actually land before reporting success
        const entries = Object.entries(data.photos || {});
        return Promise.all(entries.map(([id, d]) => d ? Photos.put(id, d).then(() => true).catch(() => false) : Promise.resolve(false)))
            .then(results => {
                const ok = results.filter(Boolean).length;
                const failed = results.length - ok;
                if (mode !== 'merge') {
                    // The phone now matches a file that exists, so there is nothing to nag about
                    Storage.markBackedUp();
                    this.cleanupPhotos();
                }
                // Closing here is what stops Settings, which the import ran from, being
                // saved over the top of it. That is how the fuel setting went missing.
                App.closeModal();
                App.paintLang();
                App.navigate(App.currentPage);
                alert(
                    t('Import complete') + '\n\n' +
                    t('{n} car(s)', { n: Storage.getCars().length }) + '\n' +
                    t('{n} service record(s)', { n: Storage.getServices('all').length }) + '\n' +
                    t('{n} receipt photo(s)', { n: ok }) + (failed ? ' ' + t('({n} could not be read)', { n: failed }) : '') + '\n' +
                    (mode === 'merge' ? t('Settings left as they were')
                        : settingsRestored ? t('Settings restored') : t('No settings in this file — check climate mode in Settings'))
                );
            })
            .catch(() => {
                App.closeModal();
                App.navigate(App.currentPage);
                alert(t('Records imported, but some receipt photos could not be restored.'));
            });
    },

    // ── Bills & Receipts ──
    BILL_KINDS: ['Parts', 'Labour', 'Other'],

    // What a record cost the owner. An accident repair is labelled, and an
    // insurance-paid one reads 0 with the bills' value beside it.
    costCell(service) {
        const own = Storage.getOwnCost(service);
        const value = Storage.getServiceCost(service);
        const sub = service.insurancePaid
            ? (value ? t('Insurance paid {v} SAR', { v: Math.round(value).toLocaleString() }) : t('Paid by insurance'))
            : service.accident ? t('Not in running costs') : '';
        // one wrapper, so the phone card layout keeps the note under its amount
        return `<span class="cost-cell"><strong>${own.toFixed(0)} SAR</strong>${sub ? `<small class="cost-sub">${sub}</small>` : ''}</span>`;
    },

    accidentBadge(service) {
        return service && service.accident ? ` <span class="badge badge-red">${t('Accident')}</span>` : '';
    },

    // One line under the spend totals, so the repair is visible without being
    // counted in them.
    accidentNote(carId) {
        const a = Storage.getAccidentTotals(carId);
        if (!a.count) return '';
        const v = Math.round(a.value).toLocaleString();
        return a.own
            ? t('Accident repairs: {v} SAR, you paid {o} SAR. Not included above.', { v, o: Math.round(a.own).toLocaleString() })
            : t('Accident repairs: {v} SAR, paid by insurance. Not included above.', { v });
    },

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
        // What the form doesn't show still belongs to the bill, so it rides along on
        // the row. Rebuilding a bill from the form alone re-dated every one of them.
        return `<div class="bill-row" data-photos="${pids.join(',')}" data-id="${esc(b.id)}" data-date="${esc(b.date)}" data-startkm="${esc(b.startKm)}">
            <div class="bill-line bill-line-1">
                <select class="bill-kind">${this.BILL_KINDS.map(k => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${I18N.t(k)}</option>`).join('')}</select>
                <input type="text" class="bill-label" placeholder="${t('What is it for? e.g. Spark plugs')}" value="${esc(b.label)}">
                <input type="number" class="bill-amount" placeholder="0" step="0.01" value="${b.amount || ''}" oninput="Features.recalcBillTotal()">
                <button type="button" class="bill-del" title="${t('Remove this bill')}" onclick="Features.removeBillRow(this)">&times;</button>
            </div>
            <div class="bill-line bill-line-2">
                <input type="text" class="bill-vendor" placeholder="${t('Shop / store name')}" value="${esc(b.vendor)}">
                <input type="number" class="bill-wmonths" placeholder="${t('Warranty months')}" value="${b.warrantyMonths || ''}">
                <input type="number" class="bill-wkm" placeholder="${t('Warranty km')}" value="${b.warrantyKm || ''}">
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
            <p class="bills-hint">${t('Add one row per bill — parts from one shop, labour from another. Leave this empty and just type the cost below if you have no bill.')}</p>
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
            const known = row.getAttribute('data-id');
            out.push({
                id: known || 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                kind: row.querySelector('.bill-kind').value,
                label, vendor, photoIds,
                amount: amount || '0',
                warrantyMonths: wm || '',
                warrantyKm: wk || '',
                startKm: known ? (row.getAttribute('data-startkm') || '') : (startKm || ''),
                date: row.getAttribute('data-date') || (document.getElementById('f-date') ? document.getElementById('f-date').value : '')
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
            el.innerHTML = `<span>${t(rows.length > 1 ? 'Total from {n} bills' : 'Total from {n} bill', { n: rows.length })}</span><strong>${total.toFixed(2)} SAR</strong>`;
            if (costField) { costField.value = total.toFixed(2); costField.readOnly = true; costField.classList.add('input-locked'); }
            if (note) note.textContent = t('Calculated from the bills above.');
        } else {
            el.innerHTML = '';
            if (costField) { costField.readOnly = false; costField.classList.remove('input-locked'); }
            if (note) note.textContent = t('No bill? Just type the amount you paid.');
        }
    },

    // Drop receipt photos no bill references any more. Trashed services still count
    // as referencing theirs, so restoring a deleted service keeps its receipts.
    // ══════════════════════════════════════════
    // One way to save logged work, shared by both designs. The classic form and the
    // new logging sheet both end here, so a record means the same thing whichever
    // screen wrote it.
    // ══════════════════════════════════════════

    // A logged inspection is the authority on when the certificate expires, so it
    // updates the car's Fahes date. A failure means a re-test is owed, not a
    // year of cover, so that instead becomes a reminder.
    applyInspection(carId, insp, serviceDate) {
        if (!insp || !insp.inspectionResult) return;
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;

        if (insp.inspectionResult === 'fail') {
            const retest = new Date(serviceDate || new Date());
            retest.setDate(retest.getDate() + 30);
            const due = retest.toISOString().split('T')[0];
            const existing = Storage.getReminders(carId)
                .find(r => r.type === 'Inspection' && r.retest && !r.completed);
            if (existing) Storage.updateReminder(existing.id, { dueDate: due });
            else Storage.addReminder({
                carId, type: 'Inspection', dueDate: due, dueMileage: '',
                notes: 'Re-test after a failed inspection',
                completed: false, autoCreated: true, retest: true
            });
            return;
        }

        if (insp.inspectionExpiry) {
            Storage.updateCar(carId, { fahesExpiry: insp.inspectionExpiry });
            Storage.syncDocumentReminders(carId);
            // a pass clears any outstanding re-test
            Storage.getReminders(carId)
                .filter(r => r.type === 'Inspection' && r.retest && !r.completed)
                .forEach(r => Storage.updateReminder(r.id, { completed: true }));
        }
    },

    // `interval` is the km figure picked for this oil ('5000', '7000', '10000'), or
    // null when none was picked: a custom interval the three choices don't cover. Keep it.
    oilFollowUp(data, interval, ignoreId) {
        if(!Recommendations.isNewest(data.carId,'Oil Change',data.date,ignoreId)) return;
        if(interval) data.oilInterval=String(interval);
        const car=data.carId?Storage.getCars().find(c=>c.id===data.carId):null;
        // The oil you use is a property of how you run the car, not of one past
        // service — so it becomes this car's Oil Change interval, which the whole
        // schedule already respects. Before this the choice fed only the Reminders
        // page while every other screen kept using Ford's figure, so switching
        // 7,000 to 5,000 appeared to do nothing at all.
        if(car&&interval){
            const mfr=Recommendations.getForService(car.make,car.model,'Oil Change');
            const lbl={'5000':'Regular','7000':'Semi-synthetic','10000':'Full synthetic'};
            Recommendations.saveCustom(data.carId,'Oil Change',parseInt(interval),
                (mfr&&mfr.months)||6,t('Your oil choice: {label}',{label:t(lbl[interval]||'Regular')}));
        }
        if(data.mileage&&car){
            const rec=Recommendations.getEffective(car,'Oil Change');
            const next=parseInt(data.mileage)+rec.km;
            Storage.getReminders(data.carId).filter(r=>r.type==='Oil Change'&&!r.completed&&r.autoCreated).forEach(r=>Storage.dropReminder(r.id));
            // The time limit, like every other reminder. The km limit is its own field;
            // an estimate of when that will be reached belongs on screen, not in a
            // date that later reads as a deadline.
            const due=new Date(data.date); due.setMonth(due.getMonth()+(rec.months||6));
            Storage.addReminder({carId:data.carId,type:'Oil Change',dueDate:due.toISOString().split('T')[0],dueMileage:next.toString(),notes:`Auto: next oil change at ${next.toLocaleString()} km`,completed:false,autoCreated:true});
        }
    },

    // An old record must not rewrite today's certificate: it is not the newest
    // inspection, or it ran out before the one the car holds now.
    inspectionFollowUp(carId, insp, date, ignoreId) {
        if (!insp || !insp.inspectionResult) return;
        const held = (Storage.getCars().find(c => c.id === carId) || {}).fahesExpiry;
        const stale = !Recommendations.isNewest(carId, 'Periodic Inspection', date, ignoreId || null)
            || (insp.inspectionExpiry && held && held > insp.inspectionExpiry);
        if (!stale) this.applyInspection(carId, insp, date);
    },

    // Saves one trip to the workshop: one record per job, each with its own cost.
    // visit = { carId, date, mileage, notes, accident, insurancePaid, shop, photoIds,
    //           jobs: [{ type, cost, checkOnly, padThickness, oilInterval, insp }] }
    logVisit(visit) {
        const car = Storage.getCars().find(c => c.id === visit.carId);
        if (!car || !visit.jobs || !visit.jobs.length) return [];
        // Logging a timing belt tells us the engine is belt-driven, which is what
        // the schedule needs in order to stop ignoring it.
        if (visit.jobs.some(j => j.type === 'Timing Belt') && !car.timingType) Storage.updateCar(car.id, { timingType: 'belt' });
        const photoIds = visit.photoIds || [];
        const mileage = String(visit.mileage || '');
        const anyPriced = visit.jobs.some(j => parseFloat(j.cost) > 0);
        const ids = visit.jobs.map((j, i) => {
            const amount = parseFloat(j.cost) > 0 ? String(j.cost) : '';
            // A receipt or a shop name turns the cost into a bill. One photographed
            // invoice covers every job it priced, so each of them points at it; with
            // nothing priced, the first job keeps the receipt.
            const holdsReceipt = photoIds.length > 0 && (amount !== '' || (!anyPriced && i === 0));
            const bills = ((amount && visit.shop) || holdsReceipt) ? [{
                id: 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                kind: 'Other', label: '', vendor: visit.shop || '',
                photoIds: holdsReceipt ? photoIds.slice() : [],
                amount, warrantyMonths: '', warrantyKm: '', startKm: mileage, date: visit.date
            }] : [];
            const data = {
                carId: car.id, type: j.type, date: visit.date, mileage,
                notes: i === 0 ? (visit.notes || '') : '',
                padThickness: j.padThickness || '', checkOnly: !!j.checkOnly,
                accident: !!visit.accident, insurancePaid: !!(visit.accident && visit.insurancePaid),
                cost: amount, bills,
                ...(Recommendations.isInspectionType(j.type) ? (j.insp || {}) : {})
            };
            if (!data.checkOnly) {
                if (j.type === 'Oil Change') this.oilFollowUp(data, j.oilInterval || null);
                else if (mileage) Recommendations.createReminderFromService(car, j.type, mileage, data.date);
            }
            const saved = Storage.addService(data);
            if (Recommendations.isInspectionType(j.type)) this.inspectionFollowUp(car.id, data, data.date, null);
            return saved.id;
        });
        this.cleanupPhotos();
        return ids;
    },

    // Saves changes to one record. `data` is the whole record as it should now read.
    updateJob(id, data, oilInterval) {
        const car = Storage.getCars().find(c => c.id === data.carId);
        if (!data.checkOnly) {
            if (data.type === 'Oil Change') this.oilFollowUp(data, oilInterval || null, id);
            else if (data.mileage && car) Recommendations.createReminderFromService(car, data.type, data.mileage, data.date, id);
        }
        Storage.updateService(id, data);
        if (Recommendations.isInspectionType(data.type)) this.inspectionFollowUp(data.carId, data, data.date, id);
        this.cleanupPhotos();
    },

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
            el.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M32 8l18 8v16c0 11-8 19-18 24-10-5-18-13-18-24V16l18-8z" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linejoin="round"/><path d="M24 32l6 6 12-13" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="empty-state-text">${t("No part warranties yet")}</p><p class="warranty-empty-hint">${t("Add a bill to a service and give it a warranty in months or km — it will appear here.")}</p></div>`;
            return;
        }

        const card = ({ bill, car, warranty }) => {
            const clsMap = { expired: 'red', expiring: 'orange', unknown: 'blue', active: 'green' };
            const labelMap = { expired: 'Expired', expiring: 'Ending soon', unknown: 'Not tracked', active: 'Active' };
            const cls = clsMap[warranty.status] || 'green';
            const label = labelMap[warranty.status] || 'Active';
            const terms = [];
            if (warranty.months) terms.push(t('{n} months', { n: warranty.months }));
            if (warranty.km) terms.push(t('{km} km', { km: warranty.km.toLocaleString() }));
            return `<div class="warranty-card wc-${cls}">
                <div class="wc-head">
                    <div>
                        <div class="wc-title">${esc(bill.label) || I18N.t(bill.kind)}</div>
                        <div class="wc-sub">${car ? car.make + ' ' + car.model : ''} &middot; ${I18N.t(bill.serviceType)}</div>
                    </div>
                    <span class="badge badge-${cls}">${t(label)}</span>
                </div>
                <div class="wc-remaining">${warranty.detail}</div>
                <div class="wc-meta">
                    <div class="wc-meta-row"><span>${t("Shop")}</span><span>${esc(bill.vendor) || '—'}</span></div>
                    <div class="wc-meta-row"><span>${t("Paid")}</span><span>${t('{a} SAR on {d}', { a: (parseFloat(bill.amount) || 0).toFixed(0), d: bill.date || bill.serviceDate || '—' })}</span></div>
                    <div class="wc-meta-row"><span>${t("Cover")}</span><span>${terms.join(' / ') || '—'}</span></div>
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
            ${active.length ? `<div class="warranty-section-title">${t('Still covered')} (${active.length})</div><div class="warranty-grid">${active.map(card).join('')}</div>` : ''}
            ${expired.length ? `<div class="warranty-section-title warranty-section-muted">${t('Expired')} (${expired.length})</div><div class="warranty-grid">${expired.map(card).join('')}</div>` : ''}`;
    },

    // ── Odometer Update ──
    openOdometerModal(carId = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const target = carId || cars[0].id;

        const html = `
            <p class="odo-intro">${t("Enter the number shown on your car's dashboard. This keeps every km-based service reminder counting down accurately.")}</p>
            <div class="form-group"><label>${t('Car')}</label>
                <select id="f-odo-car" onchange="Features._refreshOdoPanel()">
                    ${cars.map(c => `<option value="${c.id}" ${c.id === target ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('')}
                </select>
            </div>
            <div id="odo-panel-wrap">${this._odoPanel(cars.find(c => c.id === target))}</div>
            <div class="form-row">
                <div class="form-group"><label>${t('Current Odometer (km)')}</label><input type="number" id="f-odo-km" placeholder="${t('e.g. 62500')}" inputmode="numeric" oninput="Features._checkOdoInput()"></div>
                <div class="form-group"><label>${t('Reading Date')}</label><input type="date" id="f-odo-date" max="${Storage.today()}" value="${Storage.today()}"></div>
            </div>
            <div id="odo-warn"></div>`;

        App.openModal('Update Odometer', html, () => {
            const cid = document.getElementById('f-odo-car').value;
            const km = parseInt(document.getElementById('f-odo-km').value);
            const date = document.getElementById('f-odo-date').value;
            if (!km || km <= 0) return alert(t('Please enter a valid odometer reading.'));
            if (!date) return alert(t('Please choose the reading date.'));

            const car = Storage.getCars().find(c => c.id === cid);
            const last = Storage.getLastReading(car);
            if (last && km < last.km) {
                if (!confirm(t('That is lower than your last recorded reading ({km} km).\n\nSave it anyway? Choose Cancel if it was a typo.', { km: last.km.toLocaleString() }))) return;
            }
            if (!Storage.logOdometer(cid, km, date)) return alert(t('A reading cannot be dated in the future.'));
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
            warn.innerHTML = `<div class="odo-warning">${t('Lower than your last reading of {km} km — double-check the number.', { km: last.km.toLocaleString() })}</div>`;
        } else {
            warn.innerHTML = '';
        }
    },

    _odoPanel(car) {
        if (!car) return '';
        const proj = Storage.getProjectedMileage(car);
        const fresh = Storage.getOdometerFreshness(car);
        if (!proj.lastKm) return `<div class="odo-panel"><div class="odo-hint">${t('No reading recorded yet — enter the number on your dashboard now.')}</div></div>`;
        const rateTxt = proj.rate ? t('{r} km/day average', { r: proj.rate.toFixed(0) }) : t('not enough history to estimate yet');
        return `<div class="odo-panel">
            <div class="odo-row"><span>${t('Last confirmed')}</span><strong>${proj.lastKm.toLocaleString()} km</strong></div>
            <div class="odo-row"><span>${t('Recorded')}</span><strong>${proj.lastDate || '—'}${fresh.daysSince !== null ? ` (${t('{d}d ago', { d: fresh.daysSince })})` : ''}</strong></div>
            ${proj.estimated ? `<div class="odo-row odo-est"><span>${t('Estimated today')}</span><strong>~ ${proj.km.toLocaleString()} km</strong></div>` : ''}
            <div class="odo-hint">${rateTxt}</div>
        </div>`;
    },

    _refreshOdoPanel() {
        const cid = document.getElementById('f-odo-car').value;
        const wrap = document.getElementById('odo-panel-wrap');
        if (!wrap) return;
        wrap.innerHTML = this._odoPanel(Storage.getCars().find(c => c.id === cid));
        document.getElementById('odo-warn').innerHTML = '';
    },

    // ── Documents ──
    // Insurance, Istimara and the periodic inspection are the things people
    // actually get fined for. They belong together, on the first screen, each
    // one tappable — not buried in a car form or a list of service types.
    // The expiry date is the fact the owner actually holds — it is printed on the
    // certificate, while the date of the test is not something anyone remembers.
    // So the expiry is typed, and the inspection date is derived from it when a
    // history record is worth keeping. Centres are a short list for now.
    INSPECTION_MONTHS: 12,
    INSPECTION_CENTRES: ['Dammam Centre', 'Khobar Centre'],

    certificateExpiry(fromDate) {
        const d = new Date(fromDate || Date.now());
        if (isNaN(d)) return '';
        d.setMonth(d.getMonth() + this.INSPECTION_MONTHS);
        return d.toISOString().split('T')[0];
    },

    // The inverse: given only an expiry, the test was a standard year earlier.
    // This is an estimate, which is why records dated this way carry NO mileage —
    // a guessed date paired with today's odometer would land a false reading in
    // getOdometerReadings and wreck the km/day rate every projection depends on.
    inspectionDateFrom(expiryDate) {
        const d = new Date(expiryDate || Date.now());
        if (isNaN(d)) return '';
        d.setMonth(d.getMonth() - this.INSPECTION_MONTHS);
        return d.toISOString().split('T')[0];
    },

    DOCS: [
        { key: 'insuranceExpiry',    label: 'Insurance',           icon: 'shield' },
        { key: 'registrationExpiry', label: 'Registration',        icon: 'doc' },
        { key: 'fahesExpiry',        label: 'Periodic Inspection', icon: 'check' }
    ],

    docStatus(car, key) {
        const date = car[key];
        if (!date) return { state: 'missing', label: t('Not set'), days: null };
        const days = Math.ceil((new Date(date) - new Date()) / 86400000);
        if (days < 0)  return { state: 'expired',  label: t('Expired'),  days, date };
        if (days <= 30) return { state: 'soon',    label: t('{d}d left', { d: days }), days, date };
        return { state: 'valid', label: t('Valid'), days, date };
    },

    renderDocuments(carId) {
        const el = document.getElementById('documents-section');
        if (!el) return;
        const cars = Storage.getCars().filter(c => carId === 'all' || c.id === carId);
        if (!cars.length) { el.innerHTML = ''; return; }

        const icons = {
            shield: '<path d="M12 3l7 3v6c0 4.2-3 8-7 9-4-1-7-4.8-7-9V6l7-3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
            doc: '<rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 8h6M9 12h6M9 16h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
            check: '<path d="M12 3l7 3v6c0 4.2-3 8-7 9-4-1-7-4.8-7-9V6l7-3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M9 12l2 2 4-4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        };

        el.innerHTML = cars.map(car => `<div class="docs-card">
            <div class="docs-head">
                <span class="docs-title">${t('Documents')}</span>
                ${cars.length > 1 ? `<span class="docs-car">${car.make} ${car.model}</span>` : ''}
            </div>
            <div class="docs-list">${this.DOCS.map(d => {
                const st = this.docStatus(car, d.key);
                return `<button type="button" class="doc-row doc-${st.state}" onclick="Features.openDocumentModal('${car.id}','${d.key}')">
                    <span class="doc-icon"><svg viewBox="0 0 24 24" width="20" height="20">${icons[d.icon]}</svg></span>
                    <span class="doc-text">
                        <span class="doc-name">${t(d.label)}</span>
                        <span class="doc-sub">${st.date ? st.date : t('Tap to add')}</span>
                    </span>
                    <span class="doc-badge badge-${st.state === 'expired' ? 'red' : st.state === 'soon' ? 'orange' : st.state === 'missing' ? 'blue' : 'green'}">${st.label}</span>
                </button>`;
            }).join('')}</div>
        </div>`).join('');
    },

    // One focused screen per document. The inspection carries extra fields
    // because a certificate is evidence, not just a date.
    openDocumentModal(carId, key) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const doc = this.DOCS.find(d => d.key === key);
        const isInspection = key === 'fahesExpiry';
        const today = Storage.today();

        const last = isInspection
            ? Storage.getServices(carId).filter(s => s.type === 'Periodic Inspection')
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
            : null;

        const html = `
            <p class="doc-intro">${t(isInspection
                ? 'Enter the expiry date printed on your certificate. Everything below it is optional.'
                : 'Update the expiry date shown on the document.')}</p>
            ${isInspection ? `
            <div class="form-group" id="d-expiry-wrap">
                <label>${t('Expiry date')}</label>
                <input type="date" id="d-expiry" value="${car[key] || ''}">
                <small class="field-note">${t('The date printed on your certificate.')}</small>
            </div>
            <div class="form-group"><label>${t('Result')}</label>
                <select id="d-result" onchange="Features._docResultChanged()">
                    <option value="pass">${t('Passed')}</option>
                    <option value="advisory">${t('Passed with advisories')}</option>
                    <option value="fail">${t('Failed')}</option>
                </select>
            </div>
            <div class="derived" id="d-derived"></div>
            <div class="form-row">
                <div class="form-group"><label>${t('Inspection centre')}</label>
                    <select id="d-centre"><option value="">${t('Not recorded')}</option>${Features.INSPECTION_CENTRES.map(c =>
                        `<option value="${c}" ${last && last.inspectionCenter === c ? 'selected' : ''}>${t(c)}</option>`).join('')}</select>
                </div>
                <div class="form-group"><label>${t('Cost (SAR)')}</label><input type="number" id="d-cost" placeholder="0"></div>
            </div>
            <small class="field-note">${t('Filling in a centre or a cost also saves this to your service history.')}</small>` : `
            <div class="form-group">
                <label>${t('Expiry date')}</label>
                <input type="date" id="d-expiry" value="${car[key] || ''}">
            </div>`}`;

        App.openModal(t(doc.label), html, () => {
            if (!isInspection) {
                const expiry = document.getElementById('d-expiry').value;
                if (!expiry) return alert(t('Please choose the expiry date.'));
                Storage.updateCar(carId, { [key]: expiry });
                Storage.syncDocumentReminders(carId);
                App.closeModal(); App.renderPage(App.currentPage);
                return;
            }
            const result = document.getElementById('d-result').value;
            const failed = result === 'fail';
            const expiry = failed ? '' : document.getElementById('d-expiry').value;
            const centre = document.getElementById('d-centre').value.trim();
            const cost = document.getElementById('d-cost').value.trim();
            if (!failed && !expiry) return alert(t('Please choose the expiry date.'));

            // Only keep a service record when there is something in it beyond the
            // date itself — otherwise correcting a typo would file a second inspection.
            if (centre || cost || result !== 'pass') {
                // A failure happened recently enough to be worth dating today; a pass
                // is dated back from the expiry, and carries no mileage because that
                // date is a guess (see inspectionDateFrom).
                Storage.addService({
                    carId, type: 'Periodic Inspection',
                    date: failed ? today : Features.inspectionDateFrom(expiry),
                    cost: cost || '0',
                    mileage: failed ? String(Storage.getEffectiveMileage(car) || '') : '',
                    notes: failed ? '' : 'Date estimated from the certificate expiry',
                    bills: [],
                    inspectionResult: result,
                    inspectionExpiry: expiry,
                    inspectionCenter: centre
                });
            }
            // Sets fahesExpiry on a pass, or books the 30-day re-test from today on a failure
            App._applyInspection(carId, { inspectionResult: result, inspectionExpiry: expiry }, today);
            App.closeModal(); App.renderPage(App.currentPage);
        });
        setTimeout(() => this._docResultChanged(), 40);
    },

    // A failure grants no certificate, so there is no expiry to type — the field
    // is taken away rather than left there inviting a made-up date.
    _docResultChanged() {
        const box = document.getElementById('d-derived');
        const wrap = document.getElementById('d-expiry-wrap');
        if (!box) return;
        const failed = (document.getElementById('d-result') || {}).value === 'fail';
        if (wrap) wrap.style.display = failed ? 'none' : '';
        if (failed) {
            box.style.display = '';
            box.className = 'derived derived-warn';
            box.innerHTML = `<span class="derived-label">${t('Certificate')}</span>
                <span class="derived-value">${t('None — a re-test is due in 30 days')}</span>
                <span class="derived-note">${t('Counted from today')}</span>`;
            return;
        }
        // On a pass the expiry is typed, not worked out, so there is nothing to show
        box.style.display = 'none';
        box.innerHTML = '';
    },

    // ── Trip planner ──────────────────────────────────────────────────────
    // Two questions in one screen: what does this drive cost, and what runs out
    // while I am a long way from my own workshop.
    openTripModal(carId = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const target = carId || (App.selectedCarId !== 'all' ? App.selectedCarId : cars[0].id);
        const html = `
            <p class="doc-intro">${t('How far are you going? Tick return for a round trip.')}</p>
            ${cars.length > 1 ? `<div class="form-group"><label>${t('Car')}</label><select id="f-trip-car" onchange="Features._paintTrip()">${cars.map(c => `<option value="${c.id}" ${c.id === target ? 'selected' : ''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>` : `<input type="hidden" id="f-trip-car" value="${target}">`}
            <div class="form-group"><label>${t('One-way distance (km)')}</label><input type="number" id="f-trip-km" inputmode="numeric" placeholder="400" oninput="Features._paintTrip()"></div>
            <label class="trip-return"><input type="checkbox" id="f-trip-return" checked onchange="Features._paintTrip()"> ${t('Return trip')}</label>
            <div id="trip-result"></div>`;
        App.openModal(t('Plan a trip'), html, null);
        // nothing to save — this screen only answers a question
        document.getElementById('modal-save').style.display = 'none';
        setTimeout(() => { const i = document.getElementById('f-trip-km'); if (i) i.focus(); }, 60);
    },

    _paintTrip() {
        const box = document.getElementById('trip-result');
        if (!box) return;
        const carId = document.getElementById('f-trip-car').value;
        const oneWay = parseInt(document.getElementById('f-trip-km').value) || 0;
        const isReturn = document.getElementById('f-trip-return').checked;
        const km = oneWay * (isReturn ? 2 : 1);
        if (!km) { box.innerHTML = ''; return; }
        const p = Storage.planTrip(carId, km);
        if (!p) { box.innerHTML = ''; return; }

        const money = n => Math.round(n).toLocaleString();
        const row = (cls, title, sub) => `<div class="trip-item ${cls}"><div class="trip-item-title">${title}</div><div class="trip-item-sub">${sub}</div></div>`;
        let out = `<div class="trip-cost">
            <div class="trip-cost-main">${money(p.totalCost)} <small>${t('SAR')}</small></div>
            <div class="trip-cost-sub">${t('{km} km', {km: km.toLocaleString()})}${p.litres ? ' &middot; ' + Math.round(p.litres) + ' ' + t('L') : ''}${p.fuelCost !== null ? ' &middot; ' + t('fuel {a} + wear {b}', {a: money(p.fuelCost), b: money(p.wearCost || 0)}) : ' &middot; ' + t('set your fuel figures to include petrol')}</div>
        </div>`;

        // Blocking things first: overdue before you leave, then anything that
        // runs out mid-journey, when you are furthest from your own workshop.
        p.overdue.forEach(st => out += row('trip-bad',
            t('{type} is already overdue', {type: I18N.t(st.type)}), st.detail));
        if (p.tyreRunsOut) out += row('trip-bad', t('Tyres run out during this trip'),
            t('about {km} km in', {km: p.tyreRunsOut.intoTrip.toLocaleString()}) + ' &middot; ' + p.tyre.detail);
        p.during.forEach(st => out += row('trip-warn',
            t('{type} falls due during this trip', {type: I18N.t(st.type)}),
            t('about {km} km in', {km: st.intoTrip.toLocaleString()}) + ' &middot; ' + t('at {km} km', {km: st.atKm.toLocaleString()})));

        if (!p.overdue.length && !p.during.length && !p.tyreRunsOut) {
            out += row('trip-ok', t('Nothing falls due on this trip'), t('based on what the app knows about this car'));
        }
        if (p.unknown.length) out += row('trip-unknown',
            t('{n} services have no record', {n: p.unknown.length}),
            t('this check cannot see those \u2014 fill them in for a complete answer'));
        box.innerHTML = out;
    },

    // ── Backfill: telling the app what happened before you started logging ──
    // Most owners start logging partway through a car's life, so a missing record
    // usually means "not logged yet", not "never done". This turns those unknowns
    // into knowns cheaply: one row per item, fill in what you remember, leave the
    // rest blank. Nothing is invented — a blank row stays unknown.
    openBackfillModal(carId) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const unknown = Recommendations.unknownTypes(car);
        if (!unknown.length) return alert(t('Every scheduled service already has a record.'));

        const html = `
            <p class="doc-intro">${t('These have no record yet, so the schedule cannot judge them. Fill in whatever you remember — a rough date is far better than nothing. Leave a row blank to keep it unknown.')}</p>
            <div class="backfill-list">${unknown.map(type => {
                const id = 'bf-' + type.toLowerCase().replace(/\s+/g, '-');
                return `<div class="backfill-row">
                    <div class="backfill-name">${I18N.t(type)}</div>
                    <div class="backfill-inputs">
                        <input type="date" id="${id}-date" aria-label="${t('Date')}">
                        <input type="number" id="${id}-km" placeholder="${t('km (optional)')}" aria-label="${t('Odometer (km)')}">
                    </div>
                </div>`;
            }).join('')}</div>
            <small class="field-note">${t('Only fill the odometer if you actually know it. A guessed reading would distort the driving-rate estimate everything else depends on.')}</small>`;

        App.openModal(t('Fill in what you know'), html, () => {
            let added = 0;
            unknown.forEach(type => {
                const id = 'bf-' + type.toLowerCase().replace(/\s+/g, '-');
                const date = (document.getElementById(id + '-date') || {}).value || '';
                const km = ((document.getElementById(id + '-km') || {}).value || '').trim();
                if (!date && !km) return;                       // blank stays unknown
                Storage.addService({
                    carId, type,
                    // A km with no date still needs one to sit on the timeline; use today's
                    // only when the owner gave a reading, never to invent a service event.
                    date: date || Storage.today(),
                    cost: '', mileage: km, bills: [],
                    notes: 'Recorded from memory, before logging started',
                    backfilled: true
                });
                added++;
            });
            App.closeModal();
            App.renderPage(App.currentPage);
            if (added) alert(t('{n} added. The schedule can judge these now.', { n: added }));
        });
    },

    // ── Service Insights ──
    // What the records already know but never said: how the interval you actually
    // achieve compares with the recommended one, and what that habit costs a year.
    renderServiceInsights(carId) {
        const el = document.getElementById('insights-section');
        if (!el) return;
        const groups = Storage.getServiceInsights(carId);
        if (!groups.length) {
            el.innerHTML = '<div class="card"><h3>' + t('Service Insights') + '</h3>' +
                '<p class="insight-empty">' + t('Log the same service twice, each with its mileage, and this will compare the interval you actually achieve against the recommended one.') + '</p></div>';
            return;
        }
        const badge = { frequent: 'blue', onschedule: 'green', stretched: 'orange' };
        const rowHTML = (i) => {
            const parts = [];
            parts.push('<div class="insight-row">');
            parts.push('<div class="insight-top"><span class="insight-type">' + I18N.t(i.type) + '</span>');
            if (i.verdict) parts.push('<span class="badge badge-' + badge[i.verdict] + '">' + t(i.note) + '</span>');
            parts.push('</div>');

            parts.push('<div class="insight-nums">');
            parts.push('<span>' + t('You') + ': <strong>' + i.avgKm.toLocaleString() + ' ' + t('km') + '</strong></span>');
            if (i.recKm) parts.push('<span>' + t('Recommended') + ': <strong>' + i.recKm.toLocaleString() + ' ' + t('km') + '</strong></span>');
            if (i.avgCost) parts.push('<span>' + t('Avg cost') + ': <strong>' + i.avgCost.toFixed(0) + ' ' + t('SAR') + '</strong></span>');
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
                parts.push('<div class="insight-note">' + t('About {sar} SAR a year more than following the schedule — roughly {a} times a year instead of {b}. Reasonable on a high-mileage engine if it is deliberate.',
                    { sar: Math.round(i.yearlyDelta), a: times, b: wouldBe }) + '</div>');
            } else if (i.verdict === 'stretched' && i.ratio) {
                parts.push('<div class="insight-note">' + t('Running about {p}% past the recommended interval.', { p: Math.round((i.ratio - 1) * 100) }) + '</div>');
            }

            parts.push('</div>');
            return parts.join('');
        };

        el.innerHTML = groups.map(g =>
            '<div class="card insight-card"><h3>' + t('Service Insights') +
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

        let items = [];
        const today = new Date();
        const recTypes = Recommendations.ALL_TYPES;

        cars.forEach(c => {
            const name = `${c.make} ${c.model}`;
            // Odometer freshness — km-based reminders are only as good as the last reading
            const fresh = Storage.getOdometerFreshness(c);
            if (fresh.never || fresh.daysSince === null) {
                items.push({ priority: 1, icon: 'gauge', title: t('Add an odometer reading'), sub: `${name} · ${t('needed to track km-based services')}`, action: { label: t('Update'), fn: `Features.openOdometerModal('${c.id}')` } });
            } else if (fresh.stale) {
                items.push({ priority: fresh.daysSince >= 60 ? 1 : 2, icon: 'gauge', title: t('Odometer not updated in {d} days', {d: fresh.daysSince}), sub: `${name} · ${t('last read {km} km on {d}', {km: fresh.lastKm.toLocaleString(), d: fresh.lastDate})}`, action: { label: t('Update'), fn: `Features.openOdometerModal('${c.id}')` } });
            }
            // Maintenance schedule (whichever comes first)
            recTypes.forEach(type => {
                const st = Recommendations.getMaintenanceStatus(c, type);
                if (!st || st.status === 'ok' || st.status === 'unknown') return;
                items.push({
                    priority: st.status === 'overdue' ? 0 : 1,
                    icon: 'wrench', carId: c.id, type,
                    title: st.status === 'overdue' ? t('{type} overdue', {type: I18N.t(type)}) : t('{type} due soon', {type: I18N.t(type)}),
                    sub: `${name} · ${st.detail}`,
                    action: { label: t('Log'), fn: `App.openServiceModal(null,'${c.id}','${type}')` }
                });
            });
            // Services with no record at all. One entry, not one per item — seven
            // separate alarms would be noise, and none of them is actually overdue.
            const unknown = Recommendations.unknownTypes(c);
            if (unknown.length) {
                items.push({
                    priority: 2, icon: 'wrench',
                    title: t('{n} services have no record', { n: unknown.length }),
                    sub: `${name} · ${t('the schedule cannot judge these until it knows when they were last done')}`,
                    action: { label: t('Fill in'), fn: `Features.openBackfillModal('${c.id}')` }
                });
            }
            // Documents
            if (c.insuranceExpiry) {
                const d = Math.ceil((new Date(c.insuranceExpiry) - today) / 86400000);
                const open = { label: t('Update'), fn: `Features.openDocumentModal('${c.id}','insuranceExpiry')` };
                if (d < 0) items.push({ priority: 0, icon: 'shield', title: t('Insurance expired'), sub: `${name} · ${c.insuranceExpiry}`, action: open });
                else if (d <= 30) items.push({ priority: 1, icon: 'shield', title: t('Insurance expires in {d} days', {d}), sub: name, action: open });
            }
            // Fahes (periodic technical inspection)
            const fahesDays = c.fahesExpiry ? Math.ceil((new Date(c.fahesExpiry) - today) / 86400000) : null;
            if (fahesDays !== null) {
                const open = { label: t('Update'), fn: `Features.openDocumentModal('${c.id}','fahesExpiry')` };
                if (fahesDays < 0) items.push({ priority: 0, icon: 'doc', title: t('Fahes (inspection) expired'), sub: `${name} · ${c.fahesExpiry}`, action: open });
                else if (fahesDays <= 30) items.push({ priority: 1, icon: 'doc', title: t('Fahes expires in {d} days', {d: fahesDays}), sub: name, action: open });
            }
            if (c.registrationExpiry) {
                const d = Math.ceil((new Date(c.registrationExpiry) - today) / 86400000);
                // Istimara renewal needs a valid Fahes and insurance, so say which to do first
                const insDays = c.insuranceExpiry ? Math.ceil((new Date(c.insuranceExpiry) - today) / 86400000) : null;
                const blockers = [];
                if (fahesDays !== null && fahesDays < d) blockers.push('Fahes');
                if (insDays !== null && insDays < d) blockers.push('insurance');
                const chain = (d <= 60 && blockers.length) ? ` · ${t('renew {what} first', {what: blockers.map(x => t(x === 'Fahes' ? 'Fahes' : 'Insurance')).join(' + ')})}` : '';
                const open = { label: t('Update'), fn: `Features.openDocumentModal('${c.id}','registrationExpiry')` };
                if (d < 0) items.push({ priority: 0, icon: 'doc', title: t('Registration (Istimara) expired'), sub: `${name} · ${c.registrationExpiry}${chain}`, action: open });
                else if (d <= 30) items.push({ priority: 1, icon: 'doc', title: t('Registration expires in {d} days', {d}), sub: name + chain, action: open });
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
                    items.push({ priority: 0, icon: 'wrench', title: t('{t} at {mm} mm — replace now', {t: I18N.t(axle), mm}), sub: `${name} · ${t('measured {d}', {d: padLog.date})}`, action: { label: t('Log'), fn: `App.openServiceModal(null,'${c.id}','${axle}')` } });
                } else if (mm <= 4.5) {
                    items.push({ priority: 1, icon: 'wrench', title: t('{t} low ({mm} mm)', {t: I18N.t(axle), mm}), sub: `${name} · ${t('replace at 3 mm')} · ${t('measured {d}', {d: padLog.date})}`, action: { label: t('Log'), fn: `App.openServiceModal(null,'${c.id}','${axle}')` } });
                }
            });
            // Warranty
            if (c.warrantyExpiry) {
                const d = Math.ceil((new Date(c.warrantyExpiry) - today) / 86400000);
                if (d >= 0 && d <= 60) items.push({ priority: 2, icon: 'star', title: t('Vehicle warranty ends in {d} days', {d}), sub: `${name} · ${t('use it before it expires')}`, action: null });
            }
            // Fuel anomaly
            const anomaly = Storage.getFuelAnomaly(c.id);
            if (anomaly) items.push({ priority: 1, icon: 'fuel', title: t('Fuel use up {p}%', {p: anomaly.pct}), sub: `${name} · ${t('{a} vs {b} L/100km average — check tyre pressure and the air filter', {a: anomaly.latest, b: anomaly.avg})}`, action: null });
            // Tyres — judged on distance covered and on rubber age, whichever runs
            // out first. At high annual mileage distance almost always binds first.
            const tyre = Storage.getTyreStatus(c);
            if (tyre && tyre.status !== 'ok') {
                const why = tyre.reason === 'age'
                    ? t('rubber hardens with age regardless of tread')
                    : t('tread wears with distance');
                items.push({
                    priority: tyre.status === 'replace' ? 0 : 1,
                    icon: 'shield',
                    title: tyre.status === 'replace' ? t('Tyres need replacing') : t('Tyres are near the end of their life'),
                    sub: `${name} · ${tyre.detail}${tyre.daysLeft !== null ? ' · ' + t('about {d} days at your rate', {d: tyre.daysLeft}) : ''} · ${why}`,
                    action: { label: t('Log'), fn: `App.openServiceModal(null,'${c.id}','Tires')` }
                });
            }
            // No tyre information at all is itself worth saying on a car doing this
            // kind of distance — tyres are the main safety item at highway speed.
            if (!tyre) {
                items.push({
                    priority: 2, icon: 'shield',
                    title: t('No tyre record'),
                    sub: `${name} · ${t('add when they were fitted so wear and age can be tracked')}`,
                    action: { label: t('Tyres'), fn: `Features.openTireModal('${c.id}')` }
                });
            }
            // Part warranties about to lapse — worth checking the part before cover ends
            Storage.getActiveWarranties(c.id).forEach(w => {
                if (w.warranty.status !== 'expiring') return;
                items.push({
                    priority: 2, icon: 'shield',
                    title: t('Warranty ending: {part}', {part: esc(w.bill.label) || I18N.t(w.bill.kind)}),
                    sub: `${name} · ${w.warranty.detail}${w.bill.vendor ? ' · ' + esc(w.bill.vendor) : ''}`,
                    action: { label: t('View'), fn: `App.navigate('warranty')` }
                });
            });
            // Manual reminders not covered by the schedule
            Storage.getUpcomingReminders(c.id).forEach(r => {
                if (r.autoCreated || recTypes.includes(r.type)) return;
                const st = Storage.getReminderStatus(r, c);
                if (st.effDays === null || st.effDays > 30) return;
                const late = st.status === 'overdue';
                items.push({ priority: late ? 0 : 1, icon: 'bell', title: t(late ? '{type} overdue' : '{type} due soon', {type: I18N.t(r.type)}), sub: `${name} · ${st.detail}`, action: null });
            });
        });

        // Backup nudge — everything lives in this browser, so an old backup is a real risk
        const backup = Storage.getBackupStatus();
        if (backup.never && cars.length) {
            items.push({ priority: 1, icon: 'save', title: t('No backup yet'), sub: t('Your records live only in this browser — save a copy to Files or iCloud Drive'), action: { label: t('Back up'), fn: 'Features.exportData()' } });
        } else if (backup.needed) {
            items.push({ priority: 1, icon: 'save', title: t('Last backup was {d} days ago', {d: backup.daysSinceBackup}), sub: t('You have changes since then — save a fresh copy'), action: { label: t('Back up'), fn: 'Features.exportData()' } });
        }

        // Postponed items leave the main list but never leave the screen — they
        // move to their own line with the date they come back and how overdue
        // they still are. The schedule was never told anything.
        const postponed = [];
        const live = items.filter(it => {
            if (!it.type) return true;
            const sn = Storage.getSnooze(it.carId, it.type);
            if (!sn) return true;
            postponed.push({ ...it, snooze: sn });
            return false;
        });
        items = live;
        items.sort((a, b) => a.priority - b.priority);

        if (!items.length) {
            el.innerHTML = `<div class="nd-list"><div class="nd-row nd-ok">
                <span class="nd-bar" aria-hidden="true"></span>
                <div class="nd-body"><div class="nd-title">${t("All caught up")}</div><div class="nd-sub">${t("No maintenance, documents, or alerts need attention right now.")}</div></div>
            </div></div>` + this.postponedHTML(postponed);
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
        // Severity is carried by a left rule and by position in the list, so colour is
        // never the only signal. No icon tile, no all-caps eyebrow, no shadow per row.
        // priority 2 is "worth knowing", not "healthy" — green would read as fine,
        // and six unrecorded services are the opposite of fine.
        const pClass = ['nd-crit', 'nd-warn', 'nd-unknown'];
        const shown = items.slice(0, 6);
        el.innerHTML = `<div class="nd-list">
            <div class="nd-head"><h3>${t("Needs attention")}</h3><span class="nd-head-meta">${
                items.length > 1 ? t('{n} items', {n: items.length}) : t('{n} item', {n: items.length})}</span></div>
            ${shown.map(it => `
                <div class="nd-row ${pClass[it.priority]}">
                    <span class="nd-bar" aria-hidden="true"></span>
                    <div class="nd-body"><div class="nd-title">${it.title}</div><div class="nd-sub">${it.sub}</div></div>
                    <div class="nd-acts">
                        ${it.action ? `<button type="button" class="nd-act" onclick="${it.action.fn}">${it.action.label}</button>` : ''}
                        ${it.type ? `<button type="button" class="nd-act nd-act-quiet" onclick="Features.openSnoozeModal('${it.carId}','${it.type}')">${t('Later')}</button>` : ''}
                    </div>
                </div>`).join('')}
            ${items.length > 6 ? `<div class="nd-row"><div class="nd-sub">${t('+ {n} more', {n: items.length - 6})}</div></div>` : ''}
        </div>` + this.postponedHTML(postponed);
    },

    // Postponed work, shown rather than hidden. It still says how overdue the job
    // is, because postponing was only ever about when you are reminded.
    postponedHTML(postponed) {
        if (!postponed || !postponed.length) return '';
        return `<div class="nd-list nd-postponed">
            <div class="nd-head"><h3>${t('Postponed')}</h3><span class="nd-head-meta">${
                postponed.length > 1 ? t('{n} items', {n: postponed.length}) : t('{n} item', {n: postponed.length})}</span></div>
            ${postponed.map(it => `
                <div class="nd-row nd-later">
                    <span class="nd-bar" aria-hidden="true"></span>
                    <div class="nd-body">
                        <div class="nd-title">${it.title}</div>
                        <div class="nd-sub">${t('back on {d}', {d: it.snooze.until})}${
                            it.snooze.times > 1 ? ' · ' + t('postponed {n} times', {n: it.snooze.times}) : ''} · ${it.sub}</div>
                    </div>
                    <div class="nd-acts">
                        ${it.action ? `<button type="button" class="nd-act" onclick="${it.action.fn}">${it.action.label}</button>` : ''}
                        <button type="button" class="nd-act nd-act-quiet" onclick="Features.unsnooze('${it.carId}','${it.type}')">${t('Undo')}</button>
                    </div>
                </div>`).join('')}
        </div>`;
    },

    unsnooze(carId, type) {
        Storage.clearSnooze(carId, type);
        App.renderPage(App.currentPage);
    },

    SNOOZE_CHOICES: [
        { days: 7,  label: 'Next week' },
        { days: 30, label: 'Next month' },
        { days: 90, label: 'In three months' }
    ],

    openSnoozeModal(carId, type) {
        const car = Storage.getCars().find(c => c.id === carId);
        const st = car ? Recommendations.getMaintenanceStatus(car, type) : null;
        const existing = Storage.getSnooze(carId, type);
        const html = `
            <p class="doc-intro">${t('This stays due. Postponing only changes when the app brings it up again.')}</p>
            ${st ? `<div class="derived"><span class="derived-label">${I18N.t(type)}</span>
                <span class="derived-value">${st.detail}</span></div>` : ''}
            <div class="snooze-choices">
                ${this.SNOOZE_CHOICES.map(c =>
                    `<button type="button" class="snooze-choice" onclick="Features.applySnooze('${carId}','${type}',${c.days})">${t(c.label)}</button>`).join('')}
            </div>
            <div class="form-group"><label>${t('Or pick a date')}</label>
                <input type="date" id="f-snooze-date" min="${Storage.dateStr(new Date(Date.now() + 86400000))}"></div>
            <div class="form-group"><label>${t('Why? (optional)')}</label>
                <input type="text" id="f-snooze-note" placeholder="${t('e.g. waiting for payday')}" value="${esc(existing && existing.note)}"></div>`;
        App.openModal(t('Postpone {type}', { type: I18N.t(type) }), html, () => {
            const d = document.getElementById('f-snooze-date').value;
            if (!d) return alert(t('Choose how long, or pick a date.'));
            const days = Math.ceil((new Date(d) - new Date()) / 86400000);
            Features.applySnooze(carId, type, days);
        });
    },

    applySnooze(carId, type, days) {
        const note = (document.getElementById('f-snooze-note') || {}).value || '';
        const until = Storage.snoozeItem(carId, type, days, note.trim());
        App.closeModal();
        App.renderPage(App.currentPage);
        alert(t('Postponed. It comes back on {d}, and stays due until you log it.', { d: until }));
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
            fc.items.forEach(i => {
                const g = grouped[i.type] = grouped[i.type] || { est: 0, times: 0 };
                g.est += i.est; g.times += i.times || 1;
            });
            forecastHTML = `<div class="card" style="flex:1">
                <h3>${t("6-Month Cost Forecast")}</h3>
                <div class="forecast-total">~ ${fc.total.toFixed(0)} <span>SAR</span></div>
                <div class="forecast-sub">${t("Estimated upcoming maintenance over the next 6 months")}</div>
                <div class="forecast-list">${Object.entries(grouped).sort((a, b) => b[1].est - a[1].est).map(([type, g]) =>
                    `<div class="forecast-row"><span>${I18N.t(type)}${g.times > 1 ? ` <bdi>×${g.times}</bdi>` : ''}</span><span class="forecast-est">~ ${g.est.toFixed(0)} SAR</span></div>`).join('')}</div>
            </div>`;
        }

        // Cost per km per car
        let tcoHTML = '';
        const tcoCars = cars.filter(c => carId === 'all' || c.id === carId).map(c => ({ c, cpk: Storage.getCostPerKm(c.id) })).filter(x => x.cpk !== null);
        if (tcoCars.length) {
            tcoHTML = `<div class="card" style="flex:1">
                <h3>${t("Running Cost (per km)")}</h3>
                <div class="tco-list">${tcoCars.map(({ c, cpk }) =>
                    `<div class="tco-row"><span class="tco-name">${c.make} ${c.model}</span><span class="tco-val">${cpk.toFixed(2)} <small>SAR/km</small></span></div>${Features.costSplitLine(c.id)}`).join('')}</div>
                <div class="forecast-sub" style="margin-top:10px">${t("Total spend ÷ distance driven (fuel + maintenance)")}</div>
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
                ? bills.map(b => `${esc(b.label || b.kind)} — ${esc(b.vendor) || 'shop n/a'} — ${(parseFloat(b.amount) || 0).toFixed(0)} SAR`).join('<br>')
                : esc(s.notes);
            const costNote = s.insurancePaid ? `<br><small>Accident · insurance paid ${Storage.getServiceCost(s).toFixed(0)}</small>`
                : s.accident ? '<br><small>Accident repair</small>' : '';
            return `<tr><td>${s.date}</td><td>${s.type}</td><td>${s.mileage ? parseInt(s.mileage).toLocaleString() + ' km' : '—'}</td><td>${Storage.getOwnCost(s).toFixed(0)} SAR${costNote}</td><td>${detail}</td></tr>`;
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
            <div class="sub">${car.year} ${car.make} ${car.model}${car.plate ? ' · ' + car.plate : ''} · Generated ${Storage.today()}</div>
            <div class="meta">
                <div><span>Current Odometer</span><strong>${Storage.getEffectiveMileage(car).toLocaleString()} km</strong></div>
                <div><span>Total Services</span><strong>${services.length}</strong></div>
                <div><span>Maintenance Spend</span><strong>${svcTotal.toFixed(0)} SAR</strong></div>
                <div><span>Fuel Spend</span><strong>${fuelTotal.toFixed(0)} SAR</strong></div>
                ${cpk ? `<div><span>${t('Running Cost')}</span><strong>${cpk.toFixed(2)} SAR/km</strong></div>` : ''}
            </div>
            ${this.accidentNote(carId) ? `<p class="sub">${this.accidentNote(carId)}</p>` : ''}
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
        services.filter(s => !s.accident).forEach(s => { byType[s.type] = (byType[s.type] || 0) + Storage.getServiceCost(s); });
        if (fuelTotal > 0) byType['Fuel'] = fuelTotal;

        const colors = ['#4f6ef7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#4f46e5', '#65a30d'];
        const entries = Object.entries(byType).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
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
                    <h3>${t("Expense Breakdown")}</h3>
                    <div class="pie-container">
                        <div class="pie-chart" style="background:conic-gradient(${gradientStops})"></div>
                        <div class="pie-legend">${segments.map(s => `<div class="pie-item"><span class="pie-dot" style="background:${s.color}"></span><span class="pie-label">${I18N.t(s.type)}</span><span class="pie-val">${s.cost.toFixed(0)} SAR (${s.pct.toFixed(0)}%)</span></div>`).join('')}</div>
                    </div>
                </div>
                ${cars.length > 1 ? `<div class="card" style="flex:1"><h3>${t("Cost per Car")}</h3><div class="car-compare">${cars.map((c, i) => {
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
            driveHTML = `<div class="analytics-row"><div class="card" style="flex:1"><h3>${t("Driving Pattern")}</h3><div class="drive-stats"><div class="drive-stat"><span class="drive-val">${drive.kmPerDay.toFixed(1)}</span><span class="drive-label">${t("km/day")}</span></div><div class="drive-stat"><span class="drive-val">${drive.kmPerMonth.toFixed(0)}</span><span class="drive-label">${t("km/month")}</span></div><div class="drive-stat"><span class="drive-val">${drive.kmPerYear.toFixed(0)}</span><span class="drive-label">${t("km/year (est)")}</span></div></div></div></div>`;
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
            <button class="quick-btn" onclick="Features.openTripModal()" title="${t('Plan a trip')}"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2" fill="none"/></svg> ${t("Plan a trip")}</button>
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
                    <option value="normal" ${climate === 'normal' ? 'selected' : ''}>${t('Normal')}</option>
                    <option value="severe" ${climate === 'severe' ? 'selected' : ''}>${t('Severe (Hot climate / Saudi Arabia)')}</option>
                </select>
                <small style="color:var(--text3);display:block;margin-top:4px">${t('Severe climate reduces recommended intervals by 20% (heat accelerates wear)')}</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Fuel")}</label>
                <select id="f-fuelmode" onchange="Features._paintFuelSetting()">
                    <option value="off">${t('Not tracked')}</option>
                    <option value="consumption">${t('Consumption and price')}</option>
                    <option value="monthly">${t('Monthly spend')}</option>
                </select>
                <div id="fuel-fields" style="margin-top:10px"></div>
                <div id="fuel-implied" class="derived" style="display:none;margin-top:10px"></div>
                <small style="color:var(--text3);display:block;margin-top:6px">${t('Fuel is usually the largest running cost. Without it, cost per km counts only maintenance.')}</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Backup")}</label>
                <div class="backup-status">${Features.backupStatusLine()}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                    <button class="btn btn-primary btn-sm" onclick="Features.exportData()">${t("Export Backup")}</button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-file').click()">${t("Import Backup")}</button>
                    <input type="file" id="import-file" accept=".json" style="display:none" onchange="Features.importData(this.files[0])">
                </div>
                <small class="field-note">${t("Everything is stored in this browser only. Save the file to Files or iCloud Drive so a lost phone doesn't take your records with it.")}</small>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Recently Deleted")}</label>
                <div id="trash-list">${Features.renderTrash()}</div>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Receipt Storage")}</label>
                <div id="storage-usage" class="backup-status">${t('Checking…')}</div>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t("Notifications")}</label>
                <button class="btn btn-secondary btn-sm" id="btn-notif" onclick="Features.requestNotifications()">${t('Enable Browser Notifications')}</button>
            </div>
            <div class="form-group" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
                <label>${t('Mechanics & Shops')}</label>
                <div id="mechanics-list" style="margin-bottom:8px">${Features.renderMechanicsList()}</div>
                <button class="btn btn-secondary btn-sm" onclick="Features.addMechanicRow()">${t("+ Add Mechanic")}</button>
            </div>`;
        setTimeout(() => {
            const el = document.getElementById('storage-usage');
            if (!el) return;
            Photos.usage().then(u => {
                const mb = u.bytes / 1048576;
                el.innerHTML = u.count
                    ? t('{n} receipt photo(s), about {mb} MB', { n: u.count, mb: mb.toFixed(1) })
                    : t('No receipt photos stored yet');
            }).catch(() => { el.textContent = t('Could not read storage usage'); });
        }, 40);
        setTimeout(() => {
            const m = document.getElementById('f-fuelmode');
            if (m) { m.value = Features.getFuelSettings().mode; Features._paintFuelSetting(); }
        }, 20);
        App.openModal('Settings', html, () => {
            const cl = document.getElementById('f-climate').value;
            localStorage.setItem('autocare_climate', cl);
            const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
            Features.saveFuelSettings({
                mode: val('f-fuelmode') || 'off',
                lp100: val('f-fuellp100'),
                price: val('f-fuelprice') || Features.FUEL_DEFAULTS.price,
                monthly: val('f-fuelmonthly')
            });
            const langEl = document.getElementById('f-lang');
            if (langEl && langEl.value !== I18N.lang) { I18N.set(langEl.value); I18N.translateDOM(); App.paintLang(); }
            Features.saveMechanics();
            App.closeModal();
            App.navigate(App.currentPage);
        });
    },

    backupStatusLine() {
        const b = Storage.getBackupStatus();
        if (b.never) return `<span class="backup-warn">${t('Never backed up')}</span>`;
        const when = Storage.dateStr(new Date(b.lastBackup));
        const age = b.daysSinceBackup === 0 ? t('today') : t('{d}d ago', { d: b.daysSinceBackup });
        if (b.unsavedChanges) return `<span class="backup-warn">${t('Last backup {d} ({age}) — changed since', { d: when, age })}</span>`;
        return `<span class="backup-ok">${t('Last backup {d} ({age}) — up to date', { d: when, age })}</span>`;
    },

    // ── Recently Deleted ──
    renderTrash() {
        const trash = Storage.getTrash();
        if (!trash.length) return `<p class="trash-empty">${t('Nothing deleted in the last 30 days.')}</p>`;
        const describe = e => {
            const r = e.record || {};
            if (e.kind === 'car') {
                const n = e.extras ? (e.extras.services || []).length : 0;
                return `${r.year || ''} ${r.make || ''} ${r.model || ''}`.trim() + (n ? ' · ' + t('{n} services', { n }) : '');
            }
            if (e.kind === 'service') return `${I18N.t(r.type || 'Service')} · ${r.date || ''} · ${Storage.getServiceCost(r).toFixed(0)} SAR`;
            if (e.kind === 'fuel') return `${t('Fuel')} ${r.liters || '?'} L · ${r.date || ''} · ${parseFloat(r.totalCost || 0).toFixed(0)} SAR`;
            if (e.kind === 'reminder') return `${I18N.t(r.type || 'Reminder')} · ${r.dueDate || ''}`;
            return e.kind;
        };
        const label = { car: 'Car', service: 'Service', fuel: 'Fuel', reminder: 'Reminder' };
        return trash.map(e => {
            const daysLeft = Storage.TRASH_DAYS - Math.floor((Date.now() - new Date(e.deletedAt)) / 86400000);
            return `<div class="trash-row">
                <div class="trash-info">
                    <div class="trash-title">${t(label[e.kind] || e.kind)}: ${describe(e)}</div>
                    <div class="trash-sub">${t('Deleted {d} · removed for good in {n} days', { d: Storage.dateStr(new Date(e.deletedAt)), n: daysLeft })}</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="Features.restoreTrash('${e.id}')">${t('Restore')}</button>
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
        if (!('Notification' in window)) { alert(t('Notifications not supported in this browser.')); return; }
        Notification.requestPermission().then(p => {
            if (p === 'granted') {
                alert(t('Notifications enabled! You will be reminded about upcoming services.'));
                Features.scheduleNotifications();
            }
        });
    },

    // Runs inside renderDashboard, so it must never throw: Safari outside the installed
    // app has no Notification at all, and the error stopped the rest of the page drawing.
    // Once a day, because the dashboard redraws constantly and each draw used to fire again.
    scheduleNotifications() {
        if (typeof Notification === 'undefined' || !Notification || Notification.permission !== 'granted') return;
        const today = Storage.today();
        if (localStorage.getItem('autocare_notified') === today) return;
        const cars = Storage.getCars();
        const due = Storage.getUpcomingReminders('all').filter(r => {
            const st = Storage.getReminderStatus(r, cars.find(c => c.id === r.carId)).status;
            return st === 'overdue' || st === 'soon';
        });
        if (!due.length) return;
        localStorage.setItem('autocare_notified', today);
        this._notify(t('AutoCare Reminder'), [...new Set(due.map(r => I18N.t(r.type)))].join(', '));
    },

    // iPhones only show notifications through the service worker
    _notify(title, body) {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.ready
            .then(reg => reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png' }))
            .catch(() => {});
    },

    // Automatic notes are written at display time, from the reminder's own figures, so
    // they read correctly in either language and can't go stale.
    reminderNote(r) {
        if (r.autoCreated && !r.autoDoc && !r.retest && Recommendations.ALL_TYPES.includes(r.type)) {
            const km = parseInt(r.dueMileage) || 0;
            return km ? t('Automatic: next one at {km} km', { km: km.toLocaleString() }) : t('Automatic: from your last service');
        }
        return esc(t(r.notes));
    },

    // ── Mechanics ──
    getMechanics() {
        const raw = localStorage.getItem('autocare_mechanics');
        return raw ? JSON.parse(raw) : [];
    },

    renderMechanicsList() {
        const mechs = this.getMechanics();
        if (!mechs.length) return `<p style="font-size:12px;color:var(--text3)">${t('No saved mechanics yet.')}</p>`;
        return mechs.map((m, i) => `<div class="mechanic-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
            <input type="text" class="mech-name" value="${esc(m.name)}" placeholder="${t('Name')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-phone" value="${esc(m.phone)}" placeholder="${t('Phone')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-specialty" value="${esc(m.specialty)}" placeholder="${t('Specialty')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">X</button>
        </div>`).join('');
    },

    addMechanicRow() {
        const list = document.getElementById('mechanics-list');
        const row = document.createElement('div');
        row.className = 'mechanic-row';
        row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
        row.innerHTML = `<input type="text" class="mech-name" placeholder="${t('Name')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-phone" placeholder="${t('Phone')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
            <input type="text" class="mech-specialty" placeholder="${t('Specialty')}" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--card);color:var(--text)">
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

    // "Maintenance 0.03 · Fuel 0.26" under the headline figure. Fuel is an
    // estimate, not a logged total, so it is always labelled as one.
    costSplitLine(carId) {
        const b = Storage.getCostBreakdown(carId);
        if (!b || !b.fuelEstimated) return '';
        return `<div class="cost-split">${t('Maintenance')} <b>${b.maintPerKm.toFixed(2)}</b>` +
            ` &middot; ${t('Fuel (est.)')} <b>${b.fuelPerKm.toFixed(2)}</b>` +
            ` &middot; ${t('Total')} <b>${b.totalPerKm.toFixed(2)}</b> ${t('SAR/km')}</div>`;
    },

    // ── Fuel estimate ──────────────────────────────────────────────────────
    // Fuel is by far the largest running cost, and tank-by-tank logging never
    // happens in practice. So it is estimated from one setting instead, in
    // whichever form the owner can actually answer:
    //   'consumption' — L/100km and price per litre, scales with distance driven
    //   'monthly'     — one spend figure, divided across the period
    //   'off'         — no estimate; cost-per-km stays maintenance only
    // The setting is in SETTING_KEYS, so it rides along in backups. Leaving it
    // out would understate every cost figure after a restore, exactly as
    // omitting the climate multiplier once silently lengthened every interval.
    FUEL_KEY: 'autocare_fuel',
    FUEL_DEFAULTS: { mode: 'off', lp100: '', price: '2.33', monthly: '' },

    getFuelSettings() {
        try {
            const raw = localStorage.getItem(this.FUEL_KEY);
            return raw ? { ...this.FUEL_DEFAULTS, ...JSON.parse(raw) } : { ...this.FUEL_DEFAULTS };
        } catch (e) { return { ...this.FUEL_DEFAULTS }; }
    },

    saveFuelSettings(next) {
        localStorage.setItem(this.FUEL_KEY, JSON.stringify({ ...this.getFuelSettings(), ...next }));
    },

    // Estimated fuel cost over a given distance. Returns null when switched off
    // or not configured, so callers can tell "no estimate" from "zero".
    getFuelEstimateFor(carId, km) {
        const f = this.getFuelSettings();
        if (!km || km <= 0) return null;
        if (f.mode === 'consumption') {
            const lp100 = parseFloat(f.lp100), price = parseFloat(f.price);
            if (!(lp100 > 0) || !(price > 0)) return null;
            const litres = km * lp100 / 100;
            return { cost: litres * price, litres, lp100, source: 'consumption' };
        }
        if (f.mode === 'monthly') {
            const monthly = parseFloat(f.monthly);
            if (!(monthly > 0)) return null;
            const rate = Storage.getDailyKmRate(carId);
            if (!rate || rate <= 0) return null;
            const days = km / rate;
            const cost = monthly * (days / 30.44);
            const price = parseFloat(f.price) || 0;
            // Work the consumption back out so a mistyped figure is visible
            const litres = price > 0 ? cost / price : null;
            return { cost, litres, lp100: litres ? litres / km * 100 : null, source: 'monthly' };
        }
        return null;
    },

    // A Taurus 3.5 outside this band means the number is probably wrong.
    PLAUSIBLE_LP100: [4, 25],
    fuelSanity(lp100) {
        if (!(lp100 > 0)) return null;
        const [lo, hi] = this.PLAUSIBLE_LP100;
        if (lp100 < lo) return { ok: false, why: t('That is unusually low for a petrol car — check the figure.') };
        if (lp100 > hi) return { ok: false, why: t('That is unusually high — check the figure.') };
        return { ok: true };
    },

    // Show only the fields the chosen mode needs, and always show what the numbers
    // imply in L/100km — a mistyped figure is obvious there and nowhere else.
    _paintFuelSetting() {
        const modeEl = document.getElementById('f-fuelmode');
        const fields = document.getElementById('fuel-fields');
        const implied = document.getElementById('fuel-implied');
        if (!modeEl || !fields) return;
        const f = this.getFuelSettings();
        const mode = modeEl.value;
        const price = `<div class="form-group"><label>${t('Price/Liter (SAR)')}</label><input type="number" id="f-fuelprice" step="0.01" value="${f.price || ''}" oninput="Features._paintFuelSetting()"></div>`;
        if (mode === 'consumption') {
            fields.innerHTML = `<div class="form-row"><div class="form-group"><label>${t('Consumption (L/100km)')}</label><input type="number" id="f-fuellp100" step="0.1" placeholder="11" value="${f.lp100 || ''}" oninput="Features._paintFuelSetting()"></div>${price}</div>`;
        } else if (mode === 'monthly') {
            fields.innerHTML = `<div class="form-row"><div class="form-group"><label>${t('Spend per month (SAR)')}</label><input type="number" id="f-fuelmonthly" step="1" placeholder="900" value="${f.monthly || ''}" oninput="Features._paintFuelSetting()"></div>${price}</div>`;
        } else {
            fields.innerHTML = '';
            implied.style.display = 'none';
            return;
        }
        // preview against a year of the owner's actual driving
        const car = Storage.getCars()[0];
        const rate = car ? Storage.getDailyKmRate(car.id) : null;
        const kmYear = rate ? rate * 365 : null;
        const lp100El = document.getElementById('f-fuellp100');
        const monthlyEl = document.getElementById('f-fuelmonthly');
        const priceEl = document.getElementById('f-fuelprice');
        const p = parseFloat(priceEl && priceEl.value) || 0;
        let lp100 = null, yearly = null;
        if (mode === 'consumption') {
            lp100 = parseFloat(lp100El && lp100El.value) || 0;
            if (lp100 > 0 && p > 0 && kmYear) yearly = kmYear * lp100 / 100 * p;
        } else {
            const m = parseFloat(monthlyEl && monthlyEl.value) || 0;
            if (m > 0) {
                yearly = m * 12;
                if (p > 0 && kmYear) lp100 = (yearly / p) / kmYear * 100;
            }
        }
        if (!yearly) { implied.style.display = 'none'; return; }
        const sanity = lp100 ? this.fuelSanity(lp100) : null;
        implied.style.display = '';
        implied.className = sanity && !sanity.ok ? 'derived derived-warn' : 'derived';
        implied.innerHTML = `<span class="derived-label">${t('Works out at')}</span>
            <span class="derived-value">${Math.round(yearly).toLocaleString()} ${t('SAR/year')}${lp100 ? ' &middot; ' + lp100.toFixed(1) + ' L/100km' : ''}</span>
            ${sanity && !sanity.ok ? `<span class="derived-note">${sanity.why}</span>` : (kmYear ? `<span class="derived-note">${t('based on {km} km a year', {km: Math.round(kmYear).toLocaleString()})}</span>` : '')}`;
    },

    // ── Climate Adjustment ──
    getClimateMultiplier() {
        const climate = localStorage.getItem('autocare_climate') || 'normal';
        return climate === 'severe' ? 0.8 : 1.0;
    },

    // ── Tire Tracking ──
    // The rotation pattern is stored as a key and shown on the car card
    TIRE_PATTERNS: { cross: 'Cross pattern', forward: 'Forward cross', rearward: 'Rearward cross', side: 'Side to side' },

    openTireModal(carId) {
        const car = Storage.getCars().find(c => c.id === carId);
        if (!car) return;
        const tires = car.tires || { brand: '', size: '', installedDate: '', installedMileage: '', pattern: 'cross' };
        const html = `
            <p style="font-size:12px;color:var(--text3);margin-bottom:14px">${t('Tire information for {car}', { car: `<strong>${car.make} ${car.model}</strong>` })}</p>
            <div class="form-row">
                <div class="form-group"><label>${t("Tire Brand")}</label><input type="text" id="f-tire-brand" placeholder="${t('e.g. Michelin')}" value="${esc(tires.brand)}"></div>
                <div class="form-group"><label>${t("Tire Size")}</label><input type="text" id="f-tire-size" placeholder="${t('e.g. 215/55R17')}" value="${esc(tires.size)}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>${t('Installed Date')}</label><input type="date" id="f-tire-date" value="${tires.installedDate}"></div>
                <div class="form-group"><label>${t('Installed at (km)')}</label><input type="number" id="f-tire-km" placeholder="45000" value="${tires.installedMileage}"></div>
            </div>
            <div class="form-group">
                <label>${t('Manufacture Date (DOT)')}</label>
                <input type="month" id="f-tire-made" value="${tires.manufactureDate || ''}">
                <small class="field-note">${t('From the 4-digit DOT code on the sidewall — e.g. 2419 means week 24 of 2019. Heat hardens rubber, so tyres are usually replaced by 6 years old whatever the tread looks like.')}</small>
            </div>
            <div class="form-group">
                <label>${t('Rotation Pattern')}</label>
                <select id="f-tire-pattern">
                    <option value="cross" ${tires.pattern === 'cross' ? 'selected' : ''}>${t('Cross pattern')} (FL&#8596;RR, FR&#8596;RL)</option>
                    <option value="forward" ${tires.pattern === 'forward' ? 'selected' : ''}>${t('Forward cross')} (${t('front to rear')})</option>
                    <option value="rearward" ${tires.pattern === 'rearward' ? 'selected' : ''}>${t('Rearward cross')} (${t('rear to front')})</option>
                    <option value="side" ${tires.pattern === 'side' ? 'selected' : ''}>${t('Side to side')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('Warranty (km)')}</label>
                <input type="number" id="f-tire-warranty" placeholder="${t('e.g. 80000')}" value="${tires.warrantyKm || ''}">
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
