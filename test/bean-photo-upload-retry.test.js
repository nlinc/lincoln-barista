import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { saveBeanPhotoChange } from '../public/js/bean-photo-save.js';

const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
function controller() {
    const uploads = [], removed = [];
    const app = { uploadBeanImage: async (beanId, image) => {
        const fields = { image: null, imageUrl: `photo-${uploads.length}`, imagePath: `users/qa/beans/${beanId}/photo-${uploads.length}.jpg` };
        uploads.push({ beanId, image, fields });
        return fields;
    } };
    const context = { app, currentUser: { uid: 'qa' }, currentEditingImage: 'data:image/jpeg;base64,one',
        currentEditingImagePath: null, currentEditingPhotoUpload: null, isDataUrl: value => value?.startsWith('data:'),
        document: { getElementById: () => ({ classList: { add() {} } }) } };
    for (const [startName, endName] of [['prepareBeanImageFields:', 'migrateLegacyImages:'], ['removeImage:', 'resetBeanForm:']]) {
        const start = source.indexOf(`    ${startName}`), end = source.indexOf(`    ${endName}`, start);
        Object.assign(app, vm.runInNewContext('({' + source.slice(start, end) + '})', context));
    }
    return { app, context, uploads, removed };
}

test('rejected or ambiguous record saves retry the same replacement without another upload', async () => {
    for (const acknowledged of [false, true]) {
        const { app, uploads, removed } = controller();
        const original = { imagePath: 'original.jpg', imageUrl: 'original-url' };
        let stored = original.imagePath;
        const first = await app.prepareBeanImageFields('bag', original);
        await assert.rejects(saveBeanPhotoChange({ previousPath: original.imagePath, nextPath: first.imagePath,
            save: async () => { if (acknowledged) stored = first.imagePath; throw Error('Synthetic lost acknowledgement'); },
            removePhoto: async path => removed.push(path) }), /lost acknowledgement/);
        assert.deepEqual(removed, []);
        assert.equal(stored, acknowledged ? first.imagePath : original.imagePath);
        const retry = await app.prepareBeanImageFields('bag', original);
        assert.equal(uploads.length, 1);
        assert.equal(retry.imagePath, first.imagePath);
        assert.equal(retry.imageUrl, first.imageUrl);
        await saveBeanPhotoChange({ previousPath: original.imagePath, nextPath: retry.imagePath,
            save: async () => { stored = retry.imagePath; }, removePhoto: async path => removed.push(path) });
        assert.equal(stored, first.imagePath);
        assert.deepEqual(removed, ['original.jpg']);
    }
});

test('changed image, bag or owner cannot reuse the previous upload', async () => {
    for (const change of ['image', 'bag', 'owner']) {
        const { app, context, uploads } = controller();
        await app.prepareBeanImageFields('bag', {});
        if (change === 'image') context.currentEditingImage = 'data:image/jpeg;base64,two';
        if (change === 'owner') context.currentUser = { uid: 'another-owner' };
        await app.prepareBeanImageFields(change === 'bag' ? 'another-bag' : 'bag', {});
        assert.equal(uploads.length, 2);
    }
});

test('an upload failure remains retryable and is never treated as a completed upload', async () => {
    const { app, uploads } = controller(), upload = app.uploadBeanImage;
    let attempts = 0;
    app.uploadBeanImage = async (...args) => { if (++attempts === 1) throw Error('Synthetic upload failure'); return upload(...args); };
    await assert.rejects(app.prepareBeanImageFields('bag', {}), /upload failure/);
    const result = await app.prepareBeanImageFields('bag', {});
    assert.equal(attempts, 2);
    assert.equal(uploads.length, 1);
    assert.equal(result.imagePath, uploads[0].fields.imagePath);
});

test('removing the photo forgets successful upload reuse without deleting storage', async () => {
    const { app, context, uploads } = controller();
    await app.prepareBeanImageFields('bag', {});
    app.removeImage();
    assert.equal((await app.prepareBeanImageFields('bag', {})).imagePath, null);
    context.currentEditingImage = 'data:image/jpeg;base64,one';
    await app.prepareBeanImageFields('bag', {});
    assert.equal(uploads.length, 2);
});

test('a late upload cannot repopulate reuse after the form photo was cleared', async () => {
    const { app, context, uploads } = controller(), upload = app.uploadBeanImage;
    const pending = Promise.withResolvers();
    app.uploadBeanImage = async (...args) => { await pending.promise; return upload(...args); };
    const first = app.prepareBeanImageFields('bag', {});
    app.removeImage();
    pending.resolve();
    await first;
    context.currentEditingImage = 'data:image/jpeg;base64,one';
    await app.prepareBeanImageFields('bag', {});
    assert.equal(uploads.length, 2);
});
