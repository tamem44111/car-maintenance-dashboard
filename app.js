const App = {
    currentPage: 'dashboard',
    selectedCarId: 'all',

    init() {
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

        const titles = { dashboard:'Dashboard', cars:'My Cars', services:'Services', fuel:'Fuel Log', expenses:'Expenses', reminders:'Reminders' };
        document.getElementById('page-title').textContent = titles[page];

        const addBtn = document.getElementById('add-btn');
        if (page === 'dashboard') { addBtn.style.display = 'none'; }
        else {
            addBtn.style.display = 'block';
            const labels = { cars:'+ Add Car', services:'+ Add Service', fuel:'+ Add Fuel', expenses:'+ Add Expense', reminders:'+ Add Reminder' };
            addBtn.textContent = labels[page];
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
        sel.innerHTML = '<option value="all">All Cars</option>' + cars.map(c => `<option value="${c.id}" ${c.id===this.selectedCarId?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('');
    },

    // ── Modal ──
    bindModal() {
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modal').addEventListener('click', (e) => { if (e.target === document.getElementById('modal')) this.closeModal(); });
    },
    openModal(title, bodyHTML, onSave) {
        document.getElementById('modal-title').textContent = title;
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
            </div>`;
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
            };
            if (!data.make || !data.model || !data.year) return alert('Please fill in make, model, and year.');
            if (car) Storage.updateCar(car.id, data);
            else Storage.addCar(data);
            this.closeModal(); this.renderPage(this.currentPage);
        });
    },

    // ── Service Modal ──
    openServiceModal(service = null) {
        const cars = Storage.getCars();
        if (!cars.length) return alert('Please add a car first.');
        const types = ['Oil Change','Tire Rotation','Brake Inspection','Air Filter','Transmission','Coolant Flush','Battery','Spark Plugs','Alignment','Other'];
        const isEdit = !!service;
        const isOil = service && service.type === 'Oil Change';
        const chips = types.map(t => {
            const id = 'svc-'+t.toLowerCase().replace(/\s+/g,'-');
            return `<label class="service-chip"><input type="checkbox" id="${id}" value="${t}" ${isEdit&&service.type===t?'checked':''} ${isEdit?'disabled':''} onchange="(function(){var o=document.getElementById('oil-options'),c=document.getElementById('svc-oil-change');o.style.display=c&&c.checked?'block':'none'})()"><span class="service-chip-label">${t}</span></label>`;
        }).join('');
        const html = `
            <div class="form-group"><label>Car</label><select id="f-car">${cars.map(c=>`<option value="${c.id}" ${service&&service.carId===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-group"><label>${isEdit?'Service Type':'Services Performed (select all that apply)'}</label>
                ${isEdit?`<select id="f-type" onchange="document.getElementById('oil-options').style.display=this.value==='Oil Change'?'block':'none'">${types.map(t=>`<option value="${t}" ${service.type===t?'selected':''}>${t}</option>`).join('')}</select>`:`<div class="service-chips">${chips}</div>`}
            </div>
            <div id="oil-options" style="display:${isOil?'block':'none'}">
                <div class="form-group"><label>Oil Type (next change interval)</label>
                    <div class="oil-interval-group">
                        <label class="oil-option"><input type="radio" name="oil-interval" value="5000" ${!service||!service.oilInterval||service.oilInterval==='5000'?'checked':''}><span class="oil-option-card"><strong>5,000 km</strong><small>Regular</small></span></label>
                        <label class="oil-option"><input type="radio" name="oil-interval" value="7000" ${service&&service.oilInterval==='7000'?'checked':''}><span class="oil-option-card"><strong>7,000 km</strong><small>Semi-synthetic</small></span></label>
                        <label class="oil-option"><input type="radio" name="oil-interval" value="10000" ${service&&service.oilInterval==='10000'?'checked':''}><span class="oil-option-card"><strong>10,000 km</strong><small>Full synthetic</small></span></label>
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${service?service.date:new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Total Cost (SAR)</label><input type="number" id="f-cost" placeholder="0.00" step="0.01" value="${service?service.cost:''}"></div>
            </div>
            <div class="form-group"><label>Mileage at Service (km)</label><input type="number" id="f-smileage" placeholder="50000" value="${service?service.mileage:''}"></div>
            <div class="form-group"><label>Notes</label><textarea id="f-notes" rows="2" placeholder="Optional...">${service?service.notes||'':''}</textarea></div>`;
        this.openModal(isEdit?'Edit Service':'Add Service', html, () => {
            const carId=document.getElementById('f-car').value, date=document.getElementById('f-date').value, cost=document.getElementById('f-cost').value, mileage=document.getElementById('f-smileage').value, notes=document.getElementById('f-notes').value.trim();
            if(!date) return alert('Please select a date.');
            const car = Storage.getCars().find(c=>c.id===carId);
            if(isEdit){
                const data={carId,type:document.getElementById('f-type').value,date,cost,mileage,notes};
                if(data.type==='Oil Change') this._handleOilReminder(data);
                else if(mileage&&car) Recommendations.createReminderFromService(car,data.type,mileage,date);
                Storage.updateService(service.id,data);
            } else {
                const selected=[...document.querySelectorAll('.service-chips input:checked')].map(cb=>cb.value);
                if(!selected.length) return alert('Select at least one service.');
                const cps=selected.length>1?(parseFloat(cost)/selected.length).toFixed(2):cost;
                selected.forEach(type=>{
                    const data={carId,type,date,cost:cps,mileage,notes};
                    if(type==='Oil Change') this._handleOilReminder(data);
                    else if(mileage&&car) Recommendations.createReminderFromService(car,type,mileage,date);
                    Storage.addService(data);
                });
            }
            this.closeModal(); this.renderPage(this.currentPage);
        });
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
        if (!cars.length) return alert('Please add a car first.');
        const html = `
            <div class="form-group"><label>Car</label><select id="f-car">${cars.map(c=>`<option value="${c.id}" ${log&&log.carId===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${log?log.date:new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Odometer (km)</label><input type="number" id="f-odo" placeholder="50000" value="${log?log.odometer:''}"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Liters</label><input type="number" id="f-liters" placeholder="45" step="0.1" value="${log?log.liters:''}"></div>
                <div class="form-group"><label>Price/Liter (SAR)</label><input type="number" id="f-ppl" placeholder="2.18" step="0.01" value="${log?log.pricePerLiter:''}"></div>
            </div>
            <div class="form-group"><label>Total Cost (SAR)</label><input type="number" id="f-ftotal" placeholder="Auto-calculated" step="0.01" value="${log?log.totalCost:''}"></div>
            <div class="form-group"><label>Station</label><input type="text" id="f-station" placeholder="Optional" value="${log?log.station||'':''}"></div>`;
        this.openModal(log?'Edit Fuel Log':'Add Fuel Log', html, () => {
            const liters=parseFloat(document.getElementById('f-liters').value)||0;
            const ppl=parseFloat(document.getElementById('f-ppl').value)||0;
            let total=parseFloat(document.getElementById('f-ftotal').value)||0;
            if(!total&&liters&&ppl) total=liters*ppl;
            const data={carId:document.getElementById('f-car').value,date:document.getElementById('f-date').value,odometer:document.getElementById('f-odo').value,liters:liters.toString(),pricePerLiter:ppl.toString(),totalCost:total.toFixed(2),station:document.getElementById('f-station').value.trim()};
            if(!data.date||!data.odometer) return alert('Date and odometer are required.');
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
        if (!cars.length) return alert('Please add a car first.');
        const types = ['Oil Change','Tire Rotation','Brake Inspection','Air Filter','Registration Renewal','Insurance Renewal','Inspection','Other'];
        const html = `
            <div class="form-group"><label>Car</label><select id="f-car">${cars.map(c=>`<option value="${c.id}" ${reminder&&reminder.carId===c.id?'selected':''}>${c.year} ${c.make} ${c.model}</option>`).join('')}</select></div>
            <div class="form-group"><label>Reminder For</label><select id="f-type">${types.map(t=>`<option value="${t}" ${reminder&&reminder.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
            <div class="form-row">
                <div class="form-group"><label>Due Date</label><input type="date" id="f-duedate" value="${reminder?reminder.dueDate:''}"></div>
                <div class="form-group"><label>Due Mileage (km)</label><input type="number" id="f-duemileage" placeholder="Optional" value="${reminder?reminder.dueMileage||'':''}"></div>
            </div>
            <div class="form-group"><label>Notes</label><textarea id="f-rnotes" rows="2" placeholder="Optional...">${reminder?reminder.notes||'':''}</textarea></div>`;
        this.openModal(reminder?'Edit Reminder':'Add Reminder', html, () => {
            const data={carId:document.getElementById('f-car').value,type:document.getElementById('f-type').value,dueDate:document.getElementById('f-duedate').value,dueMileage:document.getElementById('f-duemileage').value,notes:document.getElementById('f-rnotes').value.trim(),completed:reminder?reminder.completed:false};
            if(!data.dueDate) return alert('Please select a due date.');
            if(reminder) Storage.updateReminder(reminder.id,data); else Storage.addReminder(data);
            this.closeModal(); this.renderPage(this.currentPage);
        });
    },

    openCustomRecModal(carId) {
        const car=Storage.getCars().find(c=>c.id===carId);
        if(!car)return;
        const types=['Oil Change','Tire Rotation','Brake Inspection','Air Filter','Transmission','Coolant Flush','Battery','Spark Plugs','Alignment','Other'];
        const html=`<p style="font-size:12px;color:var(--text3);margin-bottom:14px">Custom interval for <strong>${car.make} ${car.model}</strong>. Overrides manufacturer data.</p>
            <div class="form-group"><label>Service Type</label><select id="f-rec-type">${types.map(t=>`<option value="${t}">${t}</option>`).join('')}</select></div>
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
        document.getElementById('stat-expenses').textContent=total.toFixed(0)+' SAR';
        document.getElementById('stat-reminders').textContent=reminders.length;

        // Alerts
        const alerts=[];
        const overdue=reminders.filter(r=>new Date(r.dueDate)<new Date());
        overdue.forEach(r=>{const car=cars.find(c=>c.id===r.carId); alerts.push({type:'red',text:`${r.type} overdue for ${car?car.make+' '+car.model:'a car'} — was due ${r.dueDate}`});});
        const soon=reminders.filter(r=>{const d=Math.ceil((new Date(r.dueDate)-new Date())/86400000);return d>=0&&d<=7;});
        soon.forEach(r=>{const car=cars.find(c=>c.id===r.carId);const d=Math.ceil((new Date(r.dueDate)-new Date())/86400000); alerts.push({type:'orange',text:`${r.type} due ${d===0?'today':'in '+d+' days'} for ${car?car.make+' '+car.model:'a car'}`});});
        cars.forEach(c=>{
            if(c.insuranceExpiry){const d=Math.ceil((new Date(c.insuranceExpiry)-new Date())/86400000);if(d<0)alerts.push({type:'red',text:`Insurance expired for ${c.make} ${c.model} (${c.insuranceExpiry})`});else if(d<=30)alerts.push({type:'orange',text:`Insurance expires in ${d} days for ${c.make} ${c.model}`});}
            if(c.registrationExpiry){const d=Math.ceil((new Date(c.registrationExpiry)-new Date())/86400000);if(d<0)alerts.push({type:'red',text:`Registration (Istimara) expired for ${c.make} ${c.model}`});else if(d<=30)alerts.push({type:'orange',text:`Registration expires in ${d} days for ${c.make} ${c.model}`});}
        });
        const alertsEl=document.getElementById('alerts-section');
        alertsEl.innerHTML=alerts.length?`<div class="alerts-container">${alerts.map(a=>`<div class="alert alert-${a.type}"><span class="alert-icon">${a.type==='red'?'&#9888;':'&#9432;'}</span>${a.text}</div>`).join('')}</div>`:'';

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
                    <div class="health-info"><div class="health-car-name">${c.make} ${c.model}</div><div class="health-car-year">${c.year} &middot; ${c.mileage?parseInt(c.mileage).toLocaleString()+' km':'-'}</div><span class="health-label ${h.color}">${h.label}</span><div class="health-details">${svcCount} services${overdueC?` &middot; <span style="color:var(--red)">${overdueC} overdue</span>`:''}</div></div>
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
        recentEl.innerHTML=recent.length?recent.map(s=>{const car=cars.find(c=>c.id===s.carId);return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><div><strong style="font-size:13px">${s.type}</strong><br><small style="color:var(--text3)">${car?car.make+' '+car.model:'?'} &middot; ${s.date}</small></div><div style="font-weight:600;font-size:13px">${parseFloat(s.cost||0).toFixed(0)} SAR</div></div>`;}).join(''):'<p class="empty-state">No services yet</p>';

        // Upcoming reminders
        const remEl=document.getElementById('upcoming-reminders');
        remEl.innerHTML=reminders.slice(0,5).length?reminders.slice(0,5).map(r=>{const car=cars.find(c=>c.id===r.carId);const days=Math.ceil((new Date(r.dueDate)-new Date())/86400000);let badge='badge-blue';if(days<0)badge='badge-red';else if(days<=7)badge='badge-orange';const label=days<0?Math.abs(days)+'d overdue':days===0?'Today':'In '+days+'d';return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><div><strong style="font-size:13px">${r.type}</strong><br><small style="color:var(--text3)">${car?car.make+' '+car.model:''}</small></div><span class="badge ${badge}">${label}</span></div>`;}).join(''):'<p class="empty-state">No upcoming reminders</p>';
    },

    // ── Render: Cars ──
    renderCars() {
        const cars=Storage.getCars(), el=document.getElementById('cars-list');
        if(!cars.length){ el.innerHTML=`<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="24" width="48" height="20" rx="6" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M16 24l4-10h24l4 10" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="44" r="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><circle cx="44" cy="44" r="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><rect x="22" y="18" width="20" height="8" rx="2" stroke="var(--text3)" stroke-width="1.5" fill="none" opacity=".4"/></svg></div><p class="empty-state-text">No cars added yet</p><button class="btn btn-primary" onclick="App.openCarModal()">+ Add Your First Car</button></div>`; return; }
        el.innerHTML=cars.map(c=>{
            const sc=Storage.getServices(c.id).length, tc=Storage.getTotalExpenses(c.id), h=Storage.getCarHealthScore(c);
            const recs=Recommendations.getAllForCar(c), hasRecs=Object.keys(recs).length>0;
            const services=Storage.getServices(c.id), currentMileage=parseInt(c.mileage)||0;
            let recsHTML='';
            if(hasRecs){
                recsHTML=`<div class="car-recs"><div class="car-recs-title">Maintenance Schedule</div>${Object.entries(recs).map(([type,rec])=>{
                    const ls=services.filter(s=>s.type===type).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                    const lk=ls?parseInt(ls.mileage)||0:0;
                    const nk=lk>0?lk+rec.km:currentMileage+rec.km;
                    const rem=nk-currentMileage;
                    let sb='';if(rem<=0)sb='<span class="badge badge-red">Overdue</span>';else if(rem<=1000)sb='<span class="badge badge-orange">Soon</span>';else sb='<span class="badge badge-green">OK</span>';
                    return `<div class="rec-row"><div class="rec-info"><span class="rec-type">${type}</span><span class="rec-detail">Every ${rec.km.toLocaleString()} km &middot; ${rec.note}</span></div><div class="rec-status">${sb}<span class="rec-next">${rem>0?rem.toLocaleString()+' km left':Math.abs(rem).toLocaleString()+' km over'}</span></div></div>`;
                }).join('')}</div>`;
            }
            // Insurance/registration
            let docsHTML='';
            const docs=[];
            if(c.insuranceExpiry){const d=Math.ceil((new Date(c.insuranceExpiry)-new Date())/86400000);docs.push({label:'Insurance',date:c.insuranceExpiry,days:d});}
            if(c.registrationExpiry){const d=Math.ceil((new Date(c.registrationExpiry)-new Date())/86400000);docs.push({label:'Registration',date:c.registrationExpiry,days:d});}
            if(docs.length){
                docsHTML=`<div class="car-recs"><div class="car-recs-title">Documents</div>${docs.map(doc=>{
                    let sb='';if(doc.days<0)sb='<span class="badge badge-red">Expired</span>';else if(doc.days<=30)sb='<span class="badge badge-orange">${doc.days}d left</span>';else sb='<span class="badge badge-green">Valid</span>';
                    return `<div class="rec-row"><div class="rec-info"><span class="rec-type">${doc.label}</span><span class="rec-detail">Expires ${doc.date}</span></div><div class="rec-status">${sb}</div></div>`;
                }).join('')}</div>`;
            }
            // Tire info
            let tireHTML='';
            if(c.tires&&c.tires.brand){
                tireHTML=`<div class="tire-info"><div class="tire-info-title">Tires</div>
                    <div class="tire-detail"><span>Brand / Size</span><span>${c.tires.brand} ${c.tires.size||''}</span></div>
                    ${c.tires.installedDate?`<div class="tire-detail"><span>Installed</span><span>${c.tires.installedDate}${c.tires.installedMileage?' at '+parseInt(c.tires.installedMileage).toLocaleString()+' km':''}</span></div>`:''}
                    ${c.tires.warrantyKm?`<div class="tire-detail"><span>Warranty</span><span>${parseInt(c.tires.warrantyKm).toLocaleString()} km</span></div>`:''}
                    <div class="tire-detail"><span>Rotation</span><span>${c.tires.pattern||'cross'}</span></div>
                </div>`;
            }
            return `<div class="car-card">
                <div class="car-card-header"><div><div class="car-card-name">${c.make} ${c.model}</div><div class="car-card-year">${c.year}</div></div><span class="health-label ${h.color}">${h.score}% ${h.label}</span></div>
                <div class="car-card-details">
                    <div class="car-detail"><span>Mileage</span><span>${c.mileage?parseInt(c.mileage).toLocaleString()+' km':'-'}</span></div>
                    <div class="car-detail"><span>Plate</span><span>${c.plate||'-'}</span></div>
                    <div class="car-detail"><span>Services</span><span>${sc}</span></div>
                    <div class="car-detail"><span>Total Spent</span><span>${tc.toFixed(0)} SAR</span></div>
                </div>
                ${docsHTML}${recsHTML}${tireHTML}
                <div class="car-card-actions">
                    <button class="btn btn-secondary btn-sm" onclick="App.openCarModal(Storage.getCars().find(c=>c.id==='${c.id}'))">Edit</button>
                    ${hasRecs?`<button class="btn btn-secondary btn-sm" onclick="App.openCustomRecModal('${c.id}')">+ Custom</button>`:''}
                    <button class="btn btn-secondary btn-sm" onclick="Features.openTireModal('${c.id}')">Tires</button>
                    <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete this car and all records?')){Storage.deleteCar('${c.id}');App.renderPage(App.currentPage);}">Delete</button>
                </div>
            </div>`;
        }).join('');
    },

    // ── Render: Services ──
    renderServices() {
        const cid=this.selectedCarId,services=Storage.getServices(cid).sort((a,b)=>new Date(b.date)-new Date(a.date)),cars=Storage.getCars(),el=document.getElementById('services-list');
        if(!services.length){el.innerHTML='<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M38 14a2 2 0 010 2.8l3.2 3.2a2 2 0 012.8 0l6-6A10 10 0 0136 28L21.2 42.8a4.2 4.2 0 01-6-6L30 22A10 10 0 0144 8l-6 6z" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M24 40l-4 4" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity=".4"/></svg></div><p class="empty-state-text">No services recorded</p></div>';return;}
        el.innerHTML=`<table><thead><tr><th>Date</th><th>Car</th><th>Service</th><th>Mileage</th><th>Cost</th><th>Actions</th></tr></thead><tbody>${services.map(s=>{const car=cars.find(c=>c.id===s.carId);return `<tr><td>${s.date}</td><td>${car?car.year+' '+car.make+' '+car.model:'?'}</td><td><span class="badge badge-green">${s.type}</span></td><td>${s.mileage?parseInt(s.mileage).toLocaleString()+' km':'-'}</td><td><strong>${parseFloat(s.cost||0).toFixed(0)} SAR</strong></td><td><button class="btn btn-secondary btn-sm" onclick="App.openServiceModal(Storage.getServices().find(x=>x.id==='${s.id}'))">Edit</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteService('${s.id}');App.renderPage(App.currentPage);}">Del</button></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Fuel ──
    renderFuel() {
        const cid=this.selectedCarId, logs=Storage.getFuelLogs(cid).sort((a,b)=>new Date(b.date)-new Date(a.date)), cars=Storage.getCars();
        const fuelTotal=Storage.getFuelExpenses(cid), totalLiters=logs.reduce((s,f)=>s+(parseFloat(f.liters)||0),0);
        const consumption=Storage.getFuelConsumption(cid);
        const avgConsumption=consumption&&consumption.length?((consumption.reduce((s,c)=>s+parseFloat(c.lPer100km),0)/consumption.length).toFixed(1)):'-';
        const avgCostKm=consumption&&consumption.length?((consumption.reduce((s,c)=>s+parseFloat(c.costPerKm),0)/consumption.length).toFixed(2)):'-';

        document.getElementById('fuel-summary').innerHTML=`
            <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${fuelTotal.toFixed(0)} SAR</span><span class="stat-label">Total Fuel Cost</span></div></div>
            <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2"/></svg></div><div class="stat-info"><span class="stat-value">${totalLiters.toFixed(0)} L</span><span class="stat-label">Total Liters</span></div></div>
            <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${avgConsumption} L/100km</span><span class="stat-label">Avg Consumption</span></div></div>
            <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${avgCostKm} SAR/km</span><span class="stat-label">Cost per km</span></div></div>`;

        // Chart
        const chartEl=document.getElementById('fuel-chart');
        if(consumption&&consumption.length>1){
            chartEl.style.display='block';
            const last8=consumption.slice(-8);
            const maxV=Math.max(...last8.map(c=>parseFloat(c.lPer100km)),1);
            chartEl.innerHTML=`<h3>Fuel Consumption Trend</h3><div class="bar-chart">${last8.map(c=>{const pct=(parseFloat(c.lPer100km)/maxV)*100;return `<div class="bar-group"><span class="bar-value">${c.lPer100km}</span><div class="bar fuel-bar" style="height:${Math.max(pct,3)}%"></div><span class="bar-label">${c.date.substring(5)}</span></div>`;}).join('')}</div>`;
        } else { chartEl.style.display='none'; }

        const el=document.getElementById('fuel-list');
        if(!logs.length){el.innerHTML='<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="12" y="10" width="24" height="40" rx="4" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M36 24h6a4 4 0 014 4v8a4 4 0 004 4h0a4 4 0 004-4V20l-6-6" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="18" y="18" width="12" height="10" rx="2" stroke="var(--text3)" stroke-width="1.5" fill="none" opacity=".4"/></svg></div><p class="empty-state-text">No fuel logs yet</p></div>';return;}
        el.innerHTML=`<table><thead><tr><th>Date</th><th>Car</th><th>Odometer</th><th>Liters</th><th>SAR/L</th><th>Total</th><th>Actions</th></tr></thead><tbody>${logs.map(f=>{const car=cars.find(c=>c.id===f.carId);return `<tr><td>${f.date}</td><td>${car?car.make+' '+car.model:'?'}</td><td>${parseInt(f.odometer).toLocaleString()} km</td><td>${f.liters} L</td><td>${f.pricePerLiter}</td><td><strong>${parseFloat(f.totalCost).toFixed(0)} SAR</strong></td><td><button class="btn btn-secondary btn-sm" onclick="App.openFuelModal(Storage.getFuelLogs().find(x=>x.id==='${f.id}'))">Edit</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteFuelLog('${f.id}');App.renderPage(App.currentPage);}">Del</button></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Expenses ──
    renderExpenses() {
        const cid=this.selectedCarId, services=Storage.getServices(cid).sort((a,b)=>new Date(b.date)-new Date(a.date)), cars=Storage.getCars();
        const svcTotal=Storage.getServiceExpenses(cid), fuelTotal=Storage.getFuelExpenses(cid), grandTotal=svcTotal+fuelTotal;
        const monthlyData={};
        services.forEach(s=>{const m=s.date?s.date.substring(0,7):'?';monthlyData[m]=(monthlyData[m]||0)+(parseFloat(s.cost)||0);});
        Storage.getFuelLogs(cid).forEach(f=>{const m=f.date?f.date.substring(0,7):'?';monthlyData[m]=(monthlyData[m]||0)+(parseFloat(f.totalCost)||0);});
        const months=Object.keys(monthlyData).sort().slice(-6), maxVal=Math.max(...months.map(m=>monthlyData[m]),1);

        document.getElementById('expenses-summary').innerHTML=`
            <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${grandTotal.toFixed(0)} SAR</span><span class="stat-label">Total Spent</span></div></div>
            <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3-3a5 5 0 01-7 7l-7.4 7.4a2.1 2.1 0 01-3-3L10.7 10.3a5 5 0 017-7l-3 3z" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${svcTotal.toFixed(0)} SAR</span><span class="stat-label">Maintenance</span></div></div>
            <div class="stat-card"><div class="stat-icon orange"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 22V6a2 2 0 012-2h6a2 2 0 012 2v16" stroke="currentColor" stroke-width="2" fill="none"/></svg></div><div class="stat-info"><span class="stat-value">${fuelTotal.toFixed(0)} SAR</span><span class="stat-label">Fuel</span></div></div>`;

        const el=document.getElementById('expenses-list');
        let chartHTML='';
        if(months.length>0) chartHTML=`<div class="chart-container"><h3>Monthly Expenses</h3><div class="bar-chart">${months.map(m=>{const pct=(monthlyData[m]/maxVal)*100;return `<div class="bar-group"><span class="bar-value">${monthlyData[m].toFixed(0)}</span><div class="bar" style="height:${Math.max(pct,3)}%"></div><span class="bar-label">${m.substring(5)}</span></div>`;}).join('')}</div></div>`;

        const allExpenses=[
            ...services.map(s=>({date:s.date,carId:s.carId,desc:s.type,cost:parseFloat(s.cost||0),category:'Service'})),
            ...Storage.getFuelLogs(cid).map(f=>({date:f.date,carId:f.carId,desc:'Fuel ('+f.liters+' L)',cost:parseFloat(f.totalCost||0),category:'Fuel'}))
        ].sort((a,b)=>new Date(b.date)-new Date(a.date));

        if(!allExpenses.length){el.innerHTML=chartHTML+'<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" stroke="var(--text3)" stroke-width="2.5" fill="none"/><path d="M32 20v24M26 24c0-2 2.7-3.5 6-3.5s6 1.5 6 3.5-2.7 3.5-6 3.5-6 1.5-6 3.5 2.7 3.5 6 3.5 6 1.5 6 3.5c0 2-2.7 3.5-6 3.5s-6-1.5-6-3.5" stroke="var(--text3)" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div><p class="empty-state-text">No expenses yet</p></div>';return;}
        el.innerHTML=chartHTML+`<table><thead><tr><th>Date</th><th>Car</th><th>Description</th><th>Category</th><th>Cost</th></tr></thead><tbody>${allExpenses.map(e=>{const car=cars.find(c=>c.id===e.carId);return `<tr><td>${e.date}</td><td>${car?car.make+' '+car.model:'?'}</td><td>${e.desc}</td><td><span class="badge ${e.category==='Fuel'?'badge-orange':'badge-green'}">${e.category}</span></td><td><strong>${e.cost.toFixed(0)} SAR</strong></td></tr>`;}).join('')}</tbody></table>`;
    },

    // ── Render: Reminders ──
    renderReminders() {
        const cid=this.selectedCarId, reminders=Storage.getReminders(cid).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)), cars=Storage.getCars(), el=document.getElementById('reminders-list');
        if(!reminders.length){el.innerHTML='<div class="empty-state"><div class="empty-state-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M44 26a12 12 0 00-24 0c0 14-6 18-6 18h36s-6-4-6-18" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M35.46 48a4 4 0 01-6.92 0" stroke="var(--text3)" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="32" cy="14" r="2" fill="var(--text3)" opacity=".4"/></svg></div><p class="empty-state-text">No reminders set</p></div>';return;}
        el.innerHTML=reminders.map(r=>{
            const car=cars.find(c=>c.id===r.carId), days=Math.ceil((new Date(r.dueDate)-new Date())/86400000);
            let sc='',sl='';
            if(r.completed){sl='<span class="badge badge-green">Done</span>';}
            else if(days<0){sc='overdue';sl=`<span class="badge badge-red">${Math.abs(days)}d overdue</span>`;}
            else if(days<=7){sc='soon';sl=`<span class="badge badge-orange">${days===0?'Due today':'Due in '+days+'d'}</span>`;}
            else{sl=`<span class="badge badge-blue">In ${days}d</span>`;}
            return `<div class="reminder-card ${sc}"><div class="reminder-card-header"><span class="reminder-card-title">${r.type}</span>${sl}</div><div class="reminder-card-car">${car?car.year+' '+car.make+' '+car.model:''}</div><div class="reminder-card-date">Due: ${r.dueDate}${r.dueMileage?' or at '+parseInt(r.dueMileage).toLocaleString()+' km':''}</div>${r.notes?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${r.notes}</div>`:''}<div class="reminder-card-actions">${!r.completed?`<button class="btn btn-primary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:true});App.renderPage(App.currentPage);">Done</button>`:`<button class="btn btn-secondary btn-sm" onclick="Storage.updateReminder('${r.id}',{completed:false});App.renderPage(App.currentPage);">Undo</button>`}<button class="btn btn-secondary btn-sm" onclick="App.openReminderModal(Storage.getReminders().find(x=>x.id==='${r.id}'))">Edit</button><button class="btn btn-danger btn-sm" onclick="if(confirm('Delete?')){Storage.deleteReminder('${r.id}');App.renderPage(App.currentPage);}">Del</button></div></div>`;
        }).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
