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
