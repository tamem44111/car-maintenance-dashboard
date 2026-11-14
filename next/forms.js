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
        if (e.target.dataset.q !== undefined) return this.setQuery(e.target.value);
        const key = e.target.dataset.f;
        if (!key || !this.form) return;
        this.form[key] = e.target.value;
        this.live();
    },

    onChange(e) {
        const el = e.target;
        if (el.dataset.file !== undefined) return this.addPhotos(el);
        if (el.dataset.import !== undefined && el.files[0]) { Features.importData(el.files[0]); el.value = ''; }
    },

    // The small parts of a form that follow the typing, without redrawing the sheet
    live() {
        const note = document.getElementById('km-note');
        if (note) note.textContent = this.kmNote();
        const total = document.getElementById('log-total');
        if (total) total.innerHTML = this.totalHTML();
        const fuel = document.getElementById('fuel-says');
        if (fuel) fuel.textContent = this.fuelSays();
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
        const html = this[this.form.kind === 'car' ? 'carFormHTML' : this.form.kind + 'HTML']();
        this.showSheet(html);
        if (toEnd) { const sh = document.querySelector('.sheet'); sh.scrollTop = sh.scrollHeight; }
    },
    formWarn(message) { this.form.warn = message; this.repaint(true); },

    done(message, action) {
        this.form = null;
        this.closeSheet();
        this.render();
        this.toast(message, action);
    },

    // A receipt photo is on this phone and nowhere else until it is backed up
    backupOffer() { return { label: t('Back up'), run: () => this.do_backup() }; },

    do_toggle(key) { this.form[key] = !this.form[key]; this.form.warn = ''; this.repaint(); },

    do_set(arg, el) {
        const at = arg.indexOf('=');
        const key = arg.slice(0, at), value = arg.slice(at + 1);
        this.form[key] = value;
        // what is asked next depends on the answer
        if (key === 'inspResult' || key === 'mode') return this.repaint();
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
        this.form = { kind: 'odo', km: '', date: Storage.today(), warn: '', sure: false, armed: '' };
        this.showSheet(this.odoHTML());
    },

    // The newest readings typed here, and any older one that contradicts another,
    // so a mistyped number can be found and taken out
    odoList() {
        const car = this.car();
        const doubted = new Set(Storage.getReadingConflicts(car.id).flatMap(c => [c.high, ...c.lower]).map(r => r.id));
        const logs = Storage.getOdometerLogs(car.id).sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km);
        return logs.filter((o, i) => i < 5 || doubted.has(o.id)).map(o => ({ ...o, doubted: doubted.has(o.id) }));
    },

    odoHTML() {
        const f = this.form, last = Storage.getLastReading(this.car());
        const long = iso => this.date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
        const rows = this.odoList().map(o => `<div class="fact"><span>${this.num(o.km)} ${t('km')}<small class="${o.doubted ? 'doubt' : ''}">${long(o.date)}${o.doubted ? t(', ') + t('disagrees with another reading') : ''}</small></span>
            <button type="button" class="link ${f.armed === o.id ? 'danger' : ''}" data-do="dropOdo" data-arg="${esc(o.id)}">${f.armed === o.id ? t('Tap again to delete') : t('Delete')}</button></div>`).join('');
        return this.sheetHead(t('Odometer'), last && last.date ? t('Last reading {km} km on {d}', { km: this.num(last.km), d: this.day(last.date) }) : '')
            + `<div class="card form">
                ${this.field('km', t('Reading now'), { inputmode: 'numeric', unit: t('km'), autofocus: true })}
                ${this.field('date', t('Date'), { type: 'date', max: Storage.today() })}
            </div>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveOdo">${f.sure ? t('Save anyway') : t('Save')}</button>
            ${rows ? `<div class="card readings"><h2>${t('Readings you typed')}</h2>${rows}</div>` : ''}`;
    },

    // A wrong reading is deleted in two taps, and can be put back from the toast
    do_dropOdo(id) {
        const f = this.form;
        if (f.armed !== id) { f.armed = id; return this.repaint(); }
        const gone = Storage.deleteOdometerLog(id);
        f.armed = '';
        this.render();
        this.repaint();
        if (gone) this.toast(t('Reading deleted'), { label: t('Undo'), run: () => {
            Storage.logOdometer(gone.carId, gone.km, gone.date);
            this.render();
            if (this.form && this.form.kind === 'odo') this.repaint();
        } });
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
        const oil = String((Recommendations.getEffective(car, 'Oil Change') || {}).km || '');
        this.closeSheet();
        this.form = {
            // The reading starts empty. It used to start on today's estimate, which was
            // then saved as if it had been read off the dashboard.
            kind: 'log', step: 1, types: types ? types.split('|').filter(Boolean) : [],
            date: Storage.today(), km: '',
            checkOnly: false, accident: false, insured: false,
            shop: '', notes: '', photoIds: [],
            war: false, warJob: '', warMonths: '', warKm: '',
            // the picker starts on the interval the car already runs
            oil: ['5000', '7000', '10000'].includes(oil) ? oil : '',
            inspResult: 'pass', inspExpiry: '', inspCentre: Features.INSPECTION_CENTRES[0],
            warn: '', sure: false
        };
        // adding to a visit that already happened: its day and its reading
        if (at) Object.assign(this.form, { date: at.date, km: at.km ? String(at.km) : '' });
        this.showSheet(this.logHTML());
    },

    // A measurement of the pads on the car: the same form, with "only checked" on
    do_measure(type) {
        this.do_log(type);
        Object.assign(this.form, { checkOnly: true, step: 2 });
        this.repaint();
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

    // Under the odometer field: what an empty one will be counted as, or what looks
    // wrong with the number typed. An empty reading is never filled in with a guess;
    // the schedule works the day's odometer out from the readings around it.
    kmNote() {
        const f = this.form, car = this.car(), last = Storage.getLastReading(car);
        const km = parseInt(this.whole(f.km), 10);
        const at = f.date ? Storage.kmOn(car.id, f.date, f.id) : null;
        if (f.doubted) return at ? t('If your other readings are right, this day was about {km} km.', { km: this.num(Math.round(at.km / 100) * 100) })
            : t('This reading disagrees with another one.');
        if (!km) return !at ? t('Leave it empty if you did not read the odometer.')
            : at.estimated ? t('Leave it empty if you did not read the odometer. The app will count from about {km} km.', { km: this.num(Math.round(at.km / 100) * 100) })
            : t('Leave it empty to use your reading from that day, {km} km.', { km: this.num(at.km) });
        if (f.kind === 'log' && last && last.date && f.date >= last.date && km < last.km) return t('Lower than your last reading ({km} km). Check the number.', { km: this.num(last.km) });
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

    // Pads the form asks a thickness for: the ones being logged, and both axles
    // when the brakes were checked, since that is when a shop measures them
    padAsks() {
        const f = this.form;
        const asks = f.types.filter(ty => this.PAD_TYPES.includes(ty));
        if (f.types.includes('Brake Inspection')) Recommendations.PAD_TYPES.forEach(ty => { if (!asks.includes(ty)) asks.push(ty); });
        return asks;
    },

    warrantyHTML() {
        const f = this.form;
        if (!f.war) return `<button type="button" class="quiet" data-do="war">${t('Add a warranty')}</button>`;
        if (!f.types.includes(f.warJob)) f.warJob = f.types[0];
        const which = f.types.length > 1 ? `<div class="field stack"><span>${t('Warranty on')}</span><div class="picks">${f.types.map(ty =>
            `<button type="button" class="chip pick" data-do="set" data-arg="warJob=${esc(ty)}" aria-pressed="${f.warJob === ty}">${esc(this.name(ty))}</button>`).join('')}</div></div>` : '';
        return `<div class="card form">${which}
            ${this.field('warMonths', t('Warranty'), { inputmode: 'numeric', unit: t('months') })}
            ${this.field('warKm', t('Or up to'), { inputmode: 'numeric', unit: t('km') })}</div>`;
    },

    do_war() { this.form.war = true; this.repaint(); },

    logStep3() {
        const f = this.form;
        if (f.types.includes('Periodic Inspection') && !f.inspExpiry) f.inspExpiry = Features.certificateExpiry(f.date);
        const costs = f.types.map(ty => this.field('cost:' + ty, esc(this.name(ty)), { inputmode: 'decimal', unit: t('SAR'), placeholder: '0' })).join('');
        const extras = [];
        if (f.types.includes('Oil Change') && !f.checkOnly) {
            extras.push(this.seg('oil', t('Next oil change in'), [['5000', '5,000'], ['7000', '7,000'], ['10000', '10,000']].map(([v, n]) => [v, t('{km} km', { km: n })])));
        }
        this.padAsks().forEach(ty => {
            extras.push(this.field('pad:' + ty, t('{job}, thickness left', { job: esc(this.name(ty)) }), { inputmode: 'decimal', unit: t('mm'),
                placeholder: f.types.includes(ty) ? '' : t('If measured') }));
        });
        if (f.types.includes('Periodic Inspection')) extras.push(this.inspectionHTML());
        this._photos = f.photoIds;
        return this.sheetHead(t('Cost and receipt'), t('Step {n} of 3', { n: 3 }))
            + `<div class="card form">${costs}<div class="sum" id="log-total">${this.totalHTML()}</div></div>
            ${extras.length ? `<div class="card form">${extras.join('')}</div>` : ''}
            <div class="card form">${this.field('shop', t('Shop'), { placeholder: t('Optional') })}</div>
            ${this.warrantyHTML()}
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
        const covered = type => f.war && type === f.warJob;
        const jobs = f.types.map(type => ({
            type, cost: this.amount(f['cost:' + type]), checkOnly: f.checkOnly,
            padThickness: this.latin(f['pad:' + type] || ''), oilInterval: f.oil,
            insp: type === 'Periodic Inspection' ? this.inspection(f) : null,
            warrantyMonths: covered(type) ? this.whole(f.warMonths) : '', warrantyKm: covered(type) ? this.whole(f.warKm) : ''
        }));
        // Pads measured during a brake check are a record of their own, marked as
        // looked at and not replaced, which is what the schedule reads wear from
        this.padAsks().filter(ty => !f.types.includes(ty) && parseFloat(this.latin(f['pad:' + ty])) > 0).forEach(ty => {
            jobs.push({ type: ty, cost: '', checkOnly: true, padThickness: this.latin(f['pad:' + ty]), insp: null });
        });
        const receipts = f.photoIds.length > 0;
        Features.logVisit({
            carId: car.id, date: f.date, mileage, notes: f.notes.trim(),
            accident: f.accident, insurancePaid: f.accident && f.insured,
            shop: f.shop.trim(), photoIds: f.photoIds, jobs
        });
        this.done(t('Saved'), receipts ? this.backupOffer() : null);
    },

    // ── One record, edited ──
    do_edit(id) {
        const s = Storage.getServices().find(x => x.id === id);
        if (!s) return;
        const bills = (s.bills || []).map(b => ({ ...b }));
        const covered = bills.find(b => b.warrantyMonths || b.warrantyKm) || {};
        const doubted = Storage.getReadingConflicts(s.carId).some(c => [c.high, ...c.lower].some(r => r.id === id));
        this.form = {
            kind: 'edit', id, type: s.type, date: s.date, km: s.mileage || '', doubted,
            warMonths: covered.warrantyMonths || '', warKm: covered.warrantyKm || '',
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
            <p class="hint ${f.doubted ? 'doubt' : ''}" id="km-note">${this.kmNote()}</p>
            <div class="card form">${costs}${extras.join('')}</div>
            <div class="card form">
                ${this.field('warMonths', t('Warranty'), { inputmode: 'numeric', unit: t('months'), placeholder: t('None') })}
                ${this.field('warKm', t('Or up to'), { inputmode: 'numeric', unit: t('km'), placeholder: t('None') })}
            </div>
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
        // A warranty is kept on a bill, like a receipt; either one makes the first
        const war = { warrantyMonths: this.whole(f.warMonths), warrantyKm: this.whole(f.warKm) };
        const hadWar = bills.findIndex(b => b.warrantyMonths || b.warrantyKm);
        if ((added.length || war.warrantyMonths || war.warrantyKm) && !bills.length) bills.push({
            id: 'bl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            kind: 'Other', label: '', vendor: '', photoIds: [], amount: cost,
            warrantyMonths: '', warrantyKm: '', startKm: mileage, date: f.date
        });
        if (added.length) bills[0].photoIds.push(...added);
        if (bills.length) {
            const holder = bills[hadWar < 0 ? 0 : hadWar];
            Object.assign(holder, war);
            // a distance warranty counts from the reading on the day of the job
            if (war.warrantyKm && !parseInt(holder.startKm, 10)) holder.startKm = mileage;
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
        if (added.length) Storage.markReceiptAdded();
        this.form = null;
        this.render();
        this.openVisit(data.date);
        this.toast(t('Saved'), added.length ? this.backupOffer() : null);
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
        const pad = st.measured, worn = pad && pad.basis;
        const month = iso => this.date(iso, { month: 'short', year: 'numeric' });
        const next = [];
        if (worn) {
            // worked out from wear, so it is said as an estimate and says what it rests on
            if (worn === 'km') next.push(t('about {km} km', { km: this.about(st.nextKm) }));
            next.push(t('around {d}', { d: month(st.nextDate) }));
        } else {
            if (st.hasKm && st.nextKm) next.push(st.kmEstimated ? t('about {km} km', { km: this.about(st.nextKm) }) : t('{km} km', { km: this.num(st.nextKm) }));
            if (st.nextDate && st.status !== 'unknown') next.push(long(st.nextDate));
        }
        const paidFor = Storage.getServices(car.id).filter(s => s.type === f.type && Storage.getRunningCost(s) > 0).length;
        const usual = Storage.getAverageServiceCost(f.type, car.id);
        const facts = [
            fact(t('Last done'), last ? long(last.date) + (parseInt(last.mileage, 10) > 0 ? t(', ') + t('{km} km', { km: this.num(parseInt(last.mileage, 10)) }) : '') : t('No record yet')),
            pad ? fact(t('Measured'), t('{mm} mm on {d}', { mm: pad.mm, d: long(pad.date) }) + `<small>${t('Replace at {mm} mm', { mm: pad.minMm })}</small>`) : '',
            next.length ? fact(t('Next due'), next.join(worn ? t(', ') : ' ' + t('or') + ' ')
                + (worn ? `<small>${t(pad.assumedNew ? 'From how this set has worn, taking a new set as {mm} mm' : 'From how this set has worn between measurements', { mm: Recommendations.PAD_NEW_MM })}</small>` : '')) : '',
            fact(t('How often'), this.every(st.rec) + `<small>${worn ? t('Not used while a measurement says more') : own ? t('Your setting') : t('From the maker\'s schedule')}</small>`),
            usual ? fact(t('Usual cost'), t('about {v}', { v: this.money(usual) }) + `<small>${this.count(paidFor, 'from {n} bill of yours', 'the average of your {n} bills')}</small>`) : ''
        ].join('');
        const edit = f.editing ? `<div class="card form">
                ${this.field('ikm', t('Every'), { inputmode: 'numeric', unit: t('km'), autofocus: true })}
                ${this.field('imonths', t('Or every'), { inputmode: 'numeric', unit: t('months') })}
            </div>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveEvery">${t('Save')}</button>
            ${own ? `<button type="button" class="quiet" data-do="resetEvery">${t('Go back to the maker\'s schedule')}</button>` : ''}`
            : `<button type="button" class="primary" data-do="log" data-arg="${esc(f.type)}">${t('Log it')}</button>
            ${Recommendations.PAD_TYPES.includes(f.type) ? `<button type="button" class="quiet" data-do="measure" data-arg="${esc(f.type)}">${t('Add a measurement')}</button>` : ''}
            <button type="button" class="quiet" data-do="every">${t('Change how often')}</button>
            ${last ? `<button type="button" class="quiet" data-go="history" data-arg="${esc(f.type)}">${t('Past records')}</button>` : ''}`;
        const j = this.jobs(car).find(x => x.type === f.type);
        return this.sheetHead(esc(this.name(f.type)), j ? this.when({ jobs: [j] }) : this.unknownLine(st)) + `<div class="card">${facts}</div>${edit}`;
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

    // ── Readings that cannot all be true ──
    do_checks() {
        const car = this.car();
        const long = iso => this.date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
        const row = r => `<button type="button" class="row" data-do="${r.source === 'service' ? 'edit' : 'odo'}" data-arg="${esc(r.id)}">
            <span class="row-main"><strong>${t('{km} km', { km: this.num(r.km) })}</strong><span>${long(r.date)}${t(', ')}${esc(r.source === 'service' ? this.lower(this.name(r.type)) : t('odometer reading'))}</span></span>
            <span class="chev">${this.icon('chev', 'flip')}</span></button>`;
        const cards = Storage.getReadingConflicts(car.id).map(c => {
            const pair = c.lower.length === 1;
            return `<div class="card"><p class="lead">${pair ? t('One of these two is wrong: the later reading is the lower one. Open the wrong one and correct it.')
                : t('This reading is higher than {n} later ones, so it is probably the wrong one.', { n: c.lower.length })}</p>${row(c.high)}${pair ? row(c.lower[0]) : ''}</div>`;
        }).join('');
        this.form = null;
        this.showSheet(this.sheetHead(t('Readings to check')) + (cards || `<p class="say">${t('Your readings agree with each other.')}</p>`));
    },

    // ── Fuel, as one setting ──
    do_fuel() {
        const s = Features.getFuelSettings();
        this.form = { kind: 'fuel', mode: s.mode, lp100: s.lp100, price: s.price, monthly: s.monthly, warn: '' };
        this.showSheet(this.fuelHTML());
    },

    fuelHTML() {
        const f = this.form;
        const price = this.field('price', t('Price of a litre'), { inputmode: 'decimal', unit: t('SAR') });
        const fields = f.mode === 'consumption' ? this.field('lp100', t('Consumption'), { inputmode: 'decimal', unit: t('L/100 km'), placeholder: '11' }) + price
            : f.mode === 'monthly' ? this.field('monthly', t('Fuel in a month'), { inputmode: 'decimal', unit: t('SAR'), placeholder: '900' }) + price : '';
        return this.sheetHead(t('Fuel estimate'), t('Fuel is most of what a car costs to run'))
            + `<div class="card form">${this.seg('mode', t('Work it out from'), [['off', t('Off')], ['consumption', t('Consumption')], ['monthly', t('Monthly spend')]])}${fields}</div>
            <p class="hint" id="fuel-says">${this.fuelSays()}</p>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveFuel">${t('Save')}</button>`;
    },

    // What the figures typed come to over a year of this car's driving. A mistyped
    // number is obvious here and nowhere else.
    fuelSays() {
        const f = this.form, car = this.car();
        const rate = Storage.getDailyKmRate(car.id);
        const kmYear = rate ? rate * 365 : null;
        const price = parseFloat(this.latin(f.price)) || 0;
        if (f.mode === 'off') return t('Running cost will count maintenance only.');
        let lp100 = null, yearly = null;
        if (f.mode === 'consumption') {
            lp100 = parseFloat(this.latin(f.lp100)) || 0;
            if (lp100 > 0 && price > 0 && kmYear) yearly = kmYear * lp100 / 100 * price;
        } else {
            const m = parseFloat(this.latin(f.monthly)) || 0;
            if (m > 0) { yearly = m * 12; if (price > 0 && kmYear) lp100 = (yearly / price) / kmYear * 100; }
        }
        if (!yearly) return '';
        const odd = lp100 ? Features.fuelSanity(lp100) : null;
        const says = t('That is about {v} SAR a year', { v: this.num(yearly) }) + (lp100 ? t(', ') + t('{l} L/100 km', { l: lp100.toFixed(1) }) : '') + '.';
        return odd && !odd.ok ? says + ' ' + odd.why : says;
    },

    do_saveFuel() {
        const f = this.form;
        const lp100 = this.amount(f.lp100), price = this.amount(f.price), monthly = this.amount(f.monthly);
        if (f.mode === 'consumption' && !(lp100 && price)) return this.formWarn(t('Enter the consumption and the price of a litre.'));
        if (f.mode === 'monthly' && !monthly) return this.formWarn(t('Enter what you spend on fuel in a month.'));
        Features.saveFuelSettings({ mode: f.mode, lp100, price: price || Features.FUEL_DEFAULTS.price, monthly });
        this.done(t('Saved'));
    },

    // ── Tyres on the car ──
    do_tyre() {
        const set = this.car().tires || {};
        this.form = { kind: 'tyre', brand: set.brand || '', size: set.size || '', dot: '', warn: '' };
        this.showSheet(this.tyreHTML());
    },

    tyreHTML() {
        const made = Storage.getTyreAge(this.car());
        const when = made ? this.date(made.madeOn + (made.madeOn.length === 7 ? '-01' : ''), { month: 'long', year: 'numeric' }) : '';
        return this.sheetHead(t('Tyre details'), made ? t('Made in {d}', { d: when }) : t('Rubber ages in heat, whatever the tread looks like'))
            + `<div class="card form">
                ${this.field('brand', t('Brand'), { placeholder: t('Optional') })}
                ${this.field('size', t('Size'), { placeholder: '235/55R18' })}
                ${this.field('dot', t('Made, from the DOT code'), { inputmode: 'numeric', placeholder: made ? t('Change') : '2325' })}
            </div>
            <p class="hint">${t('On the side of the tyre, after the letters DOT, the last four digits are the week and the year it was made: 2325 is week 23 of 2025.')}</p>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveTyre">${t('Save')}</button>`;
    },

    // "2325" is week 23 of 2025. Kept as a month, which is as fine as tyre age needs.
    dotMonth(text) {
        const d = this.latin(text);
        if (!/^\d{4}$/.test(d)) return null;
        const week = parseInt(d.slice(0, 2), 10), year = 2000 + parseInt(d.slice(2), 10);
        if (week < 1 || week > 53) return null;
        const day = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
        const month = day.toISOString().slice(0, 7);
        return month > Storage.today().slice(0, 7) ? null : month;
    },

    do_saveTyre() {
        const f = this.form, car = this.car();
        const set = { ...(car.tires || {}), brand: f.brand.trim(), size: f.size.trim() };
        if (this.latin(f.dot)) {
            const month = this.dotMonth(f.dot);
            if (!month) return this.formWarn(t('That is not a date code. It is four digits, week then year, and cannot be in the future.'));
            set.manufactureDate = month;
        }
        Storage.updateCar(car.id, { tires: set });
        this.done(t('Saved'));
    },

    // ── The car itself ──
    do_carEdit() {
        const car = this.car() || {};
        this.form = { kind: 'car', fresh: !car.id, make: car.make || '', model: car.model || '', year: car.year || '',
            plate: car.plate || '', color: car.color || '', km: '', warn: '' };
        this.showSheet(this.carFormHTML());
    },

    carFormHTML() {
        const f = this.form;
        return this.sheetHead(f.fresh ? t('Your car') : t('Car details'))
            + `<div class="card form">
                ${this.field('make', t('Make'), { placeholder: 'Ford', autofocus: f.fresh })}
                ${this.field('model', t('Model'), { placeholder: 'Taurus' })}
                ${this.field('year', t('Year'), { inputmode: 'numeric', placeholder: '2013' })}
                ${this.field('plate', t('Plate'), { placeholder: t('Optional') })}
                ${this.field('color', t('Colour'), { placeholder: t('Optional') })}
                ${f.fresh ? this.field('km', t('Odometer now'), { inputmode: 'numeric', unit: t('km') }) : ''}
            </div>
            <p class="hint">${t('The make and model choose the maker\'s service schedule.')}</p>
            ${this.warnHTML()}
            <button type="button" class="primary" data-do="saveCar">${t('Save')}</button>`;
    },

    do_saveCar() {
        const f = this.form;
        const details = { make: f.make.trim(), model: f.model.trim(), year: this.whole(f.year), plate: f.plate.trim(), color: f.color.trim() };
        if (!details.make || !details.model) return this.formWarn(t('Enter the make and the model.'));
        if (f.fresh) {
            const car = Storage.addCar({ ...details, mileage: '', insuranceExpiry: '', registrationExpiry: '' });
            if (this.whole(f.km)) Storage.logOdometer(car.id, this.whole(f.km), Storage.today());
        } else Storage.updateCar(this.car().id, details);
        this.done(t('Saved'));
    },

    // ── The phone's own calendar ──
    do_calendar() {
        const events = Features.calendarEvents(this.car());
        const docs = events.filter(e => e.alarms.length === 3).length;
        this.form = null;
        this.showSheet(this.sheetHead(t('Add to Calendar'), t('So the phone reminds you with the app closed'))
            + `<p class="say">${t('This makes a calendar file with {d} document dates and {j} due dates, each with an alert a week before and on the day. Documents also alert a month before.', { d: docs, j: events.length - docs })}

${t('In the share sheet choose Calendar if it is offered. If it is not, choose Save to Files, open the file there, and tap Add All.')}

${t('A due date is today\'s estimate. Add the file again after a service and the entries move to the new dates.')}</p>
            <button type="button" class="primary" data-do="addCalendar" ${events.length ? '' : 'disabled'}>${t('Make the calendar file')}</button>`);
    },

    do_addCalendar() {
        Features.shareCalendar(this.car(), type => this.name(type))
            .then(how => { if (how) { this.closeSheet(); this.toast(t(how === 'share' ? 'Calendar file shared' : 'Calendar file saved')); } })
            .catch(() => this.notice(t('Could not make the calendar file.')));
    },

    // ── Deleted records ──
    do_trash() {
        const long = iso => this.date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
        const rows = Storage.getDeletedServices(this.car().id).map(x => `<div class="fact"><span>${esc(this.name(x.record.type))}<small>${long(x.record.date)}</small></span>
            <button type="button" class="link" data-do="restore" data-arg="${esc(x.id)}">${t('Restore')}</button></div>`).join('');
        this.form = null;
        this.showSheet(this.sheetHead(t('Deleted records'), t('Kept for 30 days, then removed for good'))
            + (rows ? `<div class="card readings">${rows}</div>` : `<p class="say">${t('Nothing deleted.')}</p>`));
    },

    do_restore(id) {
        Storage.restoreFromTrash(id);
        this.render();
        this.do_trash();
        this.toast(t('Record restored'));
    },

    // ── Settings ──
    do_lang(lang) { I18N.set(lang); this.render(); },

    do_climate(value) { localStorage.setItem('autocare_climate', value); this.render(); },

    do_backup() { Features.exportData(); },

    do_notify() {
        Notification.requestPermission().then(() => { Features.scheduleNotifications(); this.render(); });
    }
});
