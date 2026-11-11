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
        'Spark Plugs': 'Spark plugs', 'Timing Belt': 'Timing belt'
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
    day(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        const locale = I18N.lang === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB';
        return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
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

    init() {
        I18N.init();
        document.addEventListener('click', e => {
            const el = e.target.closest('[data-act]');
            if (!el) return;
            this.toast(t(el.dataset.act === 'later'
                ? 'This screen comes next.'
                : 'This is a preview. Use the current app to change records.'));
        });
        this.render();
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

    dockHTML() {
        const tab = (icon, label, on) => `<button type="button" ${on ? 'aria-current="page"' : 'data-act="later"'}>${this.icon(icon)}${t(label)}</button>`;
        return `<nav class="dock" aria-label="${t('Main')}">
            <div class="pill">${tab('home', 'Home', true)}${tab('hist', 'History')}${tab('car', 'Car')}</div>
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
        const proj = Storage.getProjectedMileage(car);
        const visits = this.visits(this.jobs(car));
        const read = proj.lastDate
            ? t(proj.estimated ? 'Estimated. Last read {d}.' : 'Read on {d}.', { d: this.day(proj.lastDate) })
            : t('No reading yet');

        app.innerHTML = `
            <div class="head"><span class="head-car">${esc(car.make)} ${esc(car.model)} ${esc(car.year)}</span>${back}</div>
            <div class="odo">${proj.km ? this.num(proj.km) : '—'}<small>${t('km')}</small></div>
            <div class="est"><span>${read}</span><button type="button" data-act="locked">${t('Update')}</button></div>
            ${this.roadHTML(visits)}
            ${this.nextHTML(visits)}
            <div class="tiles">${this.costTile(car)}${this.docsTile(car)}</div>
            <p class="note">${t('Preview. Nothing here changes your records.')}</p>
            ${this.dockHTML()}`;
        this.settleLabels();
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
