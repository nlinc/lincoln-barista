import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { saveBeanPhotoChange } from '../public/js/bean-photo-save.js';
import { normalizeBeanRecord } from '../public/js/bean-record.js';

const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const repositorySource = readFileSync(new URL('../public/js/bean-repository.js', import.meta.url), 'utf8');

function controller({ write } = {}) {
    const nodes = new Map();
    const document = { getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, innerText: '', open: false,
            classList: { add() {}, remove() {} } });
        return nodes.get(id);
    } };
    document.getElementById('input-name').value = 'Synthetic bag';
    document.getElementById('input-roaster').value = 'Synthetic roaster';
    const written = new Map();
    const ids = [];
    const uploads = [];
    const alerts = [];
    const app = {
        uploadBeanImage: async beanId => {
            uploads.push(beanId);
            return { image: null, imageUrl: `photo:${beanId}`, imagePath: `users/owner/beans/${beanId}/photo.jpg` };
        },
        deleteStoredImage() {}, fetchBeans: async () => {}, router() {},
        renderEditingTags() {}, removeImage() {}, setBeanImpression() {}, renderBeanSuggestions() {}, updateBeanMatchHint() {}
    };
    const context = { document, app, currentUser: { uid: 'owner' }, catalogBeans: [], currentEditingTags: [],
        currentEditingImage: 'data:image/jpeg;base64,AA==', currentEditingImagePath: null,
        currentEditingPhotoUpload: null, newBeanDraft: null, beanFormGeneration: 0, collectionScope: 'current', collectionNotice: null,
        createBeanId: () => { const id = `bag-${ids.length + 1}`; ids.push(id); return id; },
        createBean: async (id, data) => { written.set(id, data); await write?.(id, data); },
        updateBean: async () => { throw new Error('Unexpected update'); },
        cleanCatalogText: value => value.trim(), normalizeBeanTags: value => value, saveBeanPhotoChange,
        isDataUrl: value => value?.startsWith('data:'), haptic() {}, alert: message => alerts.push(message) };
    for (const [name, endName] of [['prepareBeanImageFields', 'migrateLegacyImages'], ['saveBean', 'deleteBean'], ['resetBeanForm', 'setBeanImpression']]) {
        const start = source.indexOf(`    ${name}:`);
        const end = source.indexOf(`    ${endName}:`, start);
        app[name] = vm.runInNewContext('({' + source.slice(start, end) + '})', context)[name];
    }
    return { app, context, document, written, ids, uploads, alerts };
}

test('an unacknowledged new-bag write retries the same bag and photo upload', async () => {
    let first = true;
    const attempts = [];
    const { app, written, ids, uploads, alerts } = controller({ write: async () => {
        attempts.push(written.get('bag-1'));
        if (first) { first = false; throw new Error('Acknowledgement lost'); }
    } });
    await app.saveBean();
    await app.saveBean();
    assert.deepEqual([...written.keys()], ['bag-1']);
    assert.deepEqual(ids, ['bag-1']);
    assert.deepEqual(uploads, ['bag-1']);
    assert.equal(attempts[0].createdAt, attempts[1].createdAt);
    assert.deepEqual(alerts, ['Acknowledgement lost']);
});

test('an acknowledged create remains one bag when the following collection fetch fails', async () => {
    const { app, written, ids } = controller();
    let fetches = 0;
    app.fetchBeans = async () => { fetches++; if (fetches === 1) throw new Error('Collection unavailable'); };
    await app.saveBean();
    await app.saveBean();
    assert.deepEqual([...written.keys()], ['bag-1']);
    assert.deepEqual(ids, ['bag-1']);
    assert.equal(fetches, 2);
});

test('rejected writes reuse the draft, while reset and owner change start new drafts', async () => {
    let reject = true;
    const { app, context, document, ids } = controller({ write: async () => {
        if (reject) throw new Error('Rejected');
    } });
    await app.saveBean();
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1']);
    app.resetBeanForm();
    document.getElementById('input-name').value = 'Next bag';
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1', 'bag-2']);
    context.currentUser = { uid: 'next-owner' };
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1', 'bag-2', 'bag-3']);
    reject = false;
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1', 'bag-2', 'bag-3']);
    app.resetBeanForm();
    document.getElementById('input-name').value = 'Another bag';
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1', 'bag-2', 'bag-3', 'bag-4']);
});

test('the first createdAt survives retry and an in-flight reset cannot save the old form', async () => {
    let releaseUpload;
    const gate = new Promise(resolve => { releaseUpload = resolve; });
    const { app, context, document, written, ids } = controller();
    const originalUpload = app.uploadBeanImage;
    app.uploadBeanImage = async (...args) => { await gate; return originalUpload(...args); };
    const pending = app.saveBean();
    const createdAt = context.newBeanDraft.createdAt;
    app.resetBeanForm();
    document.getElementById('input-name').value = 'Different bag';
    releaseUpload();
    await pending;
    assert.equal(written.size, 0);
    await app.saveBean();
    assert.deepEqual(ids, ['bag-1', 'bag-2']);
    assert.notEqual(written.get('bag-2').createdAt, createdAt);
});

test('a retrying create merges into the same document without erasing later bag fields', async () => {
    const start = repositorySource.indexOf('export const createBean =');
    const end = repositorySource.indexOf('\n\n', start);
    const documents = new Map();
    const context = { db: {}, doc: (_db, _collection, id) => id, normalizeBeanRecord,
        setDoc: async (id, data, options) => {
            assert.equal(options?.merge, true);
            documents.set(id, { ...documents.get(id), ...data });
        } };
    const createBean = vm.runInNewContext(repositorySource.slice(start, end).replace('export const ', 'const ') + '; createBean', context);
    const createdAt = new Date('2026-10-26T00:00:00Z');
    await createBean('bag-1', { uid: 'owner', name: 'Synthetic bag', createdAt });
    documents.set('bag-1', { ...documents.get('bag-1'), brewSetups: { elizabeth: { grind: '6.2' } },
        startingMeasurement: { weight: 18 }, archived: true, customField: 'retained' });
    await createBean('bag-1', { uid: 'owner', name: 'Synthetic bag', createdAt });
    assert.deepEqual(documents.get('bag-1').brewSetups, { elizabeth: { grind: '6.2' } });
    assert.deepEqual(documents.get('bag-1').startingMeasurement, { weight: 18 });
    assert.equal(documents.get('bag-1').archived, true);
    assert.equal(documents.get('bag-1').customField, 'retained');
    assert.equal(documents.get('bag-1').roastLevel, 'Medium');
    assert.equal(documents.size, 1);
    assert.equal(documents.get('bag-1').createdAt, createdAt);
});
