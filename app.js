const App = {
    currentPage: 'dashboard',
    selectedCarId: 'all',

    init() {
        if (typeof I18N !== 'undefined') { I18N.init(); I18N.translateDOM(); }
        this.bindLanguage();
        this.bindNavigation();
        this.bindModal();
        this.bindCarSelector();
        this.initTheme();
        this.navigate('dashboard');
    },

    // ── Theme ──
    initTheme() {
        const saved = localStorage.getItem('autocare_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('autocare_theme', next);
        });
    },

    // ── Language ──
    bindLanguage() {
        const paint = () => document.querySelectorAll('.lang-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.lang === I18N.lang));
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.lang === I18N.lang) return;
                I18N.set(btn.dataset.lang);
                I18N.translateDOM();
                paint();
                this.renderPage(this.currentPage);
                this.navigate(this.currentPage);
            });
        });
        paint();
    },

    // ── Navigation ──
    bindNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => { e.preventDefault(); this.navigate(link.dataset.page); });
        });
    },

    navigate(page) {
        this.currentPage = page;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.nav-link[data-page="${page}"]`).classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');

        const titles = { dashboard:'Dashboard', cars:'My Cars', services:'Services', fuel:'Fuel Log', expenses:'Expenses', warranty:'Warranty Center', reminders:'Reminders' };
        document.getElementById('page-title').textContent = t(titles[page]);

        const addBtn = document.getElementById('add-btn');
        if (page === 'dashboard' || page === 'warranty') { addBtn.style.display = 'none'; }
        else {
            addBtn.style.display = 'block';
            const labels = { cars:'+ Add Car', services:'+ Add Service', fuel:'+ Add Fuel', expenses:'+ Add Expense', reminders:'+ Add Reminder' };
            addBtn.textContent = t(labels[page]);
            addBtn.onclick = () => this.openAddModal(page);
        }
        this.renderPage(page);
    },

    renderPage(page) {
        switch(page) {
            case 'dashboard': this.renderDashboard(); break;
            case 'cars': this.renderCars(); break;
            case 'services': this.renderServices(); break;
            case 'fuel': this.renderFuel(); break;
            case 'expenses': this.renderExpenses(); break;
            case 'warranty': Features.renderWarrantyCenter(); break;
            case 'reminders': this.renderReminders(); break;
        }
        this.updateCarSelector();
    },

    // ── Car Selector ──
    bindCarSelector() {
        document.getElementById('car-selector').addEventListener('change', (e) => { this.selectedCarId = e.target.value; this.renderPage(this.currentPage); });
    },
    updateCarSelector() {
        const sel = document.getElementById('car-selector');
        const cars = Storage.getCars();
        sel.style.display = cars.length > 1 ? '' : 'none';
        sel.innerHTML = '<option value="all">' + t('All Cars') + '</option>' + cars.map(c => `<option value="${c.id}" ${c.id===this.selectedCarId?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('');
    },

    // ── Modal ──
    bindModal() {
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modal').addEventListener('click', (e) => { if (e.target === document.getElementById('modal')) this.closeModal(); });
    },
    openModal(title, bodyHTML, onSave) {
        document.getElementById('modal-save').style.display = '';
        document.getElementById('modal-title').textContent = t(title);
        document.getElementById('modal-body').innerHTML = bodyHTML;
        document.getElementById('modal').style.display = 'flex';
        document.getElementById('modal-save').onclick = onSave;
    },
    closeModal() { document.getElementById('modal').style.display = 'none'; },

    openAddModal(page) {
        switch(page) {
            case 'cars': this.openCarModal(); break;
            case 'services': this.openServiceModal(); break;
            case 'fuel': this.openFuelModal(); break;
            case 'expenses': this.openServiceModal(); break;
            case 'reminders': this.openReminderModal(); break;
        }
    },

    // ── Car Modal ──
    openCarModal(car = null) {
        const html = `
            <div class="form-group"><label>Make</label><input type="text" id="f-make" placeholder="e.g. Toyota" value="${car?car.make:''}"></div>
            <div class="form-row">
                <div class="form-group"><label>Model</label><input type="text" id="f-model" placeholder="e.g. Camry" value="${car?car.model:''}"></div>
                <div class="form-group"><label>Year</label><input type="number" id="f-year" placeholder="2022" value="${car?car.year:''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Current Mileage (km)</label><input type="number" id="f-mileage" placeholder="50000" value="${car?car.mileage:''}"></div>
                <div class="form-group"><label>License Plate</label><input type="text" id="f-plate" placeholder="ABC 1234" value="${car?car.plate:''}"></div>
            </div>
            <div class="form-group"><label>Color</label><input type="text" id="f-color" placeholder="Silver" value="${car?car.color:''}"></div>
            <div class="form-row">
                <div class="form-group"><label>Insurance Expiry</label><input type="date" id="f-insurance" value="${car?car.insuranceExpiry||'':''}"></div>
                <div class="form-group"><label>Registration (Istimara) Expiry</label><input type="date" id="f-registration" value="${car?car.registrationExpiry||'':''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Fahes (Inspection) Expiry</label><input type="date" id="f-fahes" value="${car?car.fahesExpiry||'':''}"><small class="field-note">Istimara renewal needs a valid Fahes and insurance.</small></div>
                <div class="form-group"><label>Manufacturer Warranty Until</label><input type="date" id="f-warranty" value="${car?car.warrantyExpiry||'':''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Timing Belt or Chain</label>
                    <select id="f-timing">
                        <option value="" ${!car||!car.timingType?'selected':''}>Not sure / skip</option>
                        <option value="belt" ${car&&car.timingType==='belt'?'selected':''}>Belt — needs replacing</option>
                        <option value="chain" ${car&&car.timingType==='chain'?'selected':''}>Chain — normally lifetime</option>
                    </select>
                    <small class="field-note">A snapped belt can destroy the engine. Only belts are scheduled.</small>
                </div>
                <div class="form-group"><label>Market Value (SAR)</label><input type="number" id="f-value" placeholder="e.g. 25000" value="${car?car.marketValue||'':''}"><small class="field-note">Roughly what it would sell for — powers the keep-or-sell view.</small></div>
            </div>
            <div class="form-group"><label>Recall / Safety Notes</label><textarea id="f-recall" rows="2" placeholder="e.g. Open recall: airbag inflator — book at dealer">${car?car.recallNotes||'':''}</textarea></div>`;
        this.openModal(car?'Edit Car':'Add Car', html, () => {
            const data = {
                make: document.getElementById('f-make').value.trim(),
                model: document.getElementById('f-model').value.trim(),
                year: document.getElementById('f-year').value.trim(),
                mileage: document.getElementById('f-mileage').value.trim(),
                plate: document.getElementById('f-plate').value.trim(),
                color: document.getElementById('f-color').value.trim(),
                insuranceExpiry: document.getElementById('f-insurance').value,
                registrationExpiry: document.getElementById('f-registration').value,
                warrantyExpiry: document.getElementById('f-warranty').value,
                fahesExpiry: document.getElementById('f-fahes').value,
                timingType: document.getElementById('f-timing').value,
                marketValue: document.getElementById('f-value').value.trim(),
                recallNotes: document.getElementById('f-recall').value.trim(),
            };
            if (!data.make || !data.model || !data.year) return alert('Please fill in make, model, and year.');
            const saved = car ? Storage.updateCar(car.id, data) : Storage.addCar(data);
            if (saved && saved.id) Storage.syncDocumentReminders(saved.id);
            this.closeModal(); this.renderPage(this.currentPage);
        });
    },

    // Log a recurring job again in two taps: pick the type, everything else is
    // carried over from last time with today's date and the current odometer.
    openRepeatPicker() {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const cid = this.selectedCarId !== 'all' ? this.selectedCarId : cars[0].id;
        const seen = {};
        Storage.getServices(cid)
            .slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach(s => { if (!seen[s.type]) seen[s.type] = s; });
        const recent = Object.values(seen).slice(0, 8);
        if (!recent.length) return this.openServiceModal(null, cid);
        const car = cars.find(c => c.id === cid);
        const km = Storage.getEffectiveMileage(car);
        const html = `<p class="odo-intro">Pick a job you've done before. It opens pre-filled with today's date and ${km ? km.toLocaleString() + ' km' : 'the current reading'} — change anything before saving.</p>
            <div class="repeat-list">${recent.map(s => {
                const since = km && s.mileage ? km - parseInt(s.mileage) : null;
                return `<button type="button" class="repeat-row" onclick="App.repeatService('${s.id}')">
                    <span class="repeat-type">${I18N.t(s.type)}</span>
                    <span class="repeat-meta">last ${s.date}${since && since > 0 ? ' · ' + since.toLocaleString() + ' km ago' : ''}${Storage.getServiceCost(s) ? ' · ' + Storage.getServiceCost(s).toFixed(0) + ' SAR' : ''}</span>
                </button>`;
            }).join('')}</div>`;
        this.openModal('Repeat a Service', html, () => this.closeModal());
        setTimeout(() => { const f = document.getElementById('modal-save'); if (f) f.style.display = 'none'; }, 20);
    },

    repeatService(id) {
        const prev = Storage.getServices('all').find(s => s.id === id);
        if (!prev) return;
        this.closeModal();
        document.getElementById('modal-save').style.display = '';
        setTimeout(() => {
            this.openServiceModal(null, prev.carId, prev.type);
            setTimeout(() => {
                const cost = document.getElementById('f-cost');
                if (cost && !cost.readOnly && !cost.value) cost.value = Storage.getServiceCost(prev) || '';
            }, 80);
        }, 60);
    },

    // ── Service Modal ──
    openServiceModal(service = null, presetCarId = null, presetType = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const types = Recommendations.logTypes();
        const isEdit = !!service;
        const isOil = service && service.type === 'Oil Change';
        const chips = isEdit ? '' : this._serviceChips(cars.find(c => c.id === (presetCarId || (this.selectedCarId !== 'all' ? this.selectedCarId : (cars[0] && cars[0].id)))), presetType);
        // Fall back to the car currently filtered, else the first one, so the odometer
        // can always be pre-filled instead of being typed by hand.
        const selCar = service ? service.carId
            : (presetCarId || (this.selectedCarId !== 'all' ? this.selectedCarId : (cars[0] && cars[0].id)) || '');
        const html = `
            <div class="form-group"><label>${t('Car')}</label><select id="f-car" onchange="App._syncServiceMileage()">${cars.map(c=>`<option value="${c.id}" ${selCar===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-group"><label>${t(isEdit?'Service Type':'Services Performed (select all that apply)')}</label>
                ${isEdit?`<select id="f-type" onchange="App._toggleServiceExtras()">${types.map(t=>`<option value="${t}" ${service.type===t?'selected':''}>${I18N.t(t)}</option>`).join('')}</select>`:`<div class="svc-picker">${chips}</div>`}
            </div>
            <div id="oil-options" style="display:${isOil||presetType==='Oil Change'?'block':'none'}">
                <div class="form-group"><label>${t('Oil Type (next change interval)')}</label>
                    <div class="oil-interval-group">
                        <label class="oil-option"><input type="radio" name="oil-interval" value="5000" ${!service||!service.oilInterval||service.oilInterval==='5000'?'checked':''}><span class="oil-option-card"><strong>5,000 km</strong><small>${t('Regular')}</small></span></label>
                        <label class="oil-option"><input type="radio" name="oil-interval" value="7000" ${service&&service.oilInterval==='7000'?'checked':''}><span class="oil-option-card"><strong>7,000 km</strong><small>${t('Semi-synthetic')}</small></span></label>
                        <label class="oil-option"><input type="radio" name="oil-interval" value="10000" ${service&&service.oilInterval==='10000'?'checked':''}><span class="oil-option-card"><strong>10,000 km</strong><small>${t('Full synthetic')}</small></span></label>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>${t('Date')}</label><input type="date" id="f-date" value="${service?service.date:new Date().toISOString().split('T')[0]}" onchange="App._toggleServiceExtras()"></div>
                <div class="form-group"><label>${t('Total Cost (SAR)')}</label><input type="number" id="f-cost" placeholder="0.00" step="0.01" value="${service?service.cost:''}"><small id="cost-note" class="field-note"></small></div>
            </div>
            <div id="inspection-options" style="display:none">
                <div class="form-row">
                    <div class="form-group"><label>${t('Result')}</label>
                        <select id="f-insp-result" onchange="App._toggleServiceExtras()">
                            <option value="pass" ${service&&service.inspectionResult==='pass'?'selected':''}>${t('Passed')}</option>
                            <option value="advisory" ${service&&service.inspectionResult==='advisory'?'selected':''}>${t('Passed with advisories')}</option>
                            <option value="fail" ${service&&service.inspectionResult==='fail'?'selected':''}>${t('Failed')}</option>
                        </select>
                    </div>
                    <div class="form-group"><label>${t('Inspection centre')}</label>
                        <select id="f-insp-centre"><option value="">${t('Not recorded')}</option>${Features.INSPECTION_CENTRES.map(c=>`<option value="${c}" ${service&&service.inspectionCenter===c?'selected':''}>${t(c)}</option>`).join('')}</select>
                    </div>
                </div>
                <div class="form-group" id="f-insp-expiry-wrap"><label>${t('Certificate expires')}</label><input type="date" id="f-insp-expiry" data-auto="${service&&service.inspectionExpiry?'0':'1'}" value="${service&&service.inspectionExpiry?service.inspectionExpiry:''}" oninput="this.dataset.auto='0'"><small class="field-note">${t('Suggested a year after the date above — edit it if your certificate says otherwise.')}</small></div>
                <div class="derived" id="f-insp-derived"></div>
            </div>
            <div id="brake-options" style="display:none">
                <div class="form-group"><label>${t('Brake Pad Thickness (mm)')}</label><input type="number" id="f-pad" step="0.5" placeholder="${t('e.g. 7')}" value="${service&&service.padThickness?service.padThickness:''}"><small class="field-note">${t('New pads are about 10-12 mm; replace at 3 mm. Logging this predicts wear far better than a fixed interval.')}</small></div>
            </div>
            <div class="form-group"><label>${t('Mileage at Service (km)')}</label><input type="number" id="f-smileage" placeholder="50000" value="${service?service.mileage:(selCar?Storage.getEffectiveMileage(cars.find(c=>c.id===selCar)||{})||'':'')}"><small id="smileage-note" class="field-note"></small></div>
            ${Features.renderBillsEditor(service?service.bills:[])}
            <div class="form-group"><label>${t('Notes')}</label><textarea id="f-notes" rows="2" placeholder="${t('Optional...')}">${service?service.notes||'':''}</textarea></div>`;
        this.openModal(isEdit?'Edit Service':'Add Service', html, () => {
            const carId=document.getElementById('f-car').value, date=document.getElementById('f-date').value, cost=document.getElementById('f-cost').value, mileage=document.getElementById('f-smileage').value, notes=document.getElementById('f-notes').value.trim();
            if(!date) return alert(t('Please select a date.'));
            const car = Storage.getCars().find(c=>c.id===carId);
            const bills = Features.collectBills(mileage);
            const padEl=document.getElementById('f-pad');
            const padThickness=padEl?padEl.value.trim():'';
            const inspEl=document.getElementById('f-insp-result');
            const inspExpEl = document.getElementById('f-insp-expiry');
            const insp = inspEl ? {
                inspectionResult: inspEl.value,
                // whatever the certificate says; a failure earns no certificate at all
                inspectionExpiry: inspEl.value === 'fail' ? ''
                    : ((inspExpEl && inspExpEl.value) || Features.certificateExpiry(date)),
                inspectionCenter: document.getElementById('f-insp-centre').value
            } : {};
            if(isEdit){
                const editType=document.getElementById('f-type').value;
                const dupe=Storage.findDuplicateService({carId,type:editType,date,mileage},service.id);
                if(dupe && !confirm(`Another ${editType} record already exists for this car on ${date} at the same mileage.\n\nSave anyway?`)) return;
                const data={carId,type:editType,date,cost,mileage,notes,bills,padThickness,
                    ...(Recommendations.isInspectionType(editType)?insp:{})};
                if(data.type==='Oil Change') this._handleOilReminder(data);
                else if(mileage&&car) Recommendations.createReminderFromService(car,data.type,mileage,date);
                Storage.updateService(service.id,data);
            } else {
                // A due type appears twice — in the pinned row and in its group — so the
                // same job would otherwise be filed twice.
                const selected=[...new Set([...document.querySelectorAll('.service-chips input:checked')].map(cb=>cb.value))];
                if(!selected.length) return alert(t('Select at least one service.'));
                // With bills the total is already itemised, so it attaches to the first
                // service only — splitting it again would double-count. Without bills the
                // typed cost is shared evenly across the selected services as before.
                const cps=(!bills.length&&selected.length>1)?(parseFloat(cost)/selected.length).toFixed(2):cost;
                // Guard against the same job being logged twice by a double-tap
                const dupes=selected.filter(type=>Storage.findDuplicateService({carId,type,date,mileage}));
                if(dupes.length){
                    const list=dupes.join(', ');
                    if(!confirm(`You already have a record for ${list} on ${date} at this mileage.\n\nAdd it again anyway?`)) return;
                }
                // Logging a timing belt tells us the engine is belt-driven, which is what
                // the schedule needs in order to stop ignoring it.
                if(selected.includes('Timing Belt')&&car&&!car.timingType) Storage.updateCar(carId,{timingType:'belt'});
                selected.forEach((type,i)=>{
                    const data={carId,type,date,mileage,notes,padThickness,
                        cost: bills.length ? (i===0?cost:'0') : cps,
                        bills: (bills.length&&i===0) ? bills : [],
                        ...(Recommendations.isInspectionType(type)?insp:{})};
                    if(type==='Oil Change') this._handleOilReminder(data);
                    else if(mileage&&car) Recommendations.createReminderFromService(car,type,mileage,date);
                    Storage.addService(data);
                });
            }
            this._applyInspection(carId, insp, date);
            Features.cleanupPhotos();
            this.closeModal(); this.renderPage(this.currentPage);
        });
        // Lock/unlock the cost field to match whether bills are present, and
        // label where the pre-filled odometer came from
        setTimeout(() => { Features.recalcBillTotal(); this._syncServiceMileage(isEdit); this._toggleServiceExtras(); }, 40);
    },

    // A logged inspection is the authority on when the certificate expires, so it
    // updates the car's Fahes date. A failure means a re-test is owed, not a
    // year of cover, so that instead becomes a reminder.
    _applyInspection(carId, insp, serviceDate) {
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

    _paintInspectionDerived() {
        const box = document.getElementById('f-insp-derived');
        if (!box) return;
        const failed = (document.getElementById('f-insp-result') || {}).value === 'fail';
        const date = (document.getElementById('f-date') || {}).value;
        const exp = document.getElementById('f-insp-expiry');
        const wrap = document.getElementById('f-insp-expiry-wrap');
        // A failure earns no certificate, so there is no expiry to ask for
        if (wrap) wrap.style.display = failed ? 'none' : '';
        if (failed) {
            box.style.display = '';
            box.className = 'derived derived-warn';
            box.innerHTML = `<span class="derived-label">${t('Certificate')}</span><span class="derived-value">${t('None — a re-test is due in 30 days')}</span>`;
            return;
        }
        box.style.display = 'none';
        box.innerHTML = '';
        // Keep suggesting a year out until the owner types their own date
        if (exp && exp.dataset.auto === '1') exp.value = Features.certificateExpiry(date) || '';
    },

    // Show the oil-interval / brake-pad extras only for the service types they belong to
    _toggleServiceExtras() {
        const sel = document.getElementById('f-type');
        const picked = sel
            ? [sel.value]
            : [...new Set([...document.querySelectorAll('.service-chips input:checked')].map(c => c.value))];
        const oil = document.getElementById('oil-options');
        const brake = document.getElementById('brake-options');
        if (oil) oil.style.display = picked.includes('Oil Change') ? 'block' : 'none';
        if (brake) brake.style.display = picked.some(t => Recommendations.isBrakeType(t)) ? 'block' : 'none';
        const insp = document.getElementById('inspection-options');
        if (insp) {
            const on = picked.some(t => Recommendations.isInspectionType(t));
            insp.style.display = on ? 'block' : 'none';
            if (on) this._paintInspectionDerived();
        }
        this._paintBeltNote(picked);
    },

    // Timing Belt is offered to everyone, but the schedule ignores it until the car
    // says belt or chain. Rather than ask, say plainly what saving will record.
    _paintBeltNote(picked) {
        const note = document.getElementById('svc-belt-note');
        if (!note) return;
        const sel = document.getElementById('f-car');
        const car = sel ? Storage.getCars().find(c => c.id === sel.value) : null;
        const needed = picked.includes('Timing Belt') && car && !car.timingType;
        note.style.display = needed ? 'block' : 'none';
        if (needed) note.textContent = t('Saving this records the car as belt-driven, so timing belt reminders start working.');
    },

    // The picker: what the car owes pinned on top, then every type grouped by system.
    // Grouping and order are display only — the values are data keys, so none of this
    // touches stored history.
    _serviceChips(car, presetType) {
        const chip = (type, prefix, label) => {
            const id = 'svc-' + (prefix || '') + type.toLowerCase().replace(/\s+/g, '-');
            return `<label class="service-chip"><input type="checkbox" id="${id}" value="${type}" ${presetType === type ? 'checked' : ''} onchange="App._syncChip(this)"><span class="service-chip-label">${label || I18N.t(type)}</span></label>`;
        };
        let html = '';
        const due = car ? Recommendations.dueTypes(car) : [];
        if (due.length) {
            html += `<div class="svc-due"><div class="svc-due-head">${t('Due on your {car}', { car: car.make + ' ' + car.model })}</div><div class="service-chips">${
                due.map(st => chip(st.type, 'due-',
                    `<span class="svc-dot ${st.status === 'overdue' ? 'svc-dot-red' : 'svc-dot-amber'}"></span>${I18N.t(st.type)}<span class="svc-tag">${st.detail}</span>`)).join('')
            }</div></div>`;
        }
        html += Recommendations.GROUPS.map(([group, types]) =>
            `<div class="svc-group"><div class="svc-group-head">${t(group)}</div><div class="service-chips">${types.map(ty => chip(ty)).join('')}</div></div>`).join('');
        return html + `<div id="svc-belt-note" class="field-note" style="display:none"></div>`;
    },

    // A due type has two checkboxes — one in the pinned row, one in its group.
    // Keep them in step so ticking either reads correctly in both places.
    _syncChip(el) {
        document.querySelectorAll('.service-chips input[type="checkbox"]').forEach(i => {
            if (i.value === el.value && i !== el) i.checked = el.checked;
        });
        this._toggleServiceExtras();
    },

    // Pre-fill "Mileage at Service" from the selected car's current reading
    _syncServiceMileage(keepExisting) {
        const sel = document.getElementById('f-car');
        const field = document.getElementById('f-smileage');
        const note = document.getElementById('smileage-note');
        if (!sel || !field) return;
        const car = Storage.getCars().find(c => c.id === sel.value);
        if (!car) return;
        const proj = Storage.getProjectedMileage(car);
        if (!keepExisting) field.value = proj.km || '';
        if (!note) return;
        if (!proj.km) note.textContent = t('No odometer reading yet - type the reading from the dashboard.');
        else if (proj.estimated) note.textContent = t('Estimated from {km} km on {d} - edit if you know the exact reading.', {km: proj.lastKm.toLocaleString(), d: proj.lastDate});
        else note.textContent = t('Your latest confirmed odometer reading - edit if needed.');
    },

    _handleOilReminder(data) {
        const interval=document.querySelector('input[name="oil-interval"]:checked');
        data.oilInterval=interval?interval.value:'5000';
        if(data.mileage){
            const next=parseInt(data.mileage)+parseInt(data.oilInterval);
            Storage.getReminders(data.carId).filter(r=>r.type==='Oil Change'&&!r.completed&&r.autoCreated).forEach(r=>Storage.deleteReminder(r.id));
            const labels={'5000':'Regular','7000':'Semi-synthetic','10000':'Full synthetic'};
            Storage.addReminder({carId:data.carId,type:'Oil Change',dueDate:this._estDate(data.date,data.oilInterval),dueMileage:next.toString(),notes:`Auto: next oil change at ${next.toLocaleString()} km (${labels[data.oilInterval]})`,completed:false,autoCreated:true});
        }
    },
    _estDate(d,interval){ const avg=40,days=Math.round(parseInt(interval)/avg),dt=new Date(d); dt.setDate(dt.getDate()+days); return dt.toISOString().split('T')[0]; },

    // ── Fuel Modal ──
    openFuelModal(log = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const html = `
            <div class="form-group"><label>${t('Car')}</label><select id="f-car">${cars.map(c=>`<option value="${c.id}" ${log&&log.carId===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>${t('Date')}</label><input type="date" id="f-date" value="${log?log.date:new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>${t('Odometer (km)')}</label><input type="number" id="f-odo" placeholder="50000" value="${log?log.odometer:''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>${t('Liters')}</label><input type="number" id="f-liters" placeholder="45" step="0.1" value="${log?log.liters:''}"></div>
                <div class="form-group"><label>${t('Price/Liter (SAR)')}</label><input type="number" id="f-ppl" placeholder="2.18" step="0.01" value="${log?log.pricePerLiter:''}"></div>
            </div>
            <div class="form-group"><label>${t('Total Cost (SAR)')}</label><input type="number" id="f-ftotal" placeholder="${t('Auto-calculated')}" step="0.01" value="${log?log.totalCost:''}"></div>
            <div class="form-group"><label>${t('Station')}</label><input type="text" id="f-station" placeholder="${t('Optional')}" value="${log?log.station||'':''}"></div>`;
        this.openModal(log?'Edit Fuel Log':'Add Fuel Log', html, () => {
            const liters=parseFloat(document.getElementById('f-liters').value)||0;
            const ppl=parseFloat(document.getElementById('f-ppl').value)||0;
            let total=parseFloat(document.getElementById('f-ftotal').value)||0;
            if(!total&&liters&&ppl) total=liters*ppl;
            const data={carId:document.getElementById('f-car').value,date:document.getElementById('f-date').value,odometer:document.getElementById('f-odo').value,liters:liters.toString(),pricePerLiter:ppl.toString(),totalCost:total.toFixed(2),station:document.getElementById('f-station').value.trim()};
            if(!data.date||!data.odometer) return alert(t('Date and odometer are required.'));
            if(log) Storage.updateFuelLog(log.id,data); else Storage.addFuelLog(data);
            this.closeModal(); this.renderPage(this.currentPage);
        });
        // Auto-calc total
        setTimeout(()=>{
            const calc=()=>{const l=parseFloat(document.getElementById('f-liters')?.value)||0,p=parseFloat(document.getElementById('f-ppl')?.value)||0;if(l&&p)document.getElementById('f-ftotal').value=(l*p).toFixed(2);};
            document.getElementById('f-liters')?.addEventListener('input',calc);
            document.getElementById('f-ppl')?.addEventListener('input',calc);
        },50);
    },

    // ── Reminder Modal ──
    openReminderModal(reminder = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert(t('Please add a car first.'));
        const types = ['Oil Change','Tire Rotation','Brake Inspection','Air Filter','Registration Renewal','Insurance Renewal','Inspection','Other'];
        const html = `
            <div class="form-group"><label>${t('Car')}</label><select id="f-car">${cars.map(c=>`<option value="${c.id}" ${reminder&&reminder.carId===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-group"><label>${t('Reminder For')}</label><select id="f-type">${types.map(t=>`<option value="${t}" ${reminder&&reminder.type===t?'selected':''}>${I18N.t(t)}</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>${t('Due Date')}</label><input type="date" id="f-duedate" value="${reminder?reminder.dueDate:''}"></div>
                <div class="form-group"><label>${t('Due Mileage (km)')}</label><input type="number" id="f-duemileage" placeholder="${t('Optional')}" value="${reminder?reminder.dueMileage||'':''}"></div>
            </div>
            <div class="form-group"><label>${t('Notes')}</label><textarea id="f-rnotes" rows="2" placeholder="${t('Optional...')}">${reminder?reminder.notes||'':''}</textarea></div>`;
        this.openModal(reminder?'Edit Reminder':'Add Reminder', html, () => {
            const data={carId:document.getElementById('f-car').value,type:document.getElementById('f-type').value,dueDate:document.getElementById('f-duedate').value,dueMileage:document.getElementById('f-duemileage').value,notes:document.getElementById('f-rnotes').value.trim(),completed:reminder?reminder.completed:false};
            if(!data.dueDate) return alert(t('Please select a due date.'));
            if(reminder) Storage.updateReminder(reminder.id,data); else Storage.addReminder(data);
            this.closeModal(); this.renderPage(this.currentPage);
        });
    },

    openCustomRecModal(carId) {
        const car=Storage.getCars().find(c=>c.id===carId);
        if(!car)return;
        const types=Recommendations.logTypes();
        const html=`<p style="font-size:12px;color:var(--text3);margin-bottom:14px">Custom interval for <strong>${car.make} ${car.model}</strong>. Overrides manufacturer data.</p>
            <div class="form-group"><label>Service Type</label><select id="f-rec-type">${types.map(t=>`<option value="${t}">${I18N.t(t)}</option>`).join('')}</select></div>
            <div class="form-row"><div class="form-group"><label>Interval (km)</label><input type="number" id="f-rec-km" placeholder="15000"></div><div class="form-group"><label>Interval (months)</label><input type="number" id="f-rec-months" placeholder="12"></div></div>
            <div class="form-group"><label>Note</label><input type="text" id="f-rec-note" placeholder="Per dealer recommendation"></div>`;
        this.openModal('Custom Maintenance Schedule',html,()=>{
            const km=parseInt(document.getElementById('f-rec-km').value),months=parseInt(document.getElementById('f-rec-months').value)||12,note=document.getElementById('f-rec-note').value.trim()||'Custom';
            if(!km||km<=0) return alert('Enter a valid km interval.');
            Recommendations.saveCustom(carId,document.getElementById('f-rec-type').value,km,months,note);
            this.closeModal(); this.renderPage(this.currentPage);
        });
    },

    // ── Render: Dashboard ──
    renderDashboard() {
        const cid=this.selectedCarId, cars=Storage.getCars(), services=Storage.getServices(cid), reminders=Storage.getUpcomingReminders(cid), total=Storage.getTotalExpenses(cid);
        document.getElementById('stat-cars').textContent=cars.length;
        document.getElementById('stat-services').textContent=services.length;
        document.getElementById('stat-reminders').textContent=reminders.length;

        // Total spent with month-over-month trend
        const trend=Storage.getSpendTrend(cid);
        let trendHTML='';
        if(trend.pct!==null){
            const up=trend.pct>0, flat=trend.pct===0;
            const arrow=flat?'→':(up?'▲':'▼');
            const tClass=flat?'trend-flat':(up?'trend-up':'trend-down');
            trendHTML=`<span class="stat-trend ${tClass}"><bdi>${arrow} ${Math.abs(trend.pct)}%</bdi> ${t('vs last mo.')}</span>`;
        }
        const expEl=document.getElementById('stat-expenses');
        expEl.innerHTML=total.toFixed(0)+' SAR';
        const expInfo=expEl.parentElement;
        let existingTrend=expInfo.querySelector('.stat-trend');
        if(existingTrend) existingTrend.remove();
        if(trendHTML) expInfo.insertAdjacentHTML('beforeend',trendHTML);

        // Action Center & forecast
        if (typeof Features !== 'undefined') {
            Features.renderDocuments(cid);
            Features.renderActionCenter(cid);
            Features.renderForecast(cid);
        }

        // Health cards
        const healthEl=document.getElementById('car-health-section');
        if(cars.length){
            healthEl.innerHTML=cars.map(c=>{
                const h=Storage.getCarHealthScore(c);
                const circ=2*Math.PI*28;
                const offset=circ-(h.score/100)*circ;
                const svcCount=Storage.getServices(c.id).length;
                const overdueC=Storage.getUpcomingReminders(c.id).filter(r=>new Date(r.dueDate)<new Date()).length;
                return `<div class="health-card">
                    <div class="health-ring"><svg width="70" height="70" viewBox="0 0 64 64"><circle class="health-ring-bg" cx="32" cy="32" r="28"/><circle class="health-ring-fg ${h.color}" cx="32" cy="32" r="28" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg><div class="health-score">${h.score}</div></div>
                    <div class="health-info"><div class="health-car-name">${c.make} ${c.model}</div><div class="health-car-year"><bdi>${c.year}</bdi> &middot; <bdi>${(()=>{const p=Storage.getProjectedMileage(c);return p.km?(p.estimated?'~':'')+p.km.toLocaleString()+' km':'-';})()}</bdi></div><span class="health-label ${h.color}">${t(h.label)}</span><div class="health-details">${t('{n} services',{n:svcCount})}${overdueC?` &middot; <span style="color:var(--red)">${t('{n} overdue',{n:overdueC})}</span>`:''}</div></div>
                </div>`;
            }).join('');
        } else { healthEl.innerHTML=''; }

        // Quick actions & analytics
        if (typeof Features !== 'undefined') {
            Features.renderQuickActions();
            Features.renderAnalytics(cid);
            Features.scheduleNotifications();
        }

        // Recent services
        const recentEl=document.getElementById('recent-services');
        const recent=services.sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
        recentEl.innerHTML=recent.length?recent.map(s=>{const car=cars.find(c=>c.id===s.carId);return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><div><strong style="font-size:13px">${I18N.t(s.type)}</strong><br><small style="color:var(--text3)">${car?car.make+' '+car.model:'?'} &middot; ${s.date}</small></div><div style="font-weight:600;font-size:13px">${Storage.getServiceCost(s).toFixed(0)} SAR</div></div>`;}).join(''):`<p class="empty-state">${t("No services yet")}</p>`;

        // Upcoming reminders
        const remEl=document.getElementById('upcoming-reminders');
        remEl.innerHTML=reminders.slice(0,5).length?reminders.slice(0,5).map(r=>{const car=cars.find(c=>c.id===r.carId);const days=Math.ceil((new Date(r.dueDate)-new Date())/86400000);let badge='badge-blue';if(days<0)badge='badge-red';else if(days<=7)badge='badge-orange';const label=days<0?t('{d}d overdue',{d:Math.abs(days)}):days===0?t('Today'):t('In {d}d',{d:days});return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><div><strong style="font-size:13px">${I18N.t(r.type)}</strong><br><small style="color:var(--text3)">${car?car.make+' '+car.model:''}</small></div><span class="badge ${badge}">${label}</span></div>`;}).join(''):`<p class="empty-state">${t("No upcoming reminders")}</p>`;
    },

    // ── Render: Cars ──
    renderCars() {
        const cars=Storage.getCars(), el=document.getElementById('cars-list');
        if(!cars.length){ el.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="24" width="48" height="20" rx="6" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M16 24l4-10h24l4 10" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="44" r="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><circle cx="44" cy="44" r="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><rect x="22" y="18" width="20" height="8" rx="2" stroke="var(--text3)" stroke-width="1.5" fill="none" opacity=".4"/></svg></div><p class="empty-state-text">${t("No cars added yet")}</p><button class="btn btn-primary" onclick="App.openCarModal()">${t("+ Add Your First Car")}</button></div>`; return; }
        el.innerHTML=cars.map(c=>{
            const sc=Storage.getServices(c.id).length, tc=Storage.getTotalExpenses(c.id), h=Storage.getCarHealthScore(c);
            const recs=Recommendations.getAllForCar(c), hasRecs=Object.keys(recs).length>0;
            const proj=Storage.getProjectedMileage(c), effKm=proj.km, cpk=Storage.getCostPerKm(c.id);
            const fresh=Storage.getOdometerFreshness(c);
            let recsHTML='';
            if(hasRecs){
                recsHTML=`<div class="car-recs"><div class="car-recs-title">${t("Maintenance Schedule")}</div>${Object.keys(recs).map(type=>{
                    const st=Recommendations.getMaintenanceStatus(c,type);
                    if(!st) return '';
                    const sClass=st.status==='overdue'?'red':st.status==='soon'?'orange':'green';
                    const sLabel=t(st.status==='overdue'?'Overdue':st.status==='soon'?'Soon':'OK');
                    return `<div class="rec-row2">
                        <div class="rec-top"><span class="rec-type">${I18N.t(type)}</span><span class="badge badge-${sClass}">${sLabel}</span></div>
                        <div class="rec-progress"><div class="rec-progress-bar ${sClass}" style="width:${Math.min(100,st.usedPct)}%"></div></div>
                        <div class="rec-meta"><span class="rec-detail">${t('Every {km} km / {m} mo',{km:st.rec.km.toLocaleString(),m:st.rec.months||12})}</span><span class="rec-next">${st.detail}</span></div>
                    </div>`;
                }).join('')}</div>`;
            }
            // Documents: insurance, registration, vehicle warranty
            let docsHTML='';
            const docs=[];
            if(c.insuranceExpiry){const d=Math.ceil((new Date(c.insuranceExpiry)-new Date())/86400000);docs.push({label:'Insurance',key:'insuranceExpiry',date:c.insuranceExpiry,days:d});}
            if(c.fahesExpiry){
                const d=Math.ceil((new Date(c.fahesExpiry)-new Date())/86400000);
                const lastInsp=Storage.getServices(c.id).filter(s=>Recommendations.isInspectionType(s.type)&&s.inspectionResult)
                    .sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                docs.push({label:'Periodic Inspection',key:'fahesExpiry',date:c.fahesExpiry,days:d,
                    extra:lastInsp?{result:lastInsp.inspectionResult,centre:lastInsp.inspectionCenter,on:lastInsp.date}:null});
            }
            if(c.registrationExpiry){const d=Math.ceil((new Date(c.registrationExpiry)-new Date())/86400000);docs.push({label:'Registration',key:'registrationExpiry',date:c.registrationExpiry,days:d});}
            if(c.warrantyExpiry){const d=Math.ceil((new Date(c.warrantyExpiry)-new Date())/86400000);docs.push({label:'Warranty',key:'warrantyExpiry',date:c.warrantyExpiry,days:d,warranty:true});}
            if(docs.length){
                docsHTML=`<div class="car-recs"><div class="car-recs-title">${t("Documents")}</div>${docs.map(doc=>{
                    let sb='';
                    if(doc.warranty){sb=doc.days<0?`<span class="badge badge-red">${t('Expired')}</span>`:`<span class="badge badge-blue">${t('Active')}</span>`;}
                    else if(doc.days<0)sb=`<span class="badge badge-red">${t('Expired')}</span>`;
                    else if(doc.days<=30)sb=`<span class="badge badge-orange">${t('{d}d left',{d:doc.days})}</span>`;
                    else sb=`<span class="badge badge-green">${t('Valid')}</span>`;
                    return `<div class="rec-row rec-row-tap" onclick="Features.openDocumentModal('${c.id}','${doc.key}')"><div class="rec-info"><span class="rec-type">${I18N.t(doc.label)}</span><span class="rec-detail">${doc.warranty?t('Until'):t('Expires')} ${doc.date}</span>${doc.extra?`<span class="rec-detail insp-note ${doc.extra.result}">${t(doc.extra.result==='fail'?'Last inspection failed':doc.extra.result==='advisory'?'Passed with advisories':'Passed')} &middot; ${doc.extra.on}${doc.extra.centre?' &middot; '+doc.extra.centre:''}</span>`:''}</div><div class="rec-status">${sb}</div></div>`;
                }).join('')}</div>`;
            }
            // Keep-or-sell: maintenance spend over the last year against the car's value
            let ownHTML='';
            const own=Storage.getOwnershipAnalysis(c.id);
            if(own && (own.maint12>0 || own.hasValue)){
                const vClass=own.verdict==='consider'?'red':own.verdict==='watch'?'orange':'green';
                ownHTML=`<div class="own-block own-${own.verdict||'none'}">
                    <div class="own-head"><span class="own-title">${t("Running Cost (last 12 months)")}</span>${own.headline?`<span class="badge badge-${vClass}">${own.headline}</span>`:''}</div>
                    <div class="own-stats">
                        <div class="own-stat"><span class="own-val">${own.maint12.toFixed(0)}</span><span class="own-lab">${t("SAR maintenance")}</span></div>
                        <div class="own-stat"><span class="own-val">${own.km12?own.km12.toLocaleString():'—'}</span><span class="own-lab">${t("km per year")}</span></div>
                        <div class="own-stat"><span class="own-val">${own.maintPerKm!==null?own.maintPerKm.toFixed(2):'—'}</span><span class="own-lab">${t("SAR/km upkeep")}</span></div>
                    </div>
                    ${own.hasValue
                        ? `<div class="own-note">Maintenance is <strong>${Math.round(own.ratio*100)}%</strong> of the car's ${own.value.toLocaleString()} SAR value.${own.verdict==='consider'?' Once yearly upkeep passes about a third of what the car is worth, replacing it usually costs less than keeping it.':own.verdict==='watch'?' Worth watching — still cheaper than replacing.':' Comfortably worth keeping.'}</div>`
                        : `<div class="own-note">${t("Add a market value in Edit to see whether this car is still worth keeping.")}</div>`}
                </div>`;
            }
            // Recall / safety notes
            let recallHTML='';
            if(c.recallNotes&&c.recallNotes.trim()){
                recallHTML=`<div class="recall-note"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${c.recallNotes}</span></div>`;
            }
            // Tire info
            let tireHTML='';
            if(c.tires&&c.tires.brand){
                tireHTML=`<div class="tire-info"><div class="tire-info-title">${t("Tires")}</div>
                    <div class="tire-detail"><span>Brand / Size</span><span>${c.tires.brand} ${c.tires.size||''}</span></div>
                    ${c.tires.installedDate?`<div class="tire-detail"><span>Installed</span><span>${c.tires.installedDate}${c.tires.installedMileage?' at '+parseInt(c.tires.installedMileage).toLocaleString()+' km':''}</span></div>`:''}
                    ${c.tires.warrantyKm?`<div class="tire-detail"><span>Warranty</span><span>${parseInt(c.tires.warrantyKm).toLocaleString()} km</span></div>`:''}
                    <div class="tire-detail"><span>Rotation</span><span>${c.tires.pattern||'cross'}</span></div>
                </div>`;
            }
            return `<div class="car-card">
                <div class="car-card-header"><div><div class="car-card-name">${c.make} ${c.model}</div><div class="car-card-year">${c.year}</div></div><span class="health-label ${h.color}"><bdi>${h.score}%</bdi> ${t(h.label)}</span></div>
                <div class="odo-block ${fresh.stale?'odo-stale':''}">
                    <div class="odo-block-main">
                        <div class="odo-block-label">${t('Odometer')}${proj.estimated?` <span class="odo-badge">${t('est.')}</span>`:''}</div>
                        <div class="odo-block-value">${effKm?effKm.toLocaleString():'—'} <small>km</small></div>
                        <div class="odo-block-sub">${proj.lastKm?`Last read ${proj.lastKm.toLocaleString()} km${fresh.daysSince!==null?` · ${fresh.daysSince===0?'today':fresh.daysSince+'d ago'}`:''}`:'No reading yet'}${proj.rate?` · ${proj.rate.toFixed(0)} km/day`:''}</div>
                    </div>
                    <button class="btn btn-primary btn-sm odo-block-btn" onclick="Features.openOdometerModal('${c.id}')">${t('Update')}</button>
                </div>
                <div class="car-card-details">
                    <div class="car-detail"><span>${t("Plate")}</span><span>${c.plate||'-'}</span></div>
                    <div class="car-detail"><span>${t("Services")}</span><span>${sc}</span></div>
                    <div class="car-detail"><span>${t("Total Spent")}</span><span>${tc.toFixed(0)} SAR</span></div>
                    ${cpk!==null?`<div class="car-detail"><span>${t("Running Cost")}</span><span>${cpk.toFixed(2)} SAR/km</span></div>`:''}
                </div>
                ${recallHTML}${ownHTML}${docsHTML}${recsHTML}${tireHTML}
                <div class="car-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.openCarModal(Storage.getCars().find(c=>c.id==='${c.id}'))">${t("Edit")}</button>
                    ${hasRecs?`<button class="btn btn-secondary btn-sm" onclick="App.openCustomRecModal('${c.id}')">${t("+ Custom")}</button>`:''}
                    <button class="btn btn-secondary btn-sm" onclick="Features.openTireModal('${c.id}')">${t("Tires")}</button>
                    <button class="btn btn-secondary btn-sm" onclick="Features.printServiceHistory('${c.id}')">${t("Print History")}</button>
                    <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete this car and all records?')){Storage.deleteCar('${c.id}');App.renderPage(App.currentPage);}">${t("Delete")}</button>
                </div>
            </div>`;
        }).join('');
    },

    // ── Render: Services ──
    renderServices() {
        const cid=this.selectedCarId;
        let services=Storage.getServices(cid).sort((a,b)=>new Date(b.date)-new Date(a.date));
        const cars=Storage.getCars(), el=document.getElementById('services-list');
        // Free-text search across type (both languages), shop, notes and date
        const qEl=document.getElementById('svc-search');
        const q=qEl?qEl.value.trim().toLowerCase():'';
        const total=services.length;
        if(q){
            services=services.filter(s=>{
                const car=cars.find(c=>c.id===s.carId);
                const hay=[s.type, I18N.t(s.type), s.date, s.notes||'', s.mileage||'',
                    car?car.make+' '+car.model:'',
                    ...(s.bills||[]).map(b=>[b.vendor||'',b.label||''].join(' '))
                ].join(' ').toLowerCase();
                return hay.includes(q);
            });
        }
        const countEl=document.getElementById('svc-count');
        if(countEl) countEl.textContent = q ? `${services.length} / ${total}` : (total? String(total) : '');
        if(!services.length){el.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M38 14a2 2 0 010 2.8l3.2 3.2a2 2 0 012.8 0l6-6A10 10 0 0136 28L21.2 42.8a4.2 4.2 0 01-6-6L30 22A10 10 0 0144 8l-6 6z" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M24 40l-4 4" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity=".4"/></svg></div><p class="empty-state-text">${q?t("Nothing matched your search"):t("No services recorded")}</p></div>`;return;}
        el.innerHTML=`<table><thead><tr><th>${t("Date")}</th><th>${t("Car")}</th><th>${t("Service")}</th><th>${t("Mileage")}</th><th>${t("Bills")}</th><th>${t("Cost")}</th><th>${t("Actions")}</th></tr></thead><tbody>${services.map(s=>{const car=cars.find(c=>c.id===s.carId);return `<tr><td data-label="${t('Date')}">${s.date}</td><td data-label="${t('Car')}">${car?car.year+' '+car.make+' '+car.model:'?'}</td><td data-label="${t('Service')}"><span class="badge badge-green">${I18N.t(s.type)}</span></td><td data-label="${t('Mileage')}">${s.mileage?parseInt(s.mileage).toLocaleString()+' km':'-'}</td><td data-label="${t('Bills')}">${Features.billsCell(s)}</td><td data-label="${t('Cost')}"><strong>${Storage.getServiceCost(s).toFixed(0)} SAR</strong></td><td data-label="${t('Actions')}" class="row-actions"><button class="btn btn-secondary btn-sm" onclick="App.openServiceModal(Storage.getServices().find(x=>x.id==='${s.id}'))">${t("Edit")}</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete this service record?')){Storage.deleteService('${s.id}');Features.cleanupPhotos();App.renderPage(App.currentPage);}">${t("Delete")}</button></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Fuel ──
    renderFuel() {
        const cid=this.selectedCarId, logs=Storage.getFuelLogs(cid).sort((a,b)=>new Date(b.date)-new Date(a.date)), cars=Storage.getCars();
        const fuelTotal=Storage.getFuelExpenses(cid), totalLiters=logs.reduce((s,f)=>s+(parseFloat(f.liters)||0),0);
        const consumption=Storage.getFuelConsumption(cid);
        const avgConsumption=consumption&&consumption.length?((consumption.reduce((s,c)=>s+parseFloat(c.lPer100km),0)/consumption.length).toFixed(1)):'-';
        const avgCostKm=consumption&&consumption.length?((consumption.reduce((s,c)=>s+parseFloat(c.costPerKm),0)/consumption.length).toFixed(2)):'-';

        document.getElementById('fuel-summary').innerHTML=`
            <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${fuelTotal.toFixed(0)} SAR</span><span class="stat-label">${t("Total Fuel Cost")}</span></div></div>
            <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2"/></svg></div><div class="stat-info"><span class="stat-value">${totalLiters.toFixed(0)} L</span><span class="stat-label">${t("Total Liters")}</span></div></div>
            <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${avgConsumption} L/100km</span><span class="stat-label">${t("Avg Consumption")}</span></div></div>
            <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${avgCostKm} SAR/km</span><span class="stat-label">${t("Cost per km")}</span></div></div>`;

        // Chart
        const chartEl=document.getElementById('fuel-chart');
        if(consumption&&consumption.length>1){
            chartEl.style.display='block';
            const last8=consumption.slice(-8);
            const maxV=Math.max(...last8.map(c=>parseFloat(c.lPer100km)),1);
            chartEl.innerHTML=`<h3>${t("Fuel Consumption Trend")}</h3><div class="bar-chart">${last8.map(c=>{const pct=(parseFloat(c.lPer100km)/maxV)*100;return `<div class="bar-group"><span class="bar-value">${c.lPer100km}</span><div class="bar fuel-bar" style="height:${Math.max(pct,3)}%"></div><span class="bar-label">${c.date.substring(5)}</span></div>`;}).join('')}</div>`;
        } else { chartEl.style.display='none'; }

        const el=document.getElementById('fuel-list');
        if(!logs.length){el.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="12" y="10" width="24" height="40" rx="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M36 24h6a4 4 0 014 4v8a4 4 0 004 4h0a4 4 0 004-4V20l-6-6" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="18" y="18" width="12" height="10" rx="2" stroke="var(--text3)" stroke-width="1.5" fill="none" opacity=".4"/></svg></div><p class="empty-state-text">${t("No fuel logs yet")}</p><p class="warranty-empty-hint">Logging fill-ups unlocks consumption tracking (L/100km), true cost per kilometre, and an early warning when fuel use jumps \u2014 often the first sign of low tyre pressure, a clogged filter or a failing sensor.</p></div>`;return;}
        el.innerHTML=`<table><thead><tr><th>${t("Date")}</th><th>${t("Car")}</th><th>${t("Odometer")}</th><th>${t("Liters")}</th><th>SAR/L</th><th>${t("Total")}</th><th>${t("Actions")}</th></tr></thead><tbody>${logs.map(f=>{const car=cars.find(c=>c.id===f.carId);return `<tr><td data-label="${t('Date')}">${f.date}</td><td data-label="${t('Car')}">${car?car.make+' '+car.model:'?'}</td><td data-label="${t('Odometer')}">${parseInt(f.odometer).toLocaleString()} km</td><td data-label="${t('Liters')}">${f.liters} L</td><td data-label="${t('SAR/L')}">${f.pricePerLiter}</td><td data-label="${t('Total')}"><strong>${parseFloat(f.totalCost).toFixed(0)} SAR</strong></td><td data-label="${t('Actions')}" class="row-actions"><button class="btn btn-secondary btn-sm" onclick="App.openFuelModal(Storage.getFuelLogs().find(x=>x.id==='${f.id}'))">${t("Edit")}</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete this fuel log?')){Storage.deleteFuelLog('${f.id}');App.renderPage(App.currentPage);}">${t("Delete")}</button></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Expenses ──
    renderExpenses() {
        const cid=this.selectedCarId, services=Storage.getServices(cid).sort((a,b)=>new Date(b.date)-new Date(a.date)), cars=Storage.getCars();
        const svcTotal=Storage.getServiceExpenses(cid), fuelTotal=Storage.getFuelExpenses(cid), grandTotal=svcTotal+fuelTotal;
        const monthlyData={};
        services.forEach(s=>{const m=s.date?s.date.substring(0,7):'?';monthlyData[m]=(monthlyData[m]||0)+Storage.getServiceCost(s);});
        Storage.getFuelLogs(cid).forEach(f=>{const m=f.date?f.date.substring(0,7):'?';monthlyData[m]=(monthlyData[m]||0)+(parseFloat(f.totalCost)||0);});
        const months=Object.keys(monthlyData).sort().slice(-6), maxVal=Math.max(...months.map(m=>monthlyData[m]),1);

        document.getElementById('expenses-summary').innerHTML=`
            <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${grandTotal.toFixed(0)} SAR</span><span class="stat-label">${t("Total Spent")}</span></div></div>
            <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a5 5 0 01-7 7l-7.4 7.4a2.1 2.1 0 01-3-3L10.7 10.3a5 5 0 017-7l-3 3z" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${svcTotal.toFixed(0)} SAR</span><span class="stat-label">${t("Maintenance")}</span></div></div>
            <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${fuelTotal.toFixed(0)} SAR</span><span class="stat-label">${t("Fuel")}</span></div></div>`;

        if(typeof Features!=='undefined') Features.renderServiceInsights(cid);
        const el=document.getElementById('expenses-list');
        let chartHTML='';
        if(months.length>0) chartHTML=`<div class="chart-container"><h3>${t("Monthly Expenses")}</h3><div class="bar-chart">${months.map(m=>{const pct=(monthlyData[m]/maxVal)*100;return `<div class="bar-group"><span class="bar-value">${monthlyData[m].toFixed(0)}</span><div class="bar" style="height:${Math.max(pct,3)}%"></div><span class="bar-label">${m.substring(5)}</span></div>`;}).join('')}</div></div>`;

        const allExpenses=[
            ...services.map(s=>({date:s.date,carId:s.carId,desc:I18N.t(s.type)+((s.bills&&s.bills.length)?` (${s.bills.length} bill${s.bills.length>1?'s':''})`:''),cost:Storage.getServiceCost(s),category:'Service'})),
            ...Storage.getFuelLogs(cid).map(f=>({date:f.date,carId:f.carId,desc:t('Fuel')+' ('+f.liters+' L)',cost:parseFloat(f.totalCost||0),category:'Fuel'}))
        ].sort((a,b)=>new Date(b.date)-new Date(a.date));

        if(!allExpenses.length){el.innerHTML=chartHTML+'<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M32 20v24M26 24c0-2 2.7-3.5 6-3.5s6 1.5 6 3.5-2.7 3.5-6 3.5-6 1.5-6 3.5 2.7 3.5 6 3.5 6 1.5 6 3.5c0 2-2.7 3.5-6 3.5s-6-1.5-6-3.5" stroke="var(--text3)" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div><p class="empty-state-text">${t("No expenses yet")}</p></div>';return;}
        el.innerHTML=chartHTML+`<table><thead><tr><th>${t("Date")}</th><th>${t("Car")}</th><th>${t("Description")}</th><th>${t("Category")}</th><th>${t("Cost")}</th></tr></thead><tbody>${allExpenses.map(e=>{const car=cars.find(c=>c.id===e.carId);return `<tr><td data-label="${t('Date')}">${e.date}</td><td data-label="${t('Car')}">${car?car.make+' '+car.model:'?'}</td><td data-label="${t('Description')}">${e.desc}</td><td data-label="${t('Category')}"><span class="badge ${e.category==='Fuel'?'badge-orange':'badge-green'}">${t(e.category)}</span></td><td data-label="${t('Cost')}"><strong>${e.cost.toFixed(0)} SAR</strong></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Reminders ──
    renderReminders() {
        const cid=this.selectedCarId, reminders=Storage.getReminders(cid).sort((a,b)=>{const ca=Storage.getCars().find(c=>c.id===a.carId),cb=Storage.getCars().find(c=>c.id===b.carId);const sa=Storage.getReminderStatus(a,ca).effDays,sb=Storage.getReminderStatus(b,cb).effDays;return (sa===null?1e9:sa)-(sb===null?1e9:sb);}), cars=Storage.getCars(), el=document.getElementById('reminders-list');
        if(!reminders.length){el.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M44 26a12 12 0 00-24 0c0 14-6 18-6 18h36s-6-4-6-18" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M35.46 48a4 4 0 01-6.92 0" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="32" cy="14" r="2" fill="var(--text3)" opacity=".4"/></svg></div><p class="empty-state-text">${t("No reminders set")}</p></div>`;return;}
        el.innerHTML=reminders.map(r=>{
            const car=cars.find(c=>c.id===r.carId);
            // Judge on km AND date together, so this page cannot disagree with the
            // maintenance schedule about the same item.
            const st=Storage.getReminderStatus(r,car);
            const badgeMap={done:'green',overdue:'red',soon:'orange',ok:'blue'};
            const sc=st.status==='overdue'?'overdue':st.status==='soon'?'soon':'';
            const sl=r.completed
                ?`<span class="badge badge-green">${t("Done")}</span>`
                :`<span class="badge badge-${badgeMap[st.status]}">${st.detail}</span>`;
            return `<div class="reminder-card ${sc}"><div class="reminder-card-header"><span class="reminder-card-title">${I18N.t(r.type)}</span>${sl}</div><div class="reminder-card-car">${car?car.year+' '+car.make+' '+car.model:''}</div><div class="reminder-card-date">${t("Due")}: ${r.dueDate}${r.dueMileage?' or at '+parseInt(r.dueMileage).toLocaleString()+' km':''}</div>${r.notes?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${t(r.notes)}</div>`:''}<div class="reminder-card-actions">${!r.completed?`<button class="btn btn-primary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:true});App.renderPage(App.currentPage);">${t("Done")}</button>`:`<button class="btn btn-secondary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:false});App.renderPage(App.currentPage);">${t("Undo")}</button>`}${!r.completed?`<button class="btn btn-secondary btn-sm" onclick="Storage.snoozeReminder('${r.id}',7);App.renderPage(App.currentPage);">${t("Snooze 1w")}</button>`:''}<button class="btn btn-secondary btn-sm" onclick="App.openReminderModal(Storage.getReminders().find(x=>x.id==='${r.id}'))">${t("Edit")}</button><button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteReminder('${r.id}');App.renderPage(App.currentPage);}">${t('Delete')}</button></div></div>`;
        }).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
