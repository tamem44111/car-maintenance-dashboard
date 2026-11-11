// ═══════════════════════════════════════════
// NEXT.JS — the new design, running as a read-only preview.
//
// It sits beside the current app and reads the same records through the same
// Storage and Recommendations code, so the two can never show different numbers.
// What changes here is only how those numbers are laid out.
// ═══════════════════════════════════════════

// A preview must not be able to touch the owner's records, so writing is switched
// off for this page before anything else runs. Not "we avoid calling save" — the
// page cannot write at all, whatever a later change here calls by mistake.
(function lockStorage() {
    const proto = Object.getPrototypeOf(window.localStorage);
    ['setItem', 'removeItem', 'clear'].forEach(fn => { proto[fn] = function () {}; });
    // Receipt photos are kept in a second store. The preview shows them and nothing more.
    ['put', 'remove', 'save'].forEach(fn => { Photos[fn] = () => Promise.resolve(null); });
})();

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
        chev: '<path d="M9 5l7 7-7 7"/>'
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

    SCREENS: ['home', 'history'],
    filter: '',             // History: '' for everything, a job type, or '@accident'

    init() {
        I18N.init();
        document.addEventListener('click', e => this.onClick(e));
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('viewer').classList.contains('open')) this.closePhoto();
            else this.closeSheet();
        });
        this.render();
    },

    onClick(e) {
        const el = e.target.closest('[data-go],[data-visit],[data-filter],[data-photo],[data-step],[data-close],[data-act]');
        if (!el) return;
        const d = el.dataset;
        if ('go' in d) return this.go(d.go);
        if ('visit' in d) return this.openVisit(d.visit, el);
        if ('filter' in d) return this.setFilter(d.filter);
        if ('photo' in d) return this.openPhoto(Number(d.photo));
        if ('step' in d) return this.stepPhoto(Number(d.step));
        if ('close' in d) return d.close === 'viewer' ? this.closePhoto() : this.closeSheet();
        this.toast(t(d.act === 'later'
            ? 'This screen comes next.'
            : 'This is a preview. Use the current app to change records.'));
    },

    screen() {
        const name = location.hash.slice(1);
        return this.SCREENS.includes(name) ? name : 'home';
    },

    // Tabs are places, not steps, so moving between them leaves nothing to go back
    // through. The address still changes, so reopening lands on the same screen.
    go(name) {
        history.replaceState(null, '', name === 'home' ? location.pathname + location.search : '#' + name);
        this.filter = '';
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
                    kmLeft: st.kmRemaining, daysLeft: st.daysRemaining
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

    // When a visit falls due, said the way its soonest job is counted
    when(v) {
        const j = v.jobs[0];
        if (j.status === 'overdue') {
            return j.kmFirst && j.kmLeft <= 0
                ? t('{km} km over', { km: this.num(Math.abs(j.kmLeft)) })
                : t('{d} days overdue', { d: Math.abs(j.daysLeft) });
        }
        const d = Math.max(0, j.days);
        const span = d <= 60 ? t('about {d} days', { d }) : t('about {m} months', { m: Math.round(d / 30) });
        return j.kmFirst ? t('{km} km', { km: this.num(j.kmLeft) }) + t(', ') + span : span;
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
                : v.jobs[0].kmFirst ? t('{km} km', { km: this.num(v.km) })
                : t('about {km} km', { km: this.num(Math.round(v.km / 500) * 500) });
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

    nextHTML(visits) {
        const rows = visits.slice(0, 3).map((v, i) => `
            <button type="button" class="row ${v.status}" data-act="locked">
                <span class="row-main"><strong>${esc(this.join(v.jobs.map(j => this.name(j.type))))}</strong><span>${this.when(v)}</span></span>
                ${i === 0 ? `<span class="log">${t('Log')}</span>` : `<span class="chev">${this.icon('chev', 'flip')}</span>`}
            </button>`).join('');
        return `<section class="card" aria-label="${t('Next up')}">${rows || `<p class="empty">${t('Nothing due soon')}</p>`}</section>`;
    },

    costTile(car) {
        const bd = Storage.getCostBreakdown(car.id);
        return `<button type="button" class="tile" data-act="later"><span>${t('Running cost')}</span>
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
        else if (soon) { cls = 'soon'; text = t('{name}: {d} days left', { name: soon.name, d: soon.st.days }); }
        else if (!anySet) { cls = ''; text = t('Not set'); }
        return `<button type="button" class="tile" data-act="later"><span>${t('Documents')}</span>
            <strong class="word ${cls}">${text}</strong></button>`;
    },

    dockHTML(screen) {
        const tab = (icon, label, name) => {
            const how = name === screen ? 'aria-current="page"' : name ? `data-go="${name}"` : 'data-act="later"';
            return `<button type="button" ${how}>${this.icon(icon)}${t(label)}</button>`;
        };
        return `<nav class="dock" aria-label="${t('Main')}">
            <div class="pill">${tab('home', 'Home', 'home')}${tab('hist', 'History', 'history')}${tab('car', 'Car')}</div>
            <button type="button" class="plus" data-act="locked" aria-label="${t('Log')}">${this.icon('plus')}</button>
        </nav>`;
    },

    render() {
        const app = document.getElementById('app');
        const car = Storage.getCars()[0];
        const back = `<a class="round" href="../" aria-label="${t('Back to the current app')}">${this.icon('close')}</a>`;
        if (!car) {
            app.innerHTML = `<div class="head"><span class="head-car">AutoCare</span>${back}</div>
                <p class="note">${t('No car yet. Add one in the current app.')}</p>`;
            return;
        }
        const screen = this.screen();
        app.innerHTML = (screen === 'history' ? this.historyHTML(car, back) : this.homeHTML(car, back))
            + `<p class="note">${t('Preview. Nothing here changes your records.')}</p>`
            + this.dockHTML(screen);
        if (screen === 'home') this.settleLabels();
    },

    homeHTML(car, back) {
        const proj = Storage.getProjectedMileage(car);
        const visits = this.visits(this.jobs(car));
        const read = proj.lastDate
            ? t(proj.estimated ? 'Estimated. Last read {d}.' : 'Read on {d}.', { d: this.day(proj.lastDate) })
            : t('No reading yet');
        return `
            <div class="head"><span class="head-car">${esc(car.make)} ${esc(car.model)} ${esc(car.year)}</span>${back}</div>
            <div class="odo">${proj.km ? this.num(proj.km) : '—'}<small>${t('km')}</small></div>
            <div class="est"><span>${read}</span><button type="button" data-act="locked">${t('Update')}</button></div>
            ${this.roadHTML(visits)}
            ${this.nextHTML(visits)}
            <div class="tiles">${this.costTile(car)}${this.docsTile(car)}</div>`;
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
        return !this.filter || (this.filter === '@accident' ? !!s.accident : s.type === this.filter);
    },

    // With a job picked, each visit shows that job alone: when it was done and what
    // it cost. The full visit is still one tap away.
    shownVisits(car) {
        return this.pastVisits(car)
            .map(v => this.filter ? this.sumVisit(v.date, v.records.filter(s => this.matches(s))) : v)
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
        this.shownVisits(car).forEach(v => {
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

    historyHTML(car, back) {
        const visits = this.pastVisits(car);
        const head = `<div class="head"><h1 class="title">${t('History')}</h1>${back}</div>`;
        if (!visits.length) return `${head}<p class="lede">${t('Nothing logged yet. Your first service will appear here.')}</p>`;
        const since = this.date(visits[visits.length - 1].date, { month: 'short', year: 'numeric' });
        return `${head}
            <p class="lede">${t('{visits} since {d}', { visits: this.count(visits.length, '{n} visit', '{n} visits'), d: since })}</p>
            ${this.chipsHTML(car)}
            <div id="hist-list">${this.historyList(car)}</div>`;
    },

    setFilter(key) {
        this.filter = key;
        document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === key)));
        document.getElementById('hist-list').innerHTML = this.historyList(Storage.getCars()[0]);
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
            <li><span><span dir="auto">${esc(b.label || t(b.kind || 'Other'))}</span><small dir="auto">${esc([b.label ? t(b.kind || 'Other') : '', b.vendor].filter(Boolean).join(t(', ')))}</small></span>
                <span class="amt">${this.money(b.amount, true)}</span></li>`).join('') : '';

        return `<div class="job">
            <div class="job-top"><strong>${esc(this.name(s.type))}</strong>${cost > 0 ? `<span class="amt">${this.money(cost, true)}</span>` : ''}</div>
            ${tags.length ? `<p class="tags">${this.list(tags)}</p>` : ''}
            ${s.notes ? `<p class="job-note" dir="auto">${esc(s.notes)}</p>` : ''}
            ${lines ? `<ul class="bills">${lines}</ul>` : ''}
        </div>`;
    },

    sheetHTML(v) {
        const thumbs = v.photos.map((id, i) => `<button type="button" class="thumb" data-photo="${i}" aria-label="${t('Receipt {n}', { n: i + 1 })}"><img alt="" data-thumb="${esc(id)}"></button>`).join('');
        const line = (label, amount) => `<div class="sum"><span>${t(label)}</span><strong>${this.money(amount, true)}</strong></div>`;
        const totals = v.insured ? line('Insurance paid', v.insured) + line('You paid', v.paid)
            : v.paid > 0 ? line('Total', v.paid) : '';
        return `<div class="scrim" data-close="sheet"></div>
            <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
                <div class="sheet-head">
                    <div><h2 id="sheet-title">${this.date(v.date, { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                        ${v.km ? `<p>${t('{km} km', { km: this.num(v.km) })}</p>` : ''}</div>
                    <button type="button" class="round" data-close="sheet" aria-label="${t('Close')}">${this.icon('close')}</button>
                </div>
                <div class="card">${v.records.map(s => this.jobHTML(s)).join('')}</div>
                ${thumbs ? `<div class="card"><h2>${t('Receipts')}</h2><div class="thumbs">${thumbs}</div></div>` : ''}
                ${totals ? `<div class="card sums">${totals}</div>` : ''}
                <button type="button" class="quiet" data-act="locked">${t('Edit')}</button>
            </section>`;
    },

    openVisit(date, opener) {
        const v = this.pastVisits(Storage.getCars()[0]).find(x => x.date === date);
        if (!v) return;
        this._opener = opener || null;
        this._photos = v.photos;
        const host = document.getElementById('sheet');
        host.innerHTML = this.sheetHTML(v);
        host.classList.add('open');
        document.body.classList.add('locked');
        document.getElementById('app').inert = true;
        host.querySelector('button[data-close]').focus();
        // Receipts live in the phone's photo store and arrive a moment after the text
        host.querySelectorAll('img[data-thumb]').forEach(img => {
            const gone = () => img.closest('.thumb').classList.add('missing');
            Photos.get(img.dataset.thumb).then(url => { if (url) img.src = url; else gone(); }).catch(gone);
        });
    },

    closeSheet() {
        const host = document.getElementById('sheet');
        if (!host.classList.contains('open')) return;
        host.classList.remove('open');
        host.innerHTML = '';
        document.body.classList.remove('locked');
        document.getElementById('app').inert = false;
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

    toast(message) {
        const el = document.getElementById('toast');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(this._toast);
        this._toast = setTimeout(() => el.classList.remove('show'), 2600);
    }
};

document.addEventListener('DOMContentLoaded', () => Next.init());
