// ═══════════════════════════════════════════════════════════════════
// SW.CHECK.JS — the service worker's fetch handling, on its own.
//
//   node sw.check.js
//
// checks.html can't reach this: it runs the app in an iframe, where the worker is
// not in play. Runs the real sw.js against a fake network and cache, so "one bar of
// signal on the highway" is a repeatable test rather than a drive to Riyadh.
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORIGIN = 'https://app.test';
const SLOW_MS = 4000;

function worker({ network, cached }) {
    const store = new Map(Object.entries(cached));
    const listeners = {};
    const pending = [];
    const sandbox = {
        URL, Response, setTimeout, clearTimeout, console, Promise,
        location: { origin: ORIGIN },
        self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: { claim() {} } },
        fetch: req => network(req.url),
        caches: {
            match: async req => {
                const key = typeof req === 'string' ? `${ORIGIN}/${req.replace('./', '')}` : req.url;
                return store.get(key);
            },
            open: async () => ({ put: async (req, res) => { store.set(req.url, res); } }),
            keys: async () => [], delete: async () => true
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), sandbox);
    const get = url => new Promise((resolve, reject) => {
        const started = Date.now();
        listeners.fetch({
            request: { method: 'GET', url },
            waitUntil: p => pending.push(p),
            respondWith: p => Promise.resolve(p).then(res => resolve({ res, ms: Date.now() - started }), reject)
        });
    });
    return { get, store, settled: () => Promise.all(pending) };
}

const page = (body, ok = true) => new Response(body, { status: ok ? 200 : 500 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const url = `${ORIGIN}/app.js`;
let failed = 0;
const check = (name, cond, detail) => {
    console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${cond ? '' : `  (${detail})`}`);
    if (!cond) failed++;
};

(async () => {
    {
        const w = worker({ network: async () => page('new'), cached: { [url]: page('old') } });
        const { res } = await w.get(url);
        await w.settled();
        await wait(10);
        check('a good connection serves the latest version', await res.text() === 'new');
        check('and refreshes the saved copy', await w.store.get(url).clone().text() === 'new');
    }
    {
        const w = worker({ network: () => wait(SLOW_MS).then(() => page('new')), cached: { [url]: page('old') } });
        const { res, ms } = await w.get(url);
        check('a weak signal opens from the saved copy', await res.text() === 'old');
        check('without the long wait', ms < 3000, `${ms} ms`);
        await w.settled();
        await wait(10);
        check('and the slow download still updates it for next time', await w.store.get(url).clone().text() === 'new');
    }
    {
        const w = worker({ network: () => wait(SLOW_MS).then(() => page('new')), cached: {} });
        const { res, ms } = await w.get(url);
        check('with nothing saved it waits for the network', await res.text() === 'new' && ms >= SLOW_MS - 100, `${ms} ms`);
    }
    {
        const w = worker({ network: () => Promise.reject(new Error('offline')), cached: { [url]: page('old') } });
        const { res, ms } = await w.get(url);
        check('no signal opens straight away', await res.text() === 'old' && ms < 200, `${ms} ms`);
    }
    {
        const w = worker({
            network: () => Promise.reject(new Error('offline')),
            cached: { [`${ORIGIN}/index.html`]: page('shell') }
        });
        const { res } = await w.get(`${ORIGIN}/never-seen`);
        check('no signal and no copy falls back to the app', await res.text() === 'shell');
    }
    {
        const w = worker({ network: () => Promise.reject(new Error('offline')), cached: {} });
        const { res } = await w.get(`${ORIGIN}/never-seen`);
        check('nothing at all fails cleanly instead of hanging', res.type === 'error');
    }
    console.log(failed ? `\n${failed} failed` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
