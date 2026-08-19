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

    // Open a stored receipt in a viewer window
    view(id) {
        this.get(id).then(dataUrl => {
            if (!dataUrl) return alert('That receipt photo is no longer stored.');
            const w = window.open('', '_blank');
            if (!w) return alert('Please allow pop-ups to view the receipt.');
            w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
                body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}
                img{max-width:100%;max-height:100vh;object-fit:contain}
            </style></head><body><img src="${dataUrl}" alt="Receipt"></body></html>`);
            w.document.close();
        }).catch(() => alert('Could not load that receipt photo.'));
    }
};
