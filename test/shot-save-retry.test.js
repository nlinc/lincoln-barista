import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { validateShot } from '../public/js/shot-analytics.js';

const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../public/js/shot-repository.js', import.meta.url), 'utf8');
function controller({ write, grind } = {}) {
    const nodes = new Map();
    const document = { getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { value: '', textContent: 'Save Shot', disabled: false,
            checkValidity: () => true, reportValidity() {}, closest: () => ({ open: false }) });
        return nodes.get(id);
    } };
    const values = { 'input-log-bean-id': 'bag', 'input-shot-grind': '6.2', 'input-shot-time': '30',
        'input-shot-dose': '16', 'input-shot-yield': '32', 'input-shot-profile': 'p1', 'input-shot-basket': 'pullman-15' };
    for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value;
    const written = new Map(), attempts = [], errors = [], cache = [];
    let allocated = 0;
    const app = { upsertCachedLog: log => { const i = cache.findIndex(x => x.id === log.id); if (i < 0) cache.push(log); else cache[i] = log; },
        loadBeanDetail: async () => {} };
    const context = { app, document, currentUser: { uid: 'owner' }, currentActiveBean: { currentRoastDate: '2026-10-01' },
        logsCache: cache, allLogsCache: cache, catalogBeans: [], newShotDraft: null, shotFormGeneration: 0, shotValidationShown: false,
        activeMachineId: () => 'elizabeth', activeMachineProfile: () => ({ temperatureUnit: 'F' }), recordMachineId: x => x?.machineId || 'elizabeth',
        createShotId: () => `shot-${++allocated}`, validateShot, haptic() {}, renderShotFieldErrors() {},
        renderShotSaveError: error => { if (error) errors.push(error); },
        createShot: async (id, data) => {
            // Model the baseline auto-ID interface as well as the stable-ID correction.
            if (data === undefined) { data = id; id = `shot-${++allocated}`; }
            attempts.push({ id, data: { ...data } });
            await write?.('before', id, data);
            written.set(id, { ...written.get(id), ...data });
            await write?.('after', id, data);
            return id;
        },
        updateShot: async (id, data) => { written.set(id, { ...written.get(id), ...data }); },
        saveBeanBestGrind: async () => { await grind?.(); return null; } };
    for (const [name, endName] of [['saveShot', 'openEditShot'], ['resetShotErrors', 'openLogShot']]) {
        const start = source.indexOf(`    ${name}:`), end = source.indexOf(`    ${endName}:`, start);
        app[name] = vm.runInNewContext('({' + source.slice(start, end) + '})', context)[name];
    }
    return { app, context, document, written, attempts, errors, allocated: () => allocated };
}

test('a committed shot with lost acknowledgement retries one ID and original date', async () => {
    let first = true;
    const c = controller({ write: async stage => { if (stage === 'after' && first) { first = false; throw Error('Acknowledgement lost'); } } });
    await c.app.saveShot();
    c.document.getElementById('input-shot-yield').value = '33';
    c.context.currentActiveBean.currentRoastDate = '2026-10-27';
    await c.app.saveShot();
    assert.equal(c.written.size, 1);
    assert.equal(c.allocated(), 1);
    assert.equal(c.attempts[0].data.date, c.attempts[1].data.date);
    assert.equal(c.written.get('shot-1').yield, '33');
    assert.equal(c.written.get('shot-1').roastDate, '2026-10-01');
    assert.equal(c.errors.length, 1);
});

test('a rejected shot create retries its draft without claiming an acknowledged shot', async () => {
    let reject = true;
    const c = controller({ write: async stage => { if (stage === 'before' && reject) throw Error('Rejected'); } });
    await c.app.saveShot();
    assert.equal(c.written.size, 0);
    assert.equal(c.document.getElementById('input-log-shot-id').value, '');
    reject = false;
    await c.app.saveShot();
    assert.equal(c.allocated(), 1);
    assert.equal(c.written.size, 1);
    assert.equal(c.document.getElementById('input-log-shot-id').value, 'shot-1');
});

test('a best-grind failure after acknowledgement retries the same recorded shot', async () => {
    let first = true;
    const c = controller({ grind: async () => { if (first) { first = false; throw Error('Grind unavailable'); } } });
    await c.app.saveShot();
    await c.app.saveShot();
    assert.equal(c.allocated(), 1);
    assert.equal(c.written.size, 1);
    assert.match(c.errors[0], /Shot saved/);
});

test('resetting or changing owner starts a new draft; late completion cannot adopt it', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let first = true;
    const c = controller({ write: async stage => { if (stage === 'after' && first) { first = false; await gate; } } });
    const old = c.app.saveShot();
    c.app.resetShotErrors();
    c.document.getElementById('input-log-shot-id').value = '';
    c.context.currentUser = { uid: 'next-owner' };
    release(); await old;
    assert.equal(c.document.getElementById('input-log-shot-id').value, '');
    await c.app.saveShot();
    assert.equal(c.allocated(), 2);
    assert.equal(c.written.get('shot-2').uid, 'next-owner');
});

test('retrying repository create preserves unrelated fields on an existing shot', async () => {
    const start = repository.indexOf('export const createShot ='), end = repository.indexOf('\n\n', start);
    const documents = new Map([['shot-1', { uid: 'owner', retained: 'value' }]]);
    const context = { db: {}, doc: (_db, _name, id) => id, collection: () => ({}),
        addDoc: async (_ref, data) => { documents.set('auto-id', data); return { id: 'auto-id' }; },
        setDoc: async (id, data, options) => { assert.equal(options?.merge, true); documents.set(id, { ...documents.get(id), ...data }); } };
    const createShot = vm.runInNewContext(repository.slice(start, end).replace('export const ', 'const ') + '; createShot', context);
    await createShot('shot-1', { uid: 'owner', time: '30' });
    assert.equal(documents.size, 1);
    assert.equal(documents.get('shot-1').retained, 'value');
});


test('invalid measurements do not reserve a draft or write a shot', async () => {
    const c = controller();
    c.document.getElementById('input-shot-yield').value = '';
    await c.app.saveShot();
    assert.equal(c.allocated(), 0);
    assert.equal(c.written.size, 0);
    assert.equal(c.context.newShotDraft, null);
});

test('a second save activation during an in-flight write does not create again', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const c = controller({ write: async stage => { if (stage === 'before') await gate; } });
    const pending = c.app.saveShot();
    await c.app.saveShot();
    release(); await pending;
    assert.equal(c.attempts.length, 1);
    assert.equal(c.written.size, 1);
    assert.equal(c.allocated(), 1);
});
