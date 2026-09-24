const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('src/main/resources/static/js/brewstead-data.js', 'utf8');
function client(fetch, overrides = {}) {
    const context = { window: {}, fetch, AbortController, setTimeout, clearTimeout, ...overrides };
    vm.runInNewContext(source, context);
    return context.window.BrewsteadData;
}
function response(body, status = 200) {
    return { ok: status < 400, status, redirected: false,
        headers: { get: () => 'application/json' }, json: async () => body };
}

test('GET, POST and account updates report expired sessions consistently', async () => {
    for (const status of [401, 403]) {
        const data = client(async () => response({}, status));
        for (const operation of [() => data.get('/test'), () => data.postJson('/test', {}, {}),
            () => data.saveAccount({}, {})]) {
            await assert.rejects(operation, error => error.sessionExpired === true);
        }
    }
});

test('refresh caches only static catalogs and identity; gameplay remains fresh', async () => {
    const calls = [];
    const data = client(async url => {
        calls.push(url);
        if (url === '/api/account/me') return response({ id: 12 });
        if (url.endsWith('/state')) return response({ player: { id: 12 } });
        return response([]);
    });
    await data.load();
    await data.load();
    for (const path of ['/api/account/me', '/api/catalog/crops', '/api/catalog/ingredients']) {
        assert.equal(calls.filter(url => url === path).length, 1, path);
    }
    for (const path of ['/api/progression', '/api/players/12/state', '/api/player-orders/market']) {
        assert.equal(calls.filter(url => url === path).length, 2, path);
    }
    assert.ok(calls.indexOf('/api/progression') < calls.indexOf('/api/players/12/state'));
});

test('market failure is surfaced instead of silently displaying an empty market', async () => {
    const data = client(async url => {
        if (url === '/api/account/me') return response({ id: 12 });
        if (url.endsWith('/state')) return response({ player: { id: 12 } });
        return response([], url.endsWith('/market') ? 500 : 200);
    });
    await assert.rejects(() => data.load(), /500/);
});

test('a failed catalog is retried on the next refresh', async () => {
    let failures = 1;
    let crops = 0;
    const data = client(async url => {
        if (url === '/api/account/me') return response({ id: 12 });
        if (url.endsWith('/state')) return response({ player: { id: 12 } });
        if (url.endsWith('/crops')) {
            crops++;
            if (failures--) return response({}, 503);
        }
        return response([]);
    });
    await assert.rejects(() => data.load(), /503/);
    await data.load();
    assert.equal(crops, 2);
});

test('a stalled request times out and releases the interface for retry', async () => {
    const data = client((url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
    }), { setTimeout: callback => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} });
    await assert.rejects(() => data.postJson('/api/tavern/chat', { body: 'Bonjour' }, {}), /trop de temps/);
});

function etat(overrides = {}) {
    return {
        fields: [{ id: 1, status: 'EMPTY' }, { id: 2, status: 'EMPTY' }],
        batches: [],
        progression: { achievements: [] },
        ...overrides
    };
}
function haut(code, progress) {
    return { code, progress, target: 1, unlocked: progress >= 1 };
}

test('a newcomer has four first steps ahead, starting with sowing', () => {
    const pas = client(async () => response({})).premiersPas(etat());
    assert.deepEqual(Array.from(pas.etapes, e => e.id), ['semer', 'recolter', 'brasser', 'livrer']);
    assert.equal(pas.faites, 0);
    assert.equal(pas.courante, 0);
    assert.equal(pas.fini, false);
});

test('first steps read the server counters, not the moment', () => {
    const data = client(async () => response({}));
    // Une parcelle qui pousse : semer est fait, récolter pas encore.
    let pas = data.premiersPas(etat({ fields: [{ id: 1, status: 'GROWING' }] }));
    assert.deepEqual(Array.from(pas.etapes, e => e.fait), [true, false, false, false]);
    assert.equal(pas.courante, 1);

    // Tout récolté puis resemé nulle part : les champs sont vides, mais le
    // compteur du serveur garde la trace des deux premiers gestes.
    pas = data.premiersPas(etat({ progression: { achievements: [haut('FIRST_HARVEST', 3)] } }));
    assert.deepEqual(Array.from(pas.etapes, e => e.fait), [true, true, false, false]);

    // Les gestes peuvent se faire dans le désordre : le stock de départ
    // permet de brasser avant la première moisson.
    pas = data.premiersPas(etat({ batches: [{ id: 4, status: 'FERMENTING' }] }));
    assert.deepEqual(Array.from(pas.etapes, e => e.fait), [false, false, true, false]);
    assert.equal(pas.courante, 0);
});

test('the loop is complete once a delivery has been made', () => {
    const pas = client(async () => response({})).premiersPas(etat({
        fields: [{ id: 1, status: 'READY' }],
        progression: { achievements: [haut('FIRST_HARVEST', 1), haut('FIRST_BREW', 1), haut('TRUSTED_SUPPLIER', 1)] }
    }));
    assert.equal(pas.faites, 4);
    assert.equal(pas.courante, null);
    assert.equal(pas.fini, true);
});

test('a honey harvest or a trade with a neighbour counts too', () => {
    const pas = client(async () => response({})).premiersPas(etat({
        progression: { achievements: [haut('HONEY_KEEPER', 1), haut('GOOD_NEIGHBOUR', 1)] }
    }));
    assert.equal(pas.etapes[1].fait, true);
    assert.equal(pas.etapes[3].fait, true);
});

test('a state without progression is read as a fresh start, not an error', () => {
    const pas = client(async () => response({})).premiersPas({ fields: [], batches: [] });
    assert.equal(pas.faites, 0);
    assert.equal(pas.courante, 0);
});
