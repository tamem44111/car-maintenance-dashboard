// ═══════════════════════════════════════════════════════════════════
// CHECKS.JS — the verification procedure from CLAUDE.md, automated.
//
// Open checks.html and press Run. Everything runs against the real app
// inside a 402px iframe, so the render and overflow checks see exactly
// what an iPhone sees.
//
// SAFETY: this file is served from the same origin as the live app, so a
// test run would otherwise overwrite the owner's real records. Every run
// snapshots the whole of localStorage and restores it in a finally block,
// including when a check throws. IndexedDB (receipt photos) is never touched.
//
// Failures are things that are broken. Warnings are known gaps tracked in
// README's open items — they are surfaced on every run but do not fail it.
// ═══════════════════════════════════════════════════════════════════

const Checks = {
    failures: [], warnings: [], passes: [], _log: null,

    // ── tiny assertion helpers ──
    ok(name, cond, detail) {
        if (cond) this.passes.push(name);
        else this.failures.push({ name, detail: detail || 'expected true' });
        this._paint();
    },
    eq(name, actual, expected, detail) {
        const same = JSON.stringify(actual) === JSON.stringify(expected);
        this.ok(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${detail ? ' — ' + detail : ''}`);
    },
    near(name, actual, expected, tolerance, detail) {
        const same = Math.abs(actual - expected) <= tolerance;
        this.ok(name, same, same ? '' : `expected ~${expected} (±${tolerance}), got ${actual}${detail ? ' — ' + detail : ''}`);
    },
    warn(name, items) {
        if (items && items.length) this.warnings.push({ name, items });
    },

    // A fixture built relative to today, so it never goes stale.
    //
    // The odometer logs alone define the span: 60,000 -> 100,000 km over 365 days
    // = 109.59 km/day. Every service sits *inside* that window on both date and
    // mileage, so adding one never moves the first or last reading and the rate
    // stays a fixed, checkable number.
    RATE: 40000 / 365,
    fixture() {
        const day = n => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
        return {
            cars: [{
                id: 'test-car', make: 'Ford', model: 'Taurus', year: '2013',
                mileage: '100000', mileageDate: day(0),
                insuranceExpiry: day(-200), registrationExpiry: day(-400)
            }],
            services: [
                // recent, comfortably inside its 12,000 km interval -> ok
                { id: 's-oil', carId: 'test-car', type: 'Oil Change', date: day(30), mileage: '96700', cost: '200' },
                // 15,000 km interval last done at 62,000 -> due at 77,000, so ~23,000 km overdue
                { id: 's-air', carId: 'test-car', type: 'Air Filter', date: day(350), mileage: '62000', cost: '120' }
            ],
            // one reminder so the Arabic sweep actually reaches the Upcoming Reminders card
            reminders: [{
                id: 'r-air', carId: 'test-car', type: 'Air Filter', dueDate: day(-60),
                dueMileage: '110000', completed: false, autoCreated: true, notes: 'Auto: next Air Filter'
            }],
            fuelLogs: [],
            odometerLogs: [
                { id: 'o-old', carId: 'test-car', km: 60000, date: day(365) },
                { id: 'o-new', carId: 'test-car', km: 100000, date: day(0) }
            ],
            trash: []
        };
    },

    seed(W) {
        W.localStorage.setItem('autocare_data', JSON.stringify(this.fixture()));
        W.localStorage.setItem('autocare_climate', 'normal');
        W.localStorage.setItem('autocare_lang', 'en');
        W.localStorage.removeItem('autocare_custom_recs');
    },

    // ═══════════════ logic checks ═══════════════
    async logic(A) {
        const { Storage, Recommendations, Features } = A;
        const car = Storage.getCars()[0];
        const day = n => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];

        // -- odometer projection --
        this.near('daily km rate is derived from the reading spread',
            Storage.getDailyKmRate('test-car'), this.RATE, 0.01);
        this.eq('a same-day reading is not treated as an estimate',
            Storage.getProjectedMileage(car).estimated, false);

        // A reading lower than one already recorded must not become "the latest".
        // The highest known value wins, which is what stops a typo rewriting history.
        Storage.logOdometer('test-car', 99000, day(0));
        this.eq('a lower reading does not replace the highest one',
            Storage.getLastReading(car).km, 100000);
        this.seed(A.W);

        // -- whichever-comes-first --
        const air = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Air Filter');
        this.eq('an exceeded km threshold reads as overdue', air.status, 'overdue');
        this.ok('an overdue item reports negative km remaining', air.kmRemaining < 0, `got ${air.kmRemaining}`);
        this.eq('an overdue item is bound by distance, not time', air.binding, 'km');
        const oil = Recommendations.getMaintenanceStatus(Storage.getCars()[0], 'Oil Change');
        this.eq('a recent service reads as ok', oil.status, 'ok');
        this.ok('the binding dimension is reported', ['km', 'time'].includes(oil.binding), oil.binding);

        // -- climate multiplier --
        const normalKm = Recommendations.getEffective(car, 'Oil Change').km;
        A.W.localStorage.setItem('autocare_climate', 'severe');
        const severeKm = Recommendations.getEffective(car, 'Oil Change').km;
        A.W.localStorage.setItem('autocare_climate', 'normal');
        this.eq('severe climate shortens the interval by 20%', severeKm, Math.round(normalKm * 0.8));

        // -- inspection dates --
        const exp = Features.certificateExpiry('2026-01-15');
        this.eq('a certificate runs a standard year', exp, '2027-01-15');
        this.eq('inspectionDateFrom inverts certificateExpiry',
            Features.inspectionDateFrom(exp), '2026-01-15');

        // -- REGRESSION: a back-dated inspection record must not touch the odometer --
        // An estimated date paired with a real mileage would land a false reading in
        // getOdometerReadings and destroy the km/day rate every projection depends on.
        const rateBefore = Storage.getDailyKmRate('test-car');
        Storage.addService({
            carId: 'test-car', type: 'Periodic Inspection',
            date: Features.inspectionDateFrom(day(-180)),
            cost: '120', mileage: '', notes: 'Date estimated from the certificate expiry',
            inspectionResult: 'pass', inspectionExpiry: day(-180), inspectionCenter: 'Khobar Centre'
        });
        this.near('a back-dated inspection leaves the driving rate untouched',
            Storage.getDailyKmRate('test-car'), rateBefore, 0.001);
        this.seed(A.W);

        // -- trash round trip --
        Storage.deleteService('s-oil');
        this.eq('a deleted service goes to the trash', Storage.getServices('test-car').length, 1);
        const entry = Storage.getTrash()[0];
        Storage.restoreFromTrash(entry.id);
        this.eq('a restored service comes back', Storage.getServices('test-car').length, 2);
        this.seed(A.W);

        // -- duplicate detection --
        const dupe = Storage.findDuplicateService({ carId: 'test-car', type: 'Oil Change', date: day(30), mileage: '96700' });
        this.ok('a same type, date and mileage counts as a duplicate', !!dupe);
        const notDupe = Storage.findDuplicateService({ carId: 'test-car', type: 'Oil Change', date: day(31), mileage: '96700' });
        this.ok('a different date is not a duplicate', !notDupe);

        // -- REGRESSION: a backup must carry settings, or restoring it silently
        //    lengthens every interval by 25% --
        A.W.localStorage.setItem('autocare_climate', 'severe');
        const settings = Features.collectSettings();
        this.eq('a backup payload carries the climate setting', settings.climate, 'severe');
        A.W.localStorage.setItem('autocare_climate', 'normal');
    },

    // ═══════════════ render checks ═══════════════
    async render(A) {
        const { App, I18N, Features, Storage, W, D } = A;
        const pages = ['dashboard', 'cars', 'services', 'fuel', 'expenses', 'warranty', 'reminders'];
        const modals = {
            'add car': () => App.openCarModal(),
            'edit car': () => App.openCarModal(Storage.getCars()[0]),
            'add service': () => App.openServiceModal(),
            'inspection service': () => { App.openServiceModal(null, 'test-car', 'Periodic Inspection'); App._toggleServiceExtras(); },
            'add fuel': () => App.openFuelModal(),
            'add reminder': () => App.openReminderModal(),
            'custom interval': () => App.openCustomRecModal('test-car'),
            'repeat picker': () => App.openRepeatPicker(),
            'odometer': () => Features.openOdometerModal('test-car'),
            'document: insurance': () => Features.openDocumentModal('test-car', 'insuranceExpiry'),
            'document: inspection': () => Features.openDocumentModal('test-car', 'fahesExpiry'),
            'settings': () => Features.showSettingsModal(),
            'tyres': () => Features.openTireModal('test-car')
        };

        const overflowing = root => {
            const out = [];
            root.querySelectorAll('*').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && (r.right > W.innerWidth + 1 || r.left < -1))
                    out.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
            });
            return out;
        };
        // The bug class this suite exists for: a template literal wrapped in single
        // quotes renders its own source instead of the value.
        const rawTemplates = root => (root.innerText.match(/\$\{[^}]*\}/g) || []);

        this.eq('the test viewport is an iPhone width', W.innerWidth, 402);

        for (const lang of ['en', 'ar']) {
            I18N.set(lang); I18N.translateDOM();

            for (const p of pages) {
                let threw = null;
                try { App.navigate(p); } catch (e) { threw = e.message; }
                this.ok(`[${lang}] page renders: ${p}`, !threw, threw);
                if (threw) continue;
                const root = D.getElementById('page-' + p);
                this.eq(`[${lang}] no overflow at 402px: ${p}`, overflowing(root), []);
                this.eq(`[${lang}] no raw template literals: ${p}`, rawTemplates(root), []);
            }

            for (const [name, open] of Object.entries(modals)) {
                let threw = null;
                try { open(); } catch (e) { threw = e.message; }
                this.ok(`[${lang}] modal opens: ${name}`, !threw, threw);
                if (threw) { try { App.closeModal(); } catch (e) {} continue; }
                const m = D.getElementById('modal');
                this.ok(`[${lang}] modal is visible: ${name}`, m.style.display !== 'none');
                this.eq(`[${lang}] no overflow at 402px: ${name}`, overflowing(m), []);
                this.eq(`[${lang}] no raw template literals: ${name}`, rawTemplates(m), []);
                App.closeModal();
            }
        }

        // -- REGRESSION: the empty states that once printed their own source --
        const saved = W.localStorage.getItem('autocare_data');
        const data = JSON.parse(saved);
        W.localStorage.setItem('autocare_data', JSON.stringify({ ...data, services: [], reminders: [] }));
        for (const lang of ['en', 'ar']) {
            I18N.set(lang); I18N.translateDOM();
            App.navigate('dashboard');
            const recent = D.getElementById('recent-services').innerText.trim();
            const upcoming = D.getElementById('upcoming-reminders').innerText.trim();
            this.ok(`[${lang}] empty service list shows a message, not source`, recent.length > 0 && !recent.includes('${'), recent);
            this.ok(`[${lang}] empty reminder list shows a message, not source`, upcoming.length > 0 && !upcoming.includes('${'), upcoming);
            if (lang === 'ar') {
                this.ok('[ar] the empty messages are translated', /[؀-ۿ]/.test(recent) && /[؀-ۿ]/.test(upcoming), recent + ' / ' + upcoming);
            }
        }
        W.localStorage.setItem('autocare_data', saved);

        // -- Arabic sweep: report, do not fail. Known gaps live in README open items. --
        I18N.set('ar'); I18N.translateDOM();
        const untranslated = [];
        const allow = /SAR|km\b|mm|^L$|Ford|Taurus|^\d|📷|^[\d\s.,:%~+\-\/()·—–▲▼×]*$/;
        for (const p of pages) {
            App.navigate(p);
            const walk = D.createTreeWalker(D.getElementById('page-' + p), W.NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const txt = n.textContent.trim();
                if (!txt || /[؀-ۿ]/.test(txt) || allow.test(txt)) continue;
                untranslated.push(`${p}: ${txt.slice(0, 50)}`);
            }
        }
        this.warn('English text still showing in Arabic', [...new Set(untranslated)]);
        I18N.set('en'); I18N.translateDOM(); App.navigate('dashboard');
    },

    // ═══════════════ runner ═══════════════
    async run(iframe, logEl) {
        this.failures = []; this.warnings = []; this.passes = []; this._log = logEl;
        const W = iframe.contentWindow;
        const D = W.document;

        // Snapshot everything before touching it — this page shares an origin
        // with the live app, and the owner's records are not ours to lose.
        const snapshot = {};
        for (let i = 0; i < W.localStorage.length; i++) {
            const k = W.localStorage.key(i);
            snapshot[k] = W.localStorage.getItem(k);
        }
        const realAlert = W.alert, realConfirm = W.confirm;

        try {
            W.alert = () => {}; W.confirm = () => true;
            // const-declared modules are not on window; eval sees the global lexical scope
            W.eval('window.__modules = {Storage, Recommendations, Features, App, I18N, Photos};');
            const A = { ...W.__modules, W, D };

            this.seed(W);
            await this.logic(A);
            this.seed(W);
            await this.render(A);
        } catch (e) {
            this.failures.push({ name: 'the run itself threw', detail: e.message + '\n' + (e.stack || '').split('\n')[1] });
        } finally {
            W.alert = realAlert; W.confirm = realConfirm;
            W.localStorage.clear();
            Object.keys(snapshot).forEach(k => W.localStorage.setItem(k, snapshot[k]));
            this._paint(true);
        }
        return { passed: this.passes.length, failed: this.failures.length, warned: this.warnings.length };
    },

    _paint(final) {
        if (!this._log) return;
        const f = this.failures, w = this.warnings, p = this.passes;
        const state = final ? (f.length ? 'fail' : 'pass') : 'running';
        this._log.innerHTML = `
            <div class="summary ${state}">
                <strong>${p.length}</strong> passed ·
                <strong>${f.length}</strong> failed ·
                <strong>${w.reduce((n, x) => n + x.items.length, 0)}</strong> warnings
                ${final ? '' : ' · running…'}
            </div>
            ${f.length ? `<h3>Failures</h3><ul class="fails">${f.map(x =>
                `<li><b>${x.name}</b>${x.detail ? `<span>${String(x.detail).replace(/</g, '&lt;')}</span>` : ''}</li>`).join('')}</ul>` : ''}
            ${w.length ? `<h3>Warnings — known gaps, tracked in README</h3>${w.map(x =>
                `<p class="wname">${x.name} (${x.items.length})</p><ul class="warns">${x.items.map(i =>
                    `<li>${String(i).replace(/</g, '&lt;')}</li>`).join('')}</ul>`).join('')}` : ''}
            ${final && !f.length ? '<p class="allgood">Everything the suite knows how to check is passing.</p>' : ''}
            <details><summary>${p.length} passing checks</summary><ul class="passes">${p.map(x => `<li>${x}</li>`).join('')}</ul></details>`;
    }
};
