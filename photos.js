// ═══════════════════════════════════════════
// PHOTOS.JS — Receipt images: in-browser compression + IndexedDB storage
//
// localStorage caps around 5 MB and a phone photo is 2–5 MB, so receipts
// are compressed to roughly 150 KB and kept in IndexedDB instead. Only the
// photo id is stored alongside the bill in localStorage.
// ═══════════════════════════════════════════

const Photos = {
    _db: null,
    _name: 'autocare_photos',
    _store: 'receipts',

    _open() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) return reject(new Error('This browser has no photo storage.'));
            const req = indexedDB.open(this._name, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this._store)) db.createObjectStore(this._store);
            };
            req.onsuccess = () => { this._db = req.result; resolve(this._db); };
            req.onerror = () => reject(req.error || new Error('Could not open photo storage.'));
        });
    },

    _tx(mode, fn) {
        return this._open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(this._store, mode);
            const req = fn(tx.objectStore(this._store));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }));
    },

    newId() { return 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

    put(id, dataUrl) { return this._tx('readwrite', s => s.put(dataUrl, id)).then(() => id); },
    get(id) { return id ? this._tx('readonly', s => s.get(id)) : Promise.resolve(null); },
    remove(id) { return id ? this._tx('readwrite', s => s.delete(id)) : Promise.resolve(); },
    keys() { return this._tx('readonly', s => s.getAllKeys()); },

    // Rough footprint of stored receipts, for the Settings screen
    usage() {
        return this._tx('readonly', s => s.getAll())
            .then(all => ({ count: all.length, bytes: all.reduce((n, d) => n + (d ? d.length : 0), 0) }))
            .catch(() => ({ count: 0, bytes: 0 }));
    },

    // Shrink to `maxDim` on the long edge and re-encode as JPEG.
    compress(file, maxDim = 1400, quality = 0.72) {
        return new Promise((resolve, reject) => {
            if (!file || !/^image\//.test(file.type)) {
                return reject(new Error('Please choose an image file (JPG or PNG).'));
            }
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Could not read that file.'));
            reader.onload = e => {
                const img = new Image();
                img.onerror = () => reject(new Error('Could not read that image. If it came from an iPhone, try sharing it as JPEG.'));
                img.onload = () => {
                    let w = img.naturalWidth, h = img.naturalHeight;
                    if (!w || !h) return reject(new Error('That image appears to be empty.'));
                    if (Math.max(w, h) > maxDim) {
                        const scale = maxDim / Math.max(w, h);
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';     // flatten any transparency so JPEG stays clean
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    try {
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    } catch (err) {
                        reject(new Error('Could not process that image.'));
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    // Compress + store in one step; resolves to the new photo id.
    save(file) {
        return this.compress(file).then(dataUrl => this.put(this.newId(), dataUrl));
    },

    // Show a stored receipt inside the app.
    // iOS Safari — especially an installed PWA — blocks window.open(), which is why
    // the old popup viewer failed. This renders an in-app overlay instead.
    _current: null,

    view(id) {
        this.get(id)
            .then(dataUrl => {
                if (!dataUrl) { alert('That receipt photo is no longer stored.'); return; }
                // Grab the blob up front so Save can call share() straight from the tap,
                // without an await in between that would break the user-gesture chain.
                return fetch(dataUrl)
                    .then(r => r.blob())
                    .then(blob => { this._current = { id, dataUrl, blob }; this._showOverlay(dataUrl); })
                    .catch(() => { this._current = { id, dataUrl, blob: null }; this._showOverlay(dataUrl); });
            })
            .catch(() => alert('Could not load that receipt photo.'));
    },

    _showOverlay(dataUrl) {
        let el = document.getElementById('photo-viewer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'photo-viewer';
            document.body.appendChild(el);
        }
        el.className = 'photo-viewer';
        el.innerHTML =
            '<div class="pv-bar">' +
                '<button type="button" class="pv-btn" onclick="Photos.closeViewer()">Close</button>' +
                '<span class="pv-hint">Press and hold the image to save it</span>' +
                '<button type="button" class="pv-btn pv-primary" onclick="Photos.saveImage()">Save</button>' +
            '</div>' +
            '<div class="pv-body"><img src="' + dataUrl + '" alt="Receipt"></div>';
        el.style.display = 'flex';
        el.onclick = e => { if (e.target === el || e.target.classList.contains('pv-body')) this.closeViewer(); };
        document.body.style.overflow = 'hidden';
        this._escHandler = e => { if (e.key === 'Escape') this.closeViewer(); };
        document.addEventListener('keydown', this._escHandler);
    },

    closeViewer() {
        const el = document.getElementById('photo-viewer');
        if (el) el.style.display = 'none';
        document.body.style.overflow = '';
        if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
        this._current = null;
    },

    // Hand the image to the OS share sheet (iOS: "Save Image" / "Save to Files"),
    // falling back to a plain download where sharing files is unsupported.
    saveImage() {
        const cur = this._current;
        if (!cur) return;
        const name = 'receipt-' + (cur.id || 'image') + '.jpg';
        if (cur.blob && typeof File === 'function' && navigator.canShare) {
            try {
                const file = new File([cur.blob], name, { type: 'image/jpeg' });
                if (navigator.canShare({ files: [file] })) {
                    navigator.share({ files: [file], title: 'Receipt' }).catch(() => {});
                    return;
                }
            } catch (e) { /* fall through to download */ }
        }
        const blob = cur.blob || null;
        const href = blob ? URL.createObjectURL(blob) : cur.dataUrl;
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (blob) setTimeout(() => URL.revokeObjectURL(href), 1000);
    }
};
