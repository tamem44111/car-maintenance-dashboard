// ═══════════════════════════════════════════
// FORMS.JS — everything in the new design that changes a record.
//
// Each form is a sheet. What is typed lives in Next.form as it is typed, so a sheet
// can be redrawn (the next step, a warning) without losing a keystroke. Saving goes
// through the shared code in features.js and storage.js, the same code the classic
// screens save through.
// ═══════════════════════════════════════════

Object.assign(Next, {
    form: null,

    // ── Reading what was typed ──
    // An iPhone set to Arabic may type ٣٫٥ for 3.5
    latin(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/٫/g, '.').replace(/[٬,\s]/g, '');
    },
    whole(v) { const n = parseInt(this.latin(v), 10); return n > 0 ? String(n) : ''; },
    amount(v) { const n = parseFloat(this.latin(v)); return n > 0 ? String(Math.round(n * 100) / 100) : ''; },

    onInput(e) {
        const key = e.target.dataset.f;
        if (!key || !this.form) return;
        this.form[key] = e.target.value;
        if (key === 'km') this.form.kmGuess = false;
        if (key === 'date' && this.form.kind === 'log') this.dateMoved();
        this.live();
    },

    onChange(e) {
        const el = e.target;
        if (el.dataset.file !== undefined) return this.addPhotos(el);
        if (el.dataset.import !== undefined && el.files[0]) { Features.importData(el.files[0]); el.value = ''; }
    },

    // The small parts of a form that follow the typing, without redrawing the sheet
    live() {
        const f = this.form;
        const note = document.getElementById('km-note');
        if (note) note.textContent = this.kmNote();
        const total = document.getElementById('log-total');
        if (total) total.innerHTML = this.totalHTML();
    },

    // ── Building blocks ──
    field(key, label, o = {}) {
        const v = this.form[key] === undefined ? '' : this.form[key];
        const attrs = [`data-f="${esc(key)}"`, `type="${o.type || 'text'}"`, `value="${esc(v)}"`,
            o.inputmode ? `inputmode="${o.inputmode}"` : '', o.max ? `max="${o.max}"` : '',
            o.placeholder ? `placeholder="${esc(o.placeholder)}"` : '', o.autofocus ? 'autofocus' : '',
            o.type === 'date' ? '' : 'autocomplete="off"'].join(' ');
        return `<label class="field"><span>${label}</span><span class="in"><input ${attrs}>${o.unit ? `<small>${o.unit}</small>` : ''}</span></label>`;
    },

    toggle(key, label) {
        return `<button type="button" class="toggle" role="switch" aria-checked="${!!this.form[key]}" data-do="toggle" data-arg="${key}"><span>${label}</span><i></i></button>`;
    },

    seg(key, label, options) {
        return `<div class="field stack"><span>${label}</span><div class="seg" role="group" aria-label="${label}">${options.map(([v, text]) =>
            `<button type="button" data-do="set" data-arg="${key}=${v}" aria-pressed="${String(this.form[key]) === v}">${text}</button>`).join('')}</div></div>`;
    },

    warnHTML() { return this.form.warn ? `<p class="warn" role="alert">${esc(this.form.warn)}</p>` : ''; },

    // Redraws the open form. A warning is shown beside the button that raised it.
    repaint(toEnd) {
        const html = this[this.form.kind + 'HTML']();
        this.showSheet(html);
        if (toEnd) { const sh = document.querySelector('.sheet'); sh.scrollTop = sh.scrollHeight; }
    },
    formWarn(message) { this.form.warn = message; this.repaint(true); },

    done(message) {
        this.form = null;
        this.closeSheet();
        this.render();
        this.toast(message);
    },

    do_toggle(key) { this.form[key] = !this.form[key]; this.form.warn = ''; this.repaint(); },

    do_set(arg, el) {
        const at = arg.indexOf('=');
        const key = arg.slice(0, at), value = arg.slice(at + 1);
        this.form[key] = value;
        // what is asked next depends on the result of an inspection
        if (key === 'inspResult') return this.repaint();
        el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    },

    // A message from the shared code (a finished backup, a file that is not a backup)
    notice(message) {
        this.form = null;
        this.showSheet(this.sheetHead('AutoCare') + `<p class="say">${esc(message)}</p>
            <button type="button" class="primary" data-close="sheet">${t('OK')}</button>`);
    },

    // ── Odometer ──
    do_odo() {
        this.form = { kind: 'odo', km: '', date: Storage.today(), warn: '', sure: false };
        this.showSheet(this.odoHTML());
    },

    odoHTML() {
        const f = this.form, last = Storage.getLastReading(this.car());
        return this.sheetHead(t('Odometer'), last && last.date ? t('Last reading {km} km on {d}', { km: this.num(last.km), d: this.day(last.date) }) : '')
            + `<div class="card form">
                ${this.field('km', t('Reading now'), { inputmode: 'numeric', unit: t('km'), autofocus: true })}
                ${this.field('date', t('Date'), { type: 'date', max: Storage.today() })}
            </div>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveOdo">${f.sure ? t('Save anyway') : t('Save')}</button>`;
    },

    do_saveOdo() {
        const f = this.form, car = this.car();
        const km = this.whole(f.km);
        if (!km) return this.formWarn(t('Enter the number on your dashboard.'));
        if (!f.date || f.date > Storage.today()) return this.formWarn(t('A reading cannot be dated in the future.'));
        const last = Storage.getLastReading(car);
        if (last && parseInt(km, 10) < last.km && !f.sure) {
            f.sure = true;
            return this.formWarn(t('That is lower than your last reading ({km} km). If it is right, tap Save anyway.', { km: this.num(last.km) }));
        }
        Storage.logOdometer(car.id, km, f.date);
        this.done(t('Odometer updated'));
    },

    // ── Logging a visit, in three steps ──
    PAD_TYPES: ['Front Brake Pads', 'Rear Brake Pads', 'Brake Pads'],

    // `types` arrives as "Oil Change|Brake Inspection" from a row on Home
    do_log(types, el, at) {
        const car = this.car();
        if (!car) return;
        const proj = Storage.getProjectedMileage(car);
        const oil = String((Recommendations.getEffective(car, 'Oil Change') || {}).km || '');
        this.closeSheet();
        this.form = {
            kind: 'log', step: 1, types: types ? types.split('|').filter(Boolean) : [],
            date: Storage.today(), km: proj.km ? String(Math.round(proj.km)) : '', kmGuess: !!(proj.km && proj.estimated),
            checkOnly: false, accident: false, insured: false,
            shop: '', notes: '', photoIds: [],
            // the picker starts on the interval the car already runs
            oil: ['5000', '7000', '10000'].includes(oil) ? oil : '',
            inspResult: 'pass', inspExpiry: '', inspCentre: Features.INSPECTION_CENTRES[0],
            warn: '', sure: false
        };
        // adding to a visit that already happened: its day and its reading
        if (at) Object.assign(this.form, { date: at.date, km: at.km ? String(at.km) : '', kmGuess: false });
        this.showSheet(this.logHTML());
    },

    do_addTo(date) {
        const v = this.pastVisits(this.car()).find(x => x.date === date);
        this.do_log('', null, { date, km: v ? v.km : null });
    },

    logHTML() { return this['logStep' + this.form.step](); },

    logStep1() {
        const f = this.form, car = this.car();
        const due = this.jobs(car).filter(j => j.status !== 'ok').map(j => j.type);
        const rest = Recommendations.logTypes().filter(ty => !Recommendations.LEGACY_TYPES.includes(ty) && !due.includes(ty));
        const chip = ty => `<button type="button" class="chip pick" data-do="pick" data-arg="${esc(ty)}" aria-pressed="${f.types.includes(ty)}">${esc(this.name(ty))}</button>`;
        return this.sheetHead(t('What was done?'), t('Step {n} of 3', { n: 1 }))
            + (due.length ? `<h3 class="group">${t('Due now or soon')}</h3><div class="picks">${due.map(chip).join('')}</div>` : '')
            + `<h3 class="group">${due.length ? t('Everything else') : t('Jobs')}</h3><div class="picks">${rest.map(chip).join('')}</div>
            <button type="button" class="primary" data-do="logNext" ${f.types.length ? '' : 'disabled'}>${t('Continue')}</button>`;
    },

    do_pick(type, el) {
        const f = this.form, i = f.types.indexOf(type);
        if (i < 0) f.types.push(type); else f.types.splice(i, 1);
        el.setAttribute('aria-pressed', String(i < 0));
        document.querySelector('[data-do="logNext"]').disabled = !f.types.length;
    },

    // The reading offered is today's estimate. For another day it is not known.
    dateMoved() {
        const f = this.form;
        if (!f.kmGuess && f.km) return;
        const proj = Storage.getProjectedMileage(this.car());
        const today = f.date === Storage.today();
        f.km = today && proj.km ? String(Math.round(proj.km)) : '';
        f.kmGuess = !!(today && proj.km && proj.estimated);
        const input = document.querySelector('[data-f="km"]');
        if (input) input.value = f.km;
    },

    kmNote() {
        const f = this.form, last = Storage.getLastReading(this.car());
        const km = parseInt(this.whole(f.km), 10);
        if (f.kmGuess) return t('Estimated from your driving. Correct it if you read the odometer.');
        if (!km) return t('Leave it empty if you did not read the odometer.');
        if (last && last.date && f.date >= last.date && km < last.km) return t('Lower than your last reading ({km} km). Check the number.', { km: this.num(last.km) });
        return '';
    },

    logStep2() {
        const f = this.form;
        return this.sheetHead(t('When was it?'), t('Step {n} of 3', { n: 2 }))
            + `<div class="card form">
                ${this.field('date', t('Date'), { type: 'date', max: Storage.today() })}
                ${this.field('km', t('Odometer'), { inputmode: 'numeric', unit: t('km') })}
            </div>
            <p class="hint" id="km-note">${this.kmNote()}</p>
            <div class="card form">
                ${this.toggle('checkOnly', t('Only checked, nothing replaced'))}
                ${this.toggle('accident', t('Accident repair'))}
                ${f.accident ? this.toggle('insured', t('Insurance paid for it')) : ''}
            </div>
            ${this.warnHTML()}
            <div class="pair"><button type="button" class="secondary" data-do="logBack">${t('Back')}</button>
                <button type="button" class="primary" data-do="logNext">${t('Continue')}</button></div>`;
    },

    totalHTML() {
        const f = this.form;
        const sum = f.types.reduce((n, ty) => n + (parseFloat(this.amount(f['cost:' + ty])) || 0), 0);
        return sum > 0 ? `<span>${t('Total')}</span><strong>${this.money(sum, true)}</strong>` : '';
    },

    receiptsHTML() {
        const f = this.form;
        const thumbs = f.photoIds.map((id, i) => `<span class="thumb-wrap"><button type="button" class="thumb" data-photo="${i}" aria-label="${t('Receipt {n}', { n: i + 1 })}"><img alt="" data-thumb="${esc(id)}"></button>
            <button type="button" class="x" data-do="dropPhoto" data-arg="${i}" aria-label="${t('Remove receipt {n}', { n: i + 1 })}">${this.icon('close')}</button></span>`).join('');
        return `${thumbs}<label class="thumb add" aria-label="${t('Add a receipt photo')}">${this.icon('plus')}<input type="file" accept="image/*" multiple data-file hidden></label>`;
    },

    inspectionHTML() {
        const f = this.form;
        return this.seg('inspResult', t('Result'), [['pass', t('Passed')], ['fail', t('Failed')]])
            + (f.inspResult === 'pass' ? this.field('inspExpiry', t('Valid until'), { type: 'date' }) : '')
            + this.seg('inspCentre', t('Centre'), Features.INSPECTION_CENTRES.map(c => [c, t(c)]));
    },

    logStep3() {
        const f = this.form;
        if (f.types.includes('Periodic Inspection') && !f.inspExpiry) f.inspExpiry = Features.certificateExpiry(f.date);
        const costs = f.types.map(ty => this.field('cost:' + ty, esc(this.name(ty)), { inputmode: 'decimal', unit: t('SAR'), placeholder: '0' })).join('');
        const extras = [];
        if (f.types.includes('Oil Change') && !f.checkOnly) {
            extras.push(this.seg('oil', t('Next oil change in'), [['5000', '5,000'], ['7000', '7,000'], ['10000', '10,000']].map(([v, n]) => [v, t('{km} km', { km: n })])));
        }
        f.types.filter(ty => this.PAD_TYPES.includes(ty)).forEach(ty => {
            extras.push(this.field('pad:' + ty, t('{job}, thickness left', { job: esc(this.name(ty)) }), { inputmode: 'decimal', unit: t('mm') }));
        });
        if (f.types.includes('Periodic Inspection')) extras.push(this.inspectionHTML());
        this._photos = f.photoIds;
        return this.sheetHead(t('Cost and receipt'), t('Step {n} of 3', { n: 3 }))
            + `<div class="card form">${costs}<div class="sum" id="log-total">${this.totalHTML()}</div></div>
            ${extras.length ? `<div class="card form">${extras.join('')}</div>` : ''}
            <div class="card form">${this.field('shop', t('Shop'), { placeholder: t('Optional') })}</div>
            <div class="card"><h2>${t('Receipts')}</h2><div class="thumbs" id="receipts">${this.receiptsHTML()}</div></div>
            <div class="card form"><label class="field tall"><span>${t('Notes')}</span><textarea data-f="notes" rows="3" placeholder="${t('Optional')}">${esc(f.notes)}</textarea></label></div>
            ${this.warnHTML()}
            <div class="pair"><button type="button" class="secondary" data-do="logBack">${t('Back')}</button>
                <button type="button" class="primary" data-do="saveLog">${f.sure ? t('Save anyway') : t('Save')}</button></div>`;
    },

    do_logBack() { this.form.step -= 1; this.form.warn = ''; this.form.sure = false; this.repaint(); },

    do_logNext() {
        const f = this.form;
        if (f.step === 2) {
            if (!f.date) return this.formWarn(t('Please select a date.'));
            if (f.date > Storage.today()) return this.formWarn(t('The date cannot be in the future.'));
        }
        f.step += 1;
        f.warn = '';
        this.repaint();
    },

    addPhotos(input) {
        const f = this.form, files = [...input.files];
        if (!f || !files.length) return;
        Promise.all(files.map(file => Photos.save(file).catch(() => null))).then(ids => {
            if (this.form !== f) return;
            const good = ids.filter(Boolean);
            f.photoIds.push(...good);
            if (good.length < ids.length) this.toast(t('Could not add that photo.'));
            const box = document.getElementById('receipts');
            if (box) { box.innerHTML = this.receiptsHTML(); this.loadThumbs(box); }
        });
    },

    do_dropPhoto(i) {
        this.form.photoIds.splice(Number(i), 1);
        const box = document.getElementById('receipts');
        box.innerHTML = this.receiptsHTML();
        this.loadThumbs(box);
    },

    inspection(f) {
        return {
            inspectionResult: f.inspResult,
            // whatever the certificate says; a failure earns no certificate at all
            inspectionExpiry: f.inspResult === 'fail' ? '' : (f.inspExpiry || Features.certificateExpiry(f.date)),
            inspectionCenter: f.inspCentre
        };
    },

    do_saveLog() {
        const f = this.form, car = this.car();
        const mileage = this.whole(f.km);
        if (!f.sure) {
            // the same job logged twice by a second tap, or a second visit to the form
            const dupes = f.types.filter(type => Storage.findDuplicateService({ carId: car.id, type, date: f.date, mileage }));
            if (dupes.length) {
                f.sure = true;
                return this.formWarn(t('You already have a record for {list} on {d} at this mileage. To add it again, tap Save anyway.',
                    { list: dupes.map(ty => this.name(ty)).join(t(', ')), d: this.day(f.date) }));
            }
        }
        Features.logVisit({
            carId: car.id, date: f.date, mileage, notes: f.notes.trim(),
            accident: f.accident, insurancePaid: f.accident && f.insured,
            shop: f.shop.trim(), photoIds: f.photoIds,
            jobs: f.types.map(type => ({
                type, cost: this.amount(f['cost:' + type]), checkOnly: f.checkOnly,
                padThickness: this.latin(f['pad:' + type] || ''), oilInterval: f.oil,
                insp: type === 'Periodic Inspection' ? this.inspection(f) : null
            }))
        });
        this.done(t('Saved'));
    },

    // ── One record, edited ──
    do_edit(id) {
        const s = Storage.getServices().find(x => x.id === id);
        if (!s) return;
        const bills = (s.bills || []).map(b => ({ ...b }));
        this.form = {
            kind: 'edit', id, type: s.type, date: s.date, km: s.mileage || '', kmGuess: false,
            cost: bills.length ? '' : (s.cost || ''), bills,
            checkOnly: !!s.checkOnly, accident: !!s.accident, insured: !!s.insurancePaid,
            pad: s.padThickness || '', notes: s.notes || '',
            inspResult: s.inspectionResult || 'pass', inspExpiry: s.inspectionExpiry || '',
            inspCentre: s.inspectionCenter || Features.INSPECTION_CENTRES[0],
            photoIds: [...new Set(bills.flatMap(b => Photos.idsFor(b)))],
            warn: '', sure: false, armed: false
        };
        bills.forEach((b, i) => { this.form['bill:' + i] = b.amount || ''; });
        this.showSheet(this.editHTML());
    },

    editHTML() {
        const f = this.form;
        const money = { inputmode: 'decimal', unit: t('SAR'), placeholder: '0' };
        const costs = f.bills.length
            ? f.bills.map((b, i) => this.field('bill:' + i, `<span dir="auto">${esc(b.label || b.vendor || t(b.kind || 'Other'))}</span>`, money)).join('')
            : this.field('cost', t('Cost'), money);
        const extras = [];
        if (this.PAD_TYPES.includes(f.type)) extras.push(this.field('pad', t('Thickness left'), { inputmode: 'decimal', unit: t('mm') }));
        if (f.type === 'Periodic Inspection') extras.push(this.inspectionHTML());
        this._photos = f.photoIds;
        return this.sheetHead(esc(this.name(f.type)), t('Edit'))
            + `<div class="card form">
                ${this.field('date', t('Date'), { type: 'date', max: Storage.today() })}
                ${this.field('km', t('Odometer'), { inputmode: 'numeric', unit: t('km') })}
            </div>
            <div class="card form">${costs}${extras.join('')}</div>
            <div class="card form">
                ${this.toggle('checkOnly', t('Only checked, nothing replaced'))}
                ${this.toggle('accident', t('Accident repair'))}
                ${f.accident ? this.toggle('insured', t('Insurance paid for it')) : ''}
            </div>
            <div class="card"><h2>${t('Receipts')}</h2><div class="thumbs" id="receipts">${this.receiptsHTML()}</div></div>
            <div class="card form"><label class="field tall"><span>${t('Notes')}</span><textarea data-f="notes" rows="3" placeholder="${t('Optional')}">${esc(f.notes)}</textarea></label></div>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveEdit">${f.sure ? t('Save anyway') : t('Save')}</button>
            <button type="button" class="quiet danger" data-do="delete">${f.armed ? t('Tap again to delete') : t('Delete this record')}</button>`;
    },

    do_saveEdit() {
        const f = this.form;
        const s = Storage.getServices().find(x => x.id === f.id);
        if (!s) return this.done(t('Saved'));
        if (!f.date) return this.formWarn(t('Please select a date.'));
        if (f.date > Storage.today()) return this.formWarn(t('The date cannot be in the future.'));
        const mileage = this.whole(f.km);
        if (!f.sure && Storage.findDuplicateService({ carId: s.carId, type: s.type, date: f.date, mileage }, s.id)) {
            f.sure = true;
            return this.formWarn(t('Another {type} record already exists on {d} at the same mileage. To keep both, tap Save anyway.',
                { type: this.name(s.type), d: this.day(f.date) }));
        }
        // A photo taken off the form leaves every bill that carried it; a new one
        // joins the first bill, which is made if the record had none.
        const known = new Set(f.bills.flatMap(b => Photos.idsFor(b)));
        const bills = f.bills.map((b, i) => {
            const bill = { ...b, amount: this.amount(f['bill:' + i]), photoIds: Photos.idsFor(b).filter(id => f.photoIds.includes(id)) };
            delete bill.photoId;
            return bill;
        });
        const added = f.photoIds.filter(id => !known.has(id));
        let cost = this.amount(f.cost);
        if (added.length) {
            if (!bills.length) bills.push({
                id: 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                kind: 'Other', label: '', vendor: '', photoIds: [], amount: cost,
                warrantyMonths: '', warrantyKm: '', startKm: mileage, date: f.date
            });
            bills[0].photoIds.push(...added);
        }
        // with bills, the bills are the cost
        if (bills.length) cost = String(Math.round(bills.reduce((n, b) => n + (parseFloat(b.amount) || 0), 0) * 100) / 100 || '');
        const data = {
            ...s, date: f.date, mileage, cost, bills, notes: f.notes.trim(),
            padThickness: this.latin(f.pad), checkOnly: f.checkOnly,
            accident: f.accident, insurancePaid: f.accident && f.insured,
            ...(s.type === 'Periodic Inspection' ? this.inspection(f) : {})
        };
        Features.updateJob(s.id, data, null);
        this.form = null;
        this.render();
        this.openVisit(data.date);
        this.toast(t('Saved'));
    },

    do_delete() {
        const f = this.form;
        if (!f.armed) { f.armed = true; return this.repaint(true); }
        const before = new Set(Storage.getTrash().map(x => x.id));
        Storage.deleteService(f.id);
        const entry = Storage.getTrash().find(x => !before.has(x.id));
        Features.cleanupPhotos();
        this.form = null;
        this.closeSheet();
        this.render();
        this.toast(t('Record deleted'), entry ? { label: t('Undo'), run: () => { Storage.restoreFromTrash(entry.id); this.render(); } } : null);
    },

    // ── A job on the schedule ──
    do_job(type) {
        this.form = { kind: 'sched', type, editing: false, ikm: '', imonths: '', warn: '' };
        this.showSheet(this.schedHTML());
    },
    schedHTML() {
        const f = this.form, car = this.car();
        const st = Recommendations.getMaintenanceStatus(car, f.type);
        const own = (Recommendations.getCustom()[car.id] || {})[f.type];
        const fact = (label, value) => `<div class="fact"><span>${label}</span><strong>${value}</strong></div>`;
        const long = iso => this.date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
        const last = Storage.getServices(car.id).filter(s => s.type === f.type && !s.checkOnly && s.date).sort((a, b) => b.date.localeCompare(a.date))[0];
        const next = [];
        if (st.hasKm && st.nextKm) next.push(t('{km} km', { km: this.num(st.nextKm) }));
        if (st.nextDate && st.status !== 'unknown') next.push(long(st.nextDate));
        const facts = [
            fact(t('Last done'), last ? long(last.date) + (parseInt(last.mileage, 10) > 0 ? t(', ') + t('{km} km', { km: this.num(parseInt(last.mileage, 10)) }) : '') : t('No record yet')),
            next.length ? fact(t('Next due'), next.join(' ' + t('or') + ' ')) : '',
            fact(t('How often'), this.every(st.rec) + `<small>${own ? t('Your setting') : t('From the maker\'s schedule')}</small>`)
        ].join('');
        const edit = f.editing ? `<div class="card form">
                ${this.field('ikm', t('Every'), { inputmode: 'numeric', unit: t('km'), autofocus: true })}
                ${this.field('imonths', t('Or every'), { inputmode: 'numeric', unit: t('months') })}
            </div>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveEvery">${t('Save')}</button>
            ${own ? `<button type="button" class="quiet" data-do="resetEvery">${t('Go back to the maker\'s schedule')}</button>` : ''}`
            : `<button type="button" class="primary" data-do="log" data-arg="${esc(f.type)}">${t('Log it')}</button>
            <button type="button" class="quiet" data-do="every">${t('Change how often')}</button>
            ${last ? `<button type="button" class="quiet" data-go="history" data-arg="${esc(f.type)}">${t('Past records')}</button>` : ''}`;
        const j = this.jobs(car).find(x => x.type === f.type);
        return this.sheetHead(esc(this.name(f.type)), j ? this.when({ jobs: [j] }) : t('No record yet')) + `<div class="card">${facts}</div>${edit}`;
    },

    do_every() {
        const f = this.form, rec = Recommendations.getEffective(this.car(), f.type) || {};
        Object.assign(f, { editing: true, ikm: rec.km ? String(rec.km) : '', imonths: rec.months ? String(rec.months) : '' });
        this.showSheet(this.schedHTML());
    },

    do_saveEvery() {
        const f = this.form, km = parseInt(this.whole(f.ikm), 10), months = parseInt(this.whole(f.imonths), 10);
        if (!km || !months) { f.warn = t('Enter both: a distance and a number of months.'); return this.showSheet(this.schedHTML()); }
        Recommendations.saveCustom(this.car().id, f.type, km, months);
        this.done(t('Saved'));
    },

    do_resetEvery() {
        Recommendations.deleteCustom(this.car().id, this.form.type);
        this.done(t('Saved'));
    },

    // ── Documents ──
    do_doc(key) {
        this.form = { kind: 'doc', key, date: this.car()[key] || '', warn: '' };
        this.showSheet(this.docHTML());
    },

    docHTML() {
        const f = this.form, d = Features.DOCS.find(x => x.key === f.key);
        return this.sheetHead(esc(this.name(d.label)), t('Expiry date'))
            + `<div class="card form">${this.field('date', t('Valid until'), { type: 'date' })}</div>
            ${f.key === 'fahesExpiry' ? `<p class="hint">${t('Logging a periodic inspection sets this date by itself.')}</p>` : ''}
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveDoc">${t('Save')}</button>`;
    },

    do_saveDoc() {
        const f = this.form, car = this.car();
        Storage.updateCar(car.id, { [f.key]: f.date });
        Storage.syncDocumentReminders(car.id);
        this.done(t('Saved'));
    },

    // ── Settings ──
    do_lang(lang) { I18N.set(lang); this.render(); },

    do_climate(value) { localStorage.setItem('autocare_climate', value); this.render(); },

    do_backup() { Features.exportData(); },

    do_notify() {
        Notification.requestPermission().then(() => { Features.scheduleNotifications(); this.render(); });
    }
});
