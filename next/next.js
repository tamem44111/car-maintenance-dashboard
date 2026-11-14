// ═══════════════════════════════════════════
// NEXT.JS — the app's screens: Home, History and Car.
//
// The numbers come from the same Storage, Recommendations and Features code the
// classic screens use (classic.html), so the two can never disagree. Everything
// that changes a record is in forms.js.
// ═══════════════════════════════════════════

// The backup code in features.js was written for the classic screens and talks to
// them through `App`. Here the same calls are answered with this design's sheets,
// so one tested export and import serves both.
const App = {
    currentPage: 'next',
    openModal(title, html) {
        Next.showSheet(Next.sheetHead(t(title)) + `<div class="classic">${html}</div><button type="button" id="modal-save" hidden></button>`);
    },
    closeModal() { Next.closeSheet(); },
    renderPage() { Next.render(); },
    navigate() { Next.render(); },
    paintLang() {}
};
// A message from that shared code arrives as a sheet, not a system popup
window.alert = message => Next.notice(String(message));

const Next = {
    HORIZON_KM: 20000,      // how far ahead the road strip looks
    CLUSTER_KM: 2000,       // jobs this close together are one trip to the workshop
    MAX_MARKS: 4,

    // Sentence-case names for this design. The current app's names are data keys
    // in Title Case; Arabic keeps using the shared translations.
    NAMES: {
        'Oil Change': 'Oil change', 'Tire Rotation': 'Tyre rotation', 'Brake Inspection': 'Brake check',
        'Front Brake Pads': 'Front brake pads', 'Rear Brake Pads': 'Rear brake pads',
        'Air Filter': 'Air filter', 'Cabin Air Filter': 'Cabin filter', 'AC Service': 'AC check',
        'Transmission': 'Transmission fluid', 'Coolant Flush': 'Coolant', 'Battery': 'Battery',
        'Spark Plugs': 'Spark plugs', 'Timing Belt': 'Timing belt',
        'Tires': 'Tyres', 'Periodic Inspection': 'Periodic inspection', 'Brake Pads': 'Brake pads',
        'Front Brake Discs': 'Front brake discs', 'Rear Brake Discs': 'Rear brake discs',
        'Brake Fluid': 'Brake fluid', 'Wheel Bearing': 'Wheel bearing'
    },
    // One or two words, for labels on the road strip
    SHORT: {
        'Oil Change': 'Oil', 'Tire Rotation': 'Rotation', 'Brake Inspection': 'Brakes',
        'Front Brake Pads': 'Front pads', 'Rear Brake Pads': 'Rear pads',
        'Air Filter': 'Air filter', 'Cabin Air Filter': 'Cabin filter', 'AC Service': 'AC',
        'Transmission': 'Gear oil', 'Coolant Flush': 'Coolant', 'Battery': 'Battery',
        'Spark Plugs': 'Plugs', 'Timing Belt': 'Timing belt'
    },

    ICONS: {
        home: '<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/>',
        hist: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        car: '<path d="M4 16v-3l2-5.2A2 2 0 017.9 6.5h8.2a2 2 0 011.9 1.3l2 5.2v3M4 13h16M6.5 16v1.5M17.5 16v1.5M3.5 16h17"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        chev: '<path d="M9 5l7 7-7 7"/>',
        find: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'
    },

    icon(name, cls) { return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${this.ICONS[name]}</svg>`; },
    num(n) { return Math.round(n).toLocaleString('en-US'); },

    // "4 Nov", in the Gregorian calendar and Latin digits in both languages, to
    // match every other date in the app.
    date(iso, parts) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const locale = I18N.lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB';
        // British English abbreviates September to four letters; every other month has three
        return new Intl.DateTimeFormat(locale, { ...parts, timeZone: 'UTC' }).format(d).replace(/\bSept\b/, 'Sep');
    },
    day(iso) { return this.date(iso, { day: 'numeric', month: 'short' }); },

    // 1,838.24 stays exact where a bill is being read; lists round to whole riyals
    money(v, exact) {
        const n = Number(v) || 0;
        const cents = exact && Math.round(n * 100) % 100 !== 0;
        const text = cents ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : this.num(n);
        return `${text} <small>${t('SAR')}</small>`;
    },

    // "3 receipts". Arabic changes the noun with the number (1, 2, 3 to 10, 11 and
    // up), so each counted phrase has a form for each case in i18n.js.
    count(n, one, other) {
        if (I18N.lang !== 'ar') return (n === 1 ? one : other).replace('{n}', this.num(n));
        return t(other + '|' + new Intl.PluralRules('ar').select(n), { n: this.num(n) });
    },

    name(type) { return I18N.lang === 'ar' ? I18N.t(type) : (this.NAMES[type] || type); },
    short(type) { return t(this.SHORT[type] || type); },
    // "Oil change and brake check", not "…and Brake check". Leaves "AC" alone.
    lower(s) { return I18N.lang === 'ar' || /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); },
    join(names) {
        if (names.length === 1) return names[0];
        if (names.length === 2) return t('{a} and {b}', { a: names[0], b: this.lower(names[1]) });
        return t('{a} + {n} more', { a: names[0], n: names.length - 1 });
    },

    SCREENS: ['home', 'history', 'car'],
    filter: '',             // History: '' for everything, a job type, or '@accident'
    query: '',              // History: what is typed in the search box

    init() {
        I18N.init();
        document.addEventListener('click', e => this.onClick(e));
        document.addEventListener('input', e => this.onInput(e));
        document.addEventListener('change', e => this.onChange(e));
        // A sheet is fixed to the bottom of the screen, which is where the keyboard
        // opens. Its height is passed to the stylesheet so the sheet sits on top of it.
        const vv = window.visualViewport;
        if (vv) {
            const lift = () => document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px');
            vv.addEventListener('resize', lift);
            vv.addEventListener('scroll', lift);
        }
        // the address can change without a tap: a link, or the phone's back gesture
        window.addEventListener('hashchange', () => { this.closeSheet(); this.render(); });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('viewer').classList.contains('open')) this.closePhoto();
            else this.closeSheet();
        });
        this.render();
    },

    onClick(e) {
        const el = e.target.closest('[data-do],[data-go],[data-visit],[data-filter],[data-photo],[data-step],[data-close]');
        if (!el || el.disabled) return;
        const d = el.dataset;
        // every action that opens a form or changes a record is a do_… in forms.js
        if ('do' in d) return this['do_' + d.do](d.arg, el);
        if ('go' in d) return this.go(d.go, d.arg);
        if ('visit' in d) return this.openVisit(d.visit, el);
        if ('filter' in d) return this.setFilter(d.filter);
        if ('photo' in d) return this.openPhoto(Number(d.photo));
        if ('step' in d) return this.stepPhoto(Number(d.step));
        if ('close' in d) return d.close === 'viewer' ? this.closePhoto() : this.closeSheet();
    },

    car() { return Storage.getCars()[0] || null; },

    screen() {
        const name = location.hash.slice(1);
        return this.SCREENS.includes(name) ? name : 'home';
    },

    // Tabs are places, not steps, so moving between them leaves nothing to go back
    // through. The address still changes, so reopening lands on the same screen.
    go(name, filter) {
        history.replaceState(null, '', name === 'home' ? location.pathname + location.search : '#' + name);
        this.filter = filter || '';
        this.query = '';
        this.closeSheet();
        this.render();
        window.scrollTo(0, 0);
    },

    // Every scheduled job with a record, placed on one road. A job due by date is
    // given a distance at the car's own driving rate, so "in 3 months" and
    // "in 10,000 km" can sit on the same line.
    jobs(car) {
        const rate = Storage.getDailyKmRate(car.id) || 0;
        return Recommendations.ALL_TYPES
            .map(type => Recommendations.getMaintenanceStatus(car, type))
            .filter(st => st && st.status !== 'unknown')
            .map(st => {
                const byKm = st.hasKm ? st.kmRemaining : Infinity;
                const byTime = rate > 0 ? st.daysRemaining * rate : Infinity;
                const km = Math.min(byKm, byTime);
                return {
                    type: st.type, status: st.status, days: st.dueDays,
                    km: Number.isFinite(km) ? Math.round(km) : null,
                    kmFirst: st.hasKm && byKm <= byTime,
                    kmLeft: st.kmRemaining, daysLeft: st.daysRemaining,
                    // a distance counted from a worked-out reading is said with "about"
                    est: !!st.kmEstimated, pad: st.measured || null
                };
            })
            .sort((a, b) => (a.km === null ? Infinity : a.km) - (b.km === null ? Infinity : b.km) || a.days - b.days);
    },

    // Jobs that fall close together become one visit. Everything already overdue is
    // one visit too: it is all due now.
    visits(jobs) {
        const out = [];
        jobs.forEach(j => {
            const last = out[out.length - 1];
            const near = last && j.km !== null && last.km !== null &&
                (j.km <= 0 || j.km - Math.max(last.km, 0) <= this.CLUSTER_KM);
            if (near) last.jobs.push(j);
            else out.push({ km: j.km, jobs: [j] });
        });
        out.forEach(v => {
            v.status = v.jobs.some(j => j.status === 'overdue') ? 'overdue'
                : v.jobs.some(j => j.status === 'soon') ? 'soon' : 'ok';
        });
        return out;
    },

    // "13 days", "3 months": Arabic takes a different form of the noun for 1, 2,
    // 3 to 10, and 11 and up, so these go through count() like visits and receipts
    days(n) { return this.count(n, '{n} day', '{n} days'); },
    months(n) { return this.count(n, '{n} month', '{n} months'); },
    span(days) {
        const d = Math.max(0, days);
        return t('about {v}', { v: d <= 60 ? this.days(d) : this.months(Math.round(d / 30)) });
    },
    about(km) { return this.num(Math.round(km / 500) * 500); },

    // When a visit falls due, said the way its soonest job is counted
    when(v) {
        const j = v.jobs[0];
        if (j.pad && (j.pad.basis || j.pad.mm <= j.pad.minMm)) return this.padLine(j);
        if (j.status === 'overdue') {
            if (!(j.kmFirst && j.kmLeft <= 0)) return t('{v} overdue', { v: this.days(Math.abs(j.daysLeft)) });
            return j.est ? t('about {km} km over', { km: this.about(Math.abs(j.kmLeft)) }) : t('{km} km over', { km: this.num(Math.abs(j.kmLeft)) });
        }
        const span = this.span(j.days);
        if (!j.kmFirst) return span;
        return (j.est ? t('about {km} km', { km: this.about(j.kmLeft) }) : t('{km} km', { km: this.num(j.kmLeft) })) + t(', ') + span;
    },

    // Measured pads are said by what is left of them, then by when that runs out
    padLine(j) {
        const mm = j.pad.mm;
        if (mm <= j.pad.minMm) return t('{mm} mm left, replace now', { mm });
        if (j.pad.stale) return t('{mm} mm on {d}, measure again', { mm, d: this.day(j.pad.date) });
        return t('{mm} mm left', { mm }) + t(', ') + this.span(j.days);
    },

    // What the next visit usually costs, from what the owner has paid before. A job
    // done with the oil change is not billed; a job never paid for has no price to
    // go by, and then the figure is a floor, not an estimate.
    usual(car, jobs) {
        let sum = 0, missing = 0;
        jobs.forEach(j => {
            if ((Recommendations.getEffective(car, j.type) || {}).withOil) return;
            const avg = Storage.getAverageServiceCost(j.type, car.id);
            if (avg) sum += avg; else missing += 1;
        });
        if (!sum) return '';
        return t(missing ? 'Usually {v} SAR or more' : 'Usually about {v} SAR', { v: this.num(sum) });
    },

    roadHTML(visits) {
        const ahead = visits.filter(v => v.km !== null);
        if (!ahead.length) return '';
        let horizon = this.HORIZON_KM;
        // With little coming up soon, look further so the strip is never one lonely dot
        if (ahead.filter(v => v.km <= horizon).length < 2 && ahead.length >= 2) {
            horizon = Math.min(60000, Math.ceil(ahead[1].km * 1.1 / 5000) * 5000);
        }
        const marks = ahead.filter(v => v.km <= horizon).slice(0, this.MAX_MARKS);
        if (!marks.length) return '';

        const parts = marks.map((v, i) => {
            const pct = Math.min(97, Math.max(7, (Math.max(v.km, 0) / horizon) * 100));
            const side = i % 2 === 0 ? 'below' : 'above';
            const atEnd = pct > 60;
            const pos = atEnd ? `inset-inline-end:${(100 - pct - 3).toFixed(1)}%` : `inset-inline-start:${Math.max(0, pct - 4).toFixed(1)}%`;
            // A job due by date has no km limit; its place on the road is an estimate
            // at the car's driving rate, so it is rounded and says "about".
            const figure = v.status === 'overdue' ? t('Overdue')
                : v.jobs[0].kmFirst && !v.jobs[0].est ? t('{km} km', { km: this.num(v.km) })
                : t('about {km} km', { km: this.about(v.km) });
            return `<i class="mark ${v.status}" style="inset-inline-start:${pct.toFixed(1)}%"></i>
                <div class="lab ${side} ${atEnd ? 'end' : ''} ${v.status}" style="${pos}">${esc(this.join(v.jobs.map(j => this.short(j.type))))}<span>${figure}</span></div>`;
        }).join('');

        return `<section class="card" aria-label="${t('Road ahead')}">
            <h2>${t('Road ahead')}</h2>
            <div class="track"><div class="track-line"></div><i class="mark now"></i>${parts}</div>
        </section>`;
    },

    // Two labels on the same side can still collide when their visits are close.
    // The later one gives way: its dot stays, and the job is in the list below.
    settleLabels() {
        const kept = [];
        document.querySelectorAll('.track .lab').forEach(lab => {
            const r = lab.getBoundingClientRect();
            const hit = kept.some(k => !(r.right < k.left - 4 || r.left > k.right + 4 || r.bottom < k.top || r.top > k.bottom));
            if (hit) lab.classList.add('crowded'); else kept.push(r);
        });
    },

    nextHTML(visits, car) {
        const rows = visits.slice(0, 3).map((v, i) => `
            <button type="button" class="row ${v.status}" data-do="log" data-arg="${esc(v.jobs.map(j => j.type).join('|'))}">
                <span class="row-main"><strong>${esc(this.join(v.jobs.map(j => this.name(j.type))))}</strong><span>${this.when(v)}</span>${i === 0 && this.usual(car, v.jobs) ? `<span class="usual">${this.usual(car, v.jobs)}</span>` : ''}</span>
                ${i === 0 ? `<span class="log">${t('Log')}</span>` : `<span class="chev">${this.icon('chev', 'flip')}</span>`}
            </button>`).join('');
        return `<section class="card" aria-label="${t('Next up')}">${rows || `<p class="empty">${t('Nothing due soon')}</p>`}</section>`;
    },

    costTile(car) {
        const bd = Storage.getCostBreakdown(car.id);
        return `<button type="button" class="tile" data-go="car"><span>${t('Running cost')}</span>
            <strong>${bd ? bd.totalPerKm.toFixed(2) : '—'} <small>${t('SAR/km')}</small></strong></button>`;
    },

    // One line for all three documents: the worst of them, or that all is well
    docsTile(car) {
        const states = Features.DOCS.map(d => ({ name: t(d.label), st: Features.docStatus(car, d.key) }));
        const expired = states.find(s => s.st.state === 'expired');
        const soon = states.filter(s => s.st.state === 'soon').sort((a, b) => a.st.days - b.st.days)[0];
        const anySet = states.some(s => s.st.state !== 'missing');
        let cls = 'ok', text = t('All valid');
        if (expired) { cls = 'overdue'; text = t('{name} expired', { name: expired.name }); }
        else if (soon) { cls = 'soon'; text = t('{name}: {v} left', { name: soon.name, v: this.days(soon.st.days) }); }
        else if (!anySet) { cls = ''; text = t('Not set'); }
        return `<button type="button" class="tile" data-go="car"><span>${t('Documents')}</span>
            <strong class="word ${cls}">${text}</strong></button>`;
    },

    dockHTML(screen) {
        const tab = (icon, label, name) =>
            `<button type="button" ${name === screen ? 'aria-current="page"' : `data-go="${name}"`}>${this.icon(icon)}${t(label)}</button>`;
        return `<nav class="dock" aria-label="${t('Main')}">
            <div class="pill">${tab('home', 'Home', 'home')}${tab('hist', 'History', 'history')}${tab('car', 'Car', 'car')}</div>
            <button type="button" class="plus" data-do="log" aria-label="${t('Log')}">${this.icon('plus')}</button>
        </nav>`;
    },

    render() {
        const app = document.getElementById('app');
        const car = this.car();
        if (!car) {
            app.innerHTML = `<div class="head"><h1 class="title">AutoCare</h1></div>
                <p class="lede">${t('No car yet.')}</p>
                <button type="button" class="primary" data-do="carEdit">${t('Add your car')}</button>
                <label class="quiet">${t('Restore a backup')}<input type="file" accept=".json,application/json" data-import hidden></label>`;
            return;
        }
        // Auto reminders are a view of the schedule, brought up to date on every draw,
        // as the classic screens do.
        Recommendations.syncAutoReminders();
        const screen = this.screen();
        app.innerHTML = this[screen + 'HTML'](car) + this.dockHTML(screen);
        if (screen === 'home') {
            this.settleLabels();
            Features.scheduleNotifications();
        }
    },

    // The records live on this phone and nowhere else, so an overdue backup is said on Home
    backupHTML() {
        const b = Storage.getBackupStatus();
        if (!b.needed) return '';
        const text = b.never ? t('No backup yet. Your records live only on this phone.')
            : b.newReceipt ? t('A receipt you added is only on this phone.')
            : t('Last backup was {d} days ago, and you have changes since.', { d: b.daysSinceBackup });
        return `<button type="button" class="card nudge" data-do="backup"><span>${text}</span><b>${t('Back up')}</b></button>`;
    },

    // Readings that cannot all be true make every estimate that leans on them wrong
    conflictsHTML(car) {
        const n = Storage.getReadingConflicts(car.id).length;
        if (!n) return '';
        return `<button type="button" class="card nudge" data-do="checks"><span>${t(n === 1 ? 'Two odometer readings cannot both be right.' : 'Some odometer readings cannot all be right.')}</span><b>${t('Check')}</b></button>`;
    },

    homeHTML(car) {
        const proj = Storage.getProjectedMileage(car);
        const visits = this.visits(this.jobs(car));
        const read = proj.lastDate
            ? t(proj.estimated ? 'Estimated. Last read {d}.' : 'Read on {d}.', { d: this.day(proj.lastDate) })
            : t('No reading yet');
        return `
            <div class="head"><span class="head-car">${esc(car.make)} ${esc(car.model)} ${esc(car.year)}</span></div>
            <div class="odo">${proj.km ? this.num(proj.km) : '—'}<small>${t('km')}</small></div>
            <div class="est"><span>${read}</span><button type="button" data-do="odo">${t('Update')}</button></div>
            ${this.roadHTML(visits)}
            ${this.nextHTML(visits, car)}
            <div class="tiles">${this.costTile(car)}${this.docsTile(car)}</div>
            ${this.conflictsHTML(car)}
            ${this.backupHTML()}`;
    },

    // ── History ──
    // The logbook, one entry per trip to the workshop: every record written for the
    // same day is one visit, whatever was done and whoever paid.
    pastVisits(car) {
        const place = type => { const i = Recommendations.ALL_TYPES.indexOf(type); return i < 0 ? 99 : i; };
        const byDay = {};
        Storage.getServices(car.id).forEach(s => { if (s.date) (byDay[s.date] = byDay[s.date] || []).push(s); });
        return Object.keys(byDay).sort().reverse()
            .map(date => this.sumVisit(date, byDay[date].slice().sort((a, b) => place(a.type) - place(b.type))));
    },

    sumVisit(date, records) {
        const kms = records.map(s => parseInt(s.mileage, 10)).filter(n => n > 0);
        return {
            date, records,
            km: kms.length ? Math.max(...kms) : null,
            // what the owner paid, and separately what insurance paid for him
            paid: records.reduce((n, s) => n + Storage.getOwnCost(s), 0),
            insured: records.reduce((n, s) => n + (s.insurancePaid ? Storage.getServiceCost(s) : 0), 0),
            // one invoice often covers several jobs, so the same photo is counted once
            photos: [...new Set(records.flatMap(s => (s.bills || []).flatMap(b => Photos.idsFor(b))))],
            accident: records.some(s => s.accident),
            checkOnly: records.every(s => s.checkOnly),
            fromMemory: records.every(s => s.backfilled)
        };
    },

    matches(s) {
        if (this.filter && !(this.filter === '@accident' ? !!s.accident : s.type === this.filter)) return false;
        const words = this.fold(this.query).split(' ').filter(Boolean);
        if (!words.length) return true;
        const hay = this.hay(s);
        return words.every(w => hay.includes(w));
    },

    // Text made comparable: case, Arabic letter variants and marks, and the two
    // sets of Arabic digits all stop mattering, so "فلتر" finds "فلتر الهواء" and
    // "٢٠٢٦" finds 2026.
    fold(text) {
        return String(text || '').toLowerCase()
            .replace(/[\u064B-\u0652\u0640]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/\s+/g, ' ').trim();
    },

    // Everything about a record a person might search by: what it was in either
    // language, the note, the shop, the parts on its bills, the day and the reading
    hay(s) {
        const bills = (s.bills || []).flatMap(b => [b.label, b.vendor]);
        const km = parseInt(s.mileage, 10) > 0 ? [String(s.mileage), this.num(parseInt(s.mileage, 10))] : [];
        const tags = [s.accident && t('Accident'), s.insurancePaid && t('Paid by insurance'), s.checkOnly && t('Checked only')];
        return this.fold([s.type, this.NAMES[s.type], I18N.dict.ar[s.type], s.notes, ...bills, ...km, ...tags,
            s.date, this.date(s.date, { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' '));
    },

    // With a job picked or a search typed, each visit shows what matches alone: when
    // it was done and what it cost. The full visit is still one tap away.
    shownVisits(car) {
        const narrowed = this.filter || this.fold(this.query);
        return this.pastVisits(car)
            .map(v => narrowed ? this.sumVisit(v.date, v.records.filter(s => this.matches(s))) : v)
            .filter(v => v.records.length);
    },

    list(bits) { return bits.map((b, i) => i ? this.lower(b) : b).join(t(', ')); },

    visitRow(v) {
        const bits = [];
        if (v.km) bits.push(t('{km} km', { km: this.num(v.km) }));
        else if (v.fromMemory) bits.push(t('From memory'));
        if (v.checkOnly) bits.push(t('Checked only'));
        if (v.accident) bits.push(t('Accident'));
        if (v.insured) bits.push(t('Insurance paid {v} SAR', { v: this.num(v.insured) }));
        if (v.photos.length) bits.push(this.count(v.photos.length, '{n} receipt', '{n} receipts'));
        return `<button type="button" class="visit" data-visit="${esc(v.date)}">
            <span class="when"><b>${new Date(v.date).getUTCDate()}</b>${this.date(v.date, { month: 'short' })}</span>
            <span class="what"><strong>${esc(this.join(v.records.map(s => this.name(s.type))))}</strong>${bits.length ? `<span>${this.list(bits)}</span>` : ''}</span>
            ${v.paid > 0 ? `<span class="cost">${this.money(v.paid)}</span>` : ''}
        </button>`;
    },

    historyList(car) {
        const years = [];
        const shown = this.shownVisits(car);
        if (!shown.length) return `<p class="lede none">${t('Nothing matches.')}</p>`;
        shown.forEach(v => {
            const y = v.date.slice(0, 4);
            const last = years[years.length - 1];
            if (last && last.y === y) last.visits.push(v); else years.push({ y, visits: [v] });
        });
        return years.map(g => {
            const paid = g.visits.reduce((n, v) => n + v.paid, 0);
            return `<section class="year" aria-label="${g.y}">
                <h2><span>${g.y}</span>${paid > 0 ? `<span>${this.money(paid)}</span>` : ''}</h2>
                <div class="card">${g.visits.map(v => this.visitRow(v)).join('')}</div>
            </section>`;
        }).join('');
    },

    // One chip per kind of job that has a record, the most frequent first
    chipsHTML(car) {
        const all = Storage.getServices(car.id);
        const seen = {};
        all.forEach(s => { seen[s.type] = (seen[s.type] || 0) + 1; });
        const types = Object.keys(seen).sort((a, b) => seen[b] - seen[a]);
        if (types.length < 2) return '';
        const chip = (key, label) => `<button type="button" class="chip" data-filter="${esc(key)}" aria-pressed="${this.filter === key}">${esc(label)}</button>`;
        return `<div class="chips" role="group" aria-label="${t('Show')}">${chip('', t('All'))}${types.map(ty => chip(ty, this.name(ty))).join('')}${all.some(s => s.accident) ? chip('@accident', t('Accident')) : ''}</div>`;
    },

    historyHTML(car) {
        const visits = this.pastVisits(car);
        const head = `<div class="head"><h1 class="title">${t('History')}</h1></div>`;
        if (!visits.length) return `${head}<p class="lede">${t('Nothing logged yet. Your first service will appear here.')}</p>`;
        const since = this.date(visits[visits.length - 1].date, { month: 'short', year: 'numeric' });
        return `${head}
            <p class="lede">${t('{visits} since {d}', { visits: this.count(visits.length, '{n} visit', '{n} visits'), d: since })}</p>
            <label class="search">${this.icon('find')}<input type="search" data-q value="${esc(this.query)}" placeholder="${t('Search jobs, notes, shops')}" aria-label="${t('Search')}" enterkeyhint="search" autocomplete="off"></label>
            ${this.chipsHTML(car)}
            <div id="hist-list">${this.historyList(car)}</div>`;
    },

    setFilter(key) {
        this.filter = key;
        document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === key)));
        document.getElementById('hist-list').innerHTML = this.historyList(Storage.getCars()[0]);
    },

    // The list follows the typing; the box itself is left alone so the keyboard stays up
    setQuery(text) {
        this.query = text;
        const list = document.getElementById('hist-list');
        if (list) list.innerHTML = this.historyList(this.car());
    },

    // ── One visit, opened as a sheet over the list ──
    jobHTML(s) {
        const cost = Storage.getServiceCost(s);
        const tags = [];
        if (s.accident) tags.push(t('Accident'));
        if (s.insurancePaid) tags.push(t('Paid by insurance'));
        if (s.checkOnly) tags.push(t('Checked only'));
        if (parseFloat(s.padThickness) > 0) tags.push(t('Pads at {mm} mm', { mm: esc(s.padThickness) }));
        if (s.inspectionResult) tags.push(t(s.inspectionResult === 'pass' ? 'Passed' : 'Failed'));
        if (s.inspectionExpiry) tags.push(t('Valid until') + ' ' + this.date(s.inspectionExpiry, { day: 'numeric', month: 'short', year: 'numeric' }));
        if (s.inspectionCenter) tags.push(esc(t(s.inspectionCenter)));

        const bills = s.bills || [];
        const lines = bills.length > 1 || bills.some(b => b.label || b.vendor) ? bills.map(b => `
            <li><span><span dir="auto">${esc(b.label || b.vendor || t(b.kind || 'Other'))}</span><small dir="auto">${esc(b.label ? [t(b.kind || 'Other'), b.vendor].filter(Boolean).join(t(', ')) : '')}</small></span>
                <span class="amt">${this.money(b.amount, true)}</span></li>`).join('') : '';

        return `<div class="job">
            <div class="job-top"><strong>${esc(this.name(s.type))}</strong>${cost > 0 ? `<span class="amt">${this.money(cost, true)}</span>` : ''}</div>
            ${tags.length ? `<p class="tags">${this.list(tags)}</p>` : ''}
            ${s.notes ? `<p class="job-note" dir="auto">${esc(s.notes)}</p>` : ''}
            ${lines ? `<ul class="bills">${lines}</ul>` : ''}
            <button type="button" class="link" data-do="edit" data-arg="${esc(s.id)}">${t('Edit')}</button>
        </div>`;
    },

    // Every sheet starts the same way: what it is, and a way out
    sheetHead(title, sub) {
        return `<div class="sheet-head"><div><h2 id="sheet-title">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
            <button type="button" class="round" data-close="sheet" aria-label="${t('Close')}">${this.icon('close')}</button></div>`;
    },

    visitHTML(v) {
        const thumbs = v.photos.map((id, i) => `<button type="button" class="thumb" data-photo="${i}" aria-label="${t('Receipt {n}', { n: i + 1 })}"><img alt="" data-thumb="${esc(id)}"></button>`).join('');
        const line = (label, amount) => `<div class="sum"><span>${t(label)}</span><strong>${this.money(amount, true)}</strong></div>`;
        const totals = v.insured ? line('Insurance paid', v.insured) + line('You paid', v.paid)
            : v.paid > 0 ? line('Total', v.paid) : '';
        return this.sheetHead(this.date(v.date, { day: 'numeric', month: 'long', year: 'numeric' }), v.km ? t('{km} km', { km: this.num(v.km) }) : '')
            + `<div class="card">${v.records.map(s => this.jobHTML(s)).join('')}</div>
            ${thumbs ? `<div class="card"><h2>${t('Receipts')}</h2><div class="thumbs">${thumbs}</div></div>` : ''}
            ${totals ? `<div class="card sums">${totals}</div>` : ''}
            <button type="button" class="quiet" data-do="addTo" data-arg="${esc(v.date)}">${t('Add a job to this visit')}</button>`;
    },

    openVisit(date, opener) {
        const v = this.pastVisits(this.car()).find(x => x.date === date);
        if (!v) return this.closeSheet();
        this._photos = v.photos;
        this.showSheet(this.visitHTML(v), opener);
    },

    // ── Sheets: one at a time, over the page ──
    // Showing a sheet while one is open swaps what is in it, without the slide.
    showSheet(html, opener) {
        const host = document.getElementById('sheet');
        const fresh = !host.classList.contains('open');
        if (fresh) this._opener = opener || document.activeElement;
        host.classList.toggle('still', !fresh);
        host.innerHTML = `<div class="scrim" data-close="sheet"></div>
            <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">${html}</section>`;
        host.classList.add('open');
        document.body.classList.add('locked');
        document.getElementById('app').inert = true;
        const first = host.querySelector('[autofocus]') || host.querySelector('button[data-close]');
        if (first) first.focus();
        this.loadThumbs(host);
    },

    // Receipts live in the phone's photo store and arrive a moment after the text
    loadThumbs(root) {
        root.querySelectorAll('img[data-thumb]:not([src])').forEach(img => {
            const gone = () => img.closest('.thumb').classList.add('missing');
            Photos.get(img.dataset.thumb).then(url => { if (url) img.src = url; else gone(); }).catch(gone);
        });
    },

    closeSheet() {
        const host = document.getElementById('sheet');
        if (!host.classList.contains('open')) return;
        // a photo added to a form that was then abandoned belongs to no record
        if (this.form && this.form.photoIds) Features.cleanupPhotos();
        this.form = null;
        host.classList.remove('open', 'still');
        host.innerHTML = '';
        document.body.classList.remove('locked');
        document.getElementById('app').inert = false;
        // a new version arrived while the sheet was open (see index.html)
        if (window.__reloadAfterSheet) return location.reload();
        if (this._opener && document.contains(this._opener)) this._opener.focus();
    },

    // ── A receipt, full screen ──
    openPhoto(i) {
        const many = this._photos.length > 1;
        const host = document.getElementById('viewer');
        this._photoAt = i;
        host.innerHTML = `<div class="viewer-bar"><span id="viewer-count"></span>
                <button type="button" class="round" data-close="viewer" aria-label="${t('Close')}">${this.icon('close')}</button></div>
            <img id="viewer-img" alt="${t('Receipt')}">
            ${many ? `<button type="button" class="round step prev" data-step="-1" aria-label="${t('Previous')}">${this.icon('chev', 'flip back')}</button>
                <button type="button" class="round step next" data-step="1" aria-label="${t('Next')}">${this.icon('chev', 'flip')}</button>` : ''}`;
        host.classList.add('open');
        document.getElementById('sheet').inert = true;
        host.querySelector('button[data-close]').focus();
        this.showPhoto();
    },

    showPhoto() {
        const ids = this._photos, i = this._photoAt;
        const img = document.getElementById('viewer-img');
        document.getElementById('viewer-count').textContent = ids.length > 1 ? `${i + 1} / ${ids.length}` : '';
        img.removeAttribute('src');
        const gone = () => this.toast(t('This receipt photo is not on this phone.'));
        Photos.get(ids[i]).then(url => { if (this._photoAt !== i) return; if (url) img.src = url; else gone(); }).catch(gone);
    },

    stepPhoto(delta) {
        const n = this._photos.length;
        this._photoAt = (this._photoAt + delta + n) % n;
        this.showPhoto();
    },

    closePhoto() {
        const host = document.getElementById('viewer');
        host.classList.remove('open');
        host.innerHTML = '';
        document.getElementById('sheet').inert = false;
    },

    // ── Car ──
    // What the car needs and holds: its schedule, its papers, its tyres, its costs.
    // Every job the car has a schedule for, soonest first, each said the way Home
    // says it. A job never logged has nothing to count from yet, and goes last.
    schedule(car) {
        const known = this.jobs(car).map(j => ({ type: j.type, status: j.status, line: this.when({ jobs: [j] }) }));
        const never = Recommendations.ALL_TYPES
            .filter(type => !known.some(k => k.type === type))
            .map(type => Recommendations.getMaintenanceStatus(car, type))
            .filter(Boolean)
            // pads that were measured but never logged as fitted: say what was measured
            .map(st => ({ type: st.type, status: 'unknown', line: this.unknownLine(st) }));
        return known.concat(never);
    },

    unknownLine(st) {
        return st.measured ? t('{mm} mm on {d}', { mm: st.measured.mm, d: this.date(st.measured.date, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('No record yet');
    },

    every(rec) {
        const parts = [];
        if (rec && rec.km) parts.push(t('{km} km', { km: this.num(rec.km) }));
        if (rec && rec.months) parts.push(this.months(rec.months));
        return parts.join(' ' + t('or') + ' ');
    },

    docLine(st) {
        const d = st.date ? this.date(st.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        if (st.state === 'missing') return t('Not set');
        if (st.state === 'expired') return t('Expired on {d}', { d });
        if (st.state === 'soon') return t('{v} left, until {d}', { v: this.days(st.days), d });
        return t('Valid until {d}', { d });
    },

    carHTML(car) {
        const proj = Storage.getProjectedMileage(car);
        const row = (attrs, cls, title, sub, tail) => `<button type="button" class="row ${cls}" ${attrs}>
            <span class="row-main"><strong>${title}</strong><span>${sub}</span></span>${tail || `<span class="chev">${this.icon('chev', 'flip')}</span>`}</button>`;
        const fact = (label, value) => `<div class="fact"><span>${label}</span><strong>${value}</strong></div>`;

        const sched = this.schedule(car).map(j =>
            row(`data-do="job" data-arg="${esc(j.type)}"`, j.status === 'ok' || j.status === 'unknown' ? '' : j.status, esc(this.name(j.type)), j.line)).join('');

        const docs = Features.DOCS.map(d => {
            const st = Features.docStatus(car, d.key);
            const cls = st.state === 'expired' ? 'overdue' : st.state === 'soon' ? 'soon' : '';
            return row(`data-do="doc" data-arg="${d.key}"`, cls, esc(this.name(d.label)), this.docLine(st));
        }).join('');

        const ty = Storage.getTyreStatus(car);
        const set = car.tires || {};
        const made = Storage.getTyreAge(car);
        const tyres = `<section class="card" aria-label="${t('Tyres')}"><h2>${t('Tyres')}</h2>
            ${ty ? fact(t('This set'), esc(ty.detail || '—')) : ''}
            ${ty && ty.fittedDate ? fact(t('Fitted'), this.date(ty.fittedDate, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}
            ${ty && ty.kmLeft !== null && ty.kmLeft > 0 ? fact(t('Usual life left'), t('about {km} km', { km: this.num(Math.round(ty.kmLeft / 1000) * 1000) })) : ''}
            ${made ? fact(t('Made'), this.date(made.madeOn + (made.madeOn.length === 7 ? '-01' : ''), { month: 'short', year: 'numeric' }) + `<small>${t('{y} years old', { y: made.years })}</small>`) : ''}
            ${row('data-do="tyre"', made && made.status !== 'ok' ? 'soon' : '', t('Tyre details'),
                made ? ([set.brand, set.size].some(Boolean) ? `<bdi dir="auto">${esc([set.brand, set.size].filter(Boolean).join(' '))}</bdi>` : t('Brand and size')) : t('Add the date they were made, to track their age'))}
            </section>`;

        const conflicts = Storage.getReadingConflicts(car.id).length;
        const fuel = Features.getFuelSettings();
        const fuelLine = fuel.mode === 'consumption' && parseFloat(fuel.lp100) > 0 ? t('{l} L/100 km at {p} SAR a litre', { l: esc(fuel.lp100), p: esc(fuel.price) })
            : fuel.mode === 'monthly' && parseFloat(fuel.monthly) > 0 ? t('{v} SAR a month', { v: this.num(parseFloat(fuel.monthly)) })
            : t('Off. Running cost counts maintenance only.');
        const deleted = Storage.getDeletedServices(car.id).length;

        const wars = Storage.getActiveWarranties(car.id).map(w => {
            const left = [];
            if (w.warranty.daysRemaining !== null && w.warranty.daysRemaining !== undefined) left.push(this.days(w.warranty.daysRemaining));
            if (w.warranty.kmRemaining !== null && w.warranty.kmRemaining !== undefined) left.push(t('{km} km', { km: this.num(w.warranty.kmRemaining) }));
            return fact(`<span dir="auto">${esc(w.bill.label || this.name(w.bill.serviceType))}</span>`, t('{left} left', { left: left.join(' ' + t('or') + ' ') }));
        }).join('');

        const bd = Storage.getCostBreakdown(car.id);
        const year = String(new Date().getFullYear());
        const paid = Storage.getServices(car.id).filter(s => (s.date || '').startsWith(year)).reduce((n, s) => n + Storage.getOwnCost(s), 0);
        const ahead = Storage.getCostForecast(car.id, 6).total;
        const backup = Storage.getBackupStatus();
        const backedUp = backup.never ? t('Never backed up')
            : backup.daysSinceBackup === 0 ? t('Backed up today') : t('Last backup {d} days ago', { d: backup.daysSinceBackup });
        const climate = localStorage.getItem('autocare_climate') || 'normal';
        const pick = (act, value, current, label) => `<button type="button" data-do="${act}" data-arg="${value}" aria-pressed="${value === current}">${label}</button>`;
        const notif = typeof Notification === 'undefined' ? ''
            : Notification.permission === 'granted' ? fact(t('Reminders'), t('On'))
            : Notification.permission === 'denied' ? fact(t('Reminders'), t('Blocked in the phone\'s settings'))
            : row('data-do="notify"', '', t('Reminders'), t('Get a notification when something is due'));

        return `
            <div class="head"><h1 class="title">${esc(car.make)} ${esc(car.model)}</h1></div>
            <p class="lede">${[esc(car.year), proj.km ? t('{km} km', { km: this.num(proj.km) }) : ''].filter(Boolean).join(t(', '))}</p>
            ${conflicts ? `<section class="card" aria-label="${t('To check')}">${row('data-do="checks"', 'soon', t('Readings to check'),
                t(conflicts === 1 ? 'Two odometer readings cannot both be right.' : 'Some odometer readings cannot all be right.'))}</section>` : ''}
            <section class="card" aria-label="${t('Schedule')}"><h2>${t('Schedule')}</h2>${sched}</section>
            <section class="card" aria-label="${t('Documents')}"><h2>${t('Documents')}</h2>${docs}</section>
            ${tyres}
            ${wars ? `<section class="card" aria-label="${t('Warranties')}"><h2>${t('Warranties')}</h2>${wars}</section>` : ''}
            <section class="card" aria-label="${t('Costs')}"><h2>${t('Costs')}</h2>
                ${fact(t('Running cost'), bd ? `${bd.totalPerKm.toFixed(2)} <small>${t('SAR/km')}</small>`
                    + (bd.fuelEstimated ? `<small class="under">${t('maintenance {m}, fuel about {f}', { m: bd.maintPerKm.toFixed(2), f: bd.fuelPerKm.toFixed(2) })}</small>` : '') : '—')}
                ${fact(t('Paid in {y}', { y: year }), this.money(paid))}
                ${fact(t('Expected, next 6 months'), t('about {v}', { v: this.money(Math.round(ahead / 50) * 50) }))}
                ${row('data-do="fuel"', '', t('Fuel estimate'), fuelLine)}
            </section>
            <section class="card" aria-label="${t('Settings')}"><h2>${t('Settings')}</h2>
                <div class="fact"><span>${t('Language')}</span><div class="seg">${pick('lang', 'en', I18N.lang, 'English')}${pick('lang', 'ar', I18N.lang, 'العربية')}</div></div>
                <div class="fact"><span>${t('Climate')}</span><div class="seg">${pick('climate', 'normal', climate, t('Normal'))}${pick('climate', 'severe', climate, t('Hot and dusty'))}</div></div>
                ${row('data-do="backup"', '', t('Back up now'), backedUp)}
                <label class="row"><span class="row-main"><strong>${t('Restore a backup')}</strong><span>${t('Choose a backup file from Files')}</span></span>
                    <span class="chev">${this.icon('chev', 'flip')}</span><input type="file" accept=".json,application/json" data-import hidden></label>
                ${notif}
                ${row('data-do="calendar"', '', t('Add to Calendar'), t('Document dates and due dates, with alerts'))}
                ${row('data-do="carEdit"', '', t('Car details'), `<bdi dir="auto">${esc([car.make, car.model, car.year, car.plate].filter(Boolean).join(' '))}</bdi>`)}
                ${deleted ? row('data-do="trash"', '', t('Deleted records'), this.count(deleted, '{n} record, kept for 30 days', '{n} records, kept for 30 days')) : ''}
                <a class="row" href="classic.html"><span class="row-main"><strong>${t('Classic screens')}</strong><span>${t('Car details, fuel log, trip planner, deleted records')}</span></span>
                    <span class="chev">${this.icon('chev', 'flip')}</span></a>
            </section>`;
    },

    // A toast can carry one action, such as taking back a delete
    toast(message, action) {
        const el = document.getElementById('toast');
        el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
        if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); action.run(); };
        el.classList.toggle('acts', !!action);
        el.classList.add('show');
        clearTimeout(this._toast);
        this._toast = setTimeout(() => el.classList.remove('show'), action ? 7000 : 2600);
    }
};

document.addEventListener('DOMContentLoaded', () => Next.init());
