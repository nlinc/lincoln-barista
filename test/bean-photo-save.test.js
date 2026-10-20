import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveBeanPhotoChange } from '../public/js/bean-photo-save.js';

for (const nextPath of [null, 'new-photo.jpg']) {
    test(`a rejected bean save preserves its previous photo when ${nextPath ? 'replacing' : 'removing'} it`, async () => {
        const events = [], failure = new Error('Synthetic record rejection');
        await assert.rejects(saveBeanPhotoChange({
            previousPath: 'original.jpg', nextPath,
            save: async () => { events.push('save'); throw failure; },
            removePhoto: async path => events.push(['delete', path])
        }), error => error === failure);
        assert.deepEqual(events, ['save']);
    });
}

test('cleanup waits for the record commit, then removes only the previous photo', async () => {
    const committed = Promise.withResolvers(), events = [];
    const saving = saveBeanPhotoChange({
        previousPath: 'original.jpg', nextPath: 'replacement.jpg',
        save: () => committed.promise,
        removePhoto: async path => events.push(path)
    });
    await Promise.resolve();
    assert.deepEqual(events, []);
    committed.resolve('saved bean');
    assert.equal(await saving, 'saved bean');
    assert.deepEqual(events, ['original.jpg']);
});

test('a failed attempt can retry removal without deleting the original before a successful save', async () => {
    let reject = true;
    const events = [], options = {
        previousPath: 'original.jpg', nextPath: null,
        save: async () => { events.push('save'); if (reject) throw new Error('Synthetic offline'); },
        removePhoto: async path => events.push(['delete', path])
    };
    await assert.rejects(saveBeanPhotoChange(options), /Synthetic offline/);
    reject = false;
    await saveBeanPhotoChange(options);
    assert.deepEqual(events, ['save', 'save', ['delete', 'original.jpg']]);
});

test('unchanged photos and new bags do not delete stored images', async () => {
    for (const [previousPath, nextPath] of [['same.jpg', 'same.jpg'], [null, 'new.jpg'], [null, null]]) {
        await saveBeanPhotoChange({ previousPath, nextPath, save: async () => {},
            removePhoto: () => assert.fail('No existing photo should be removed') });
    }
});

test('failed storage cleanup does not invalidate a successful bean save', async t => {
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args));
    assert.equal(await saveBeanPhotoChange({
        previousPath: 'original.jpg', nextPath: null,
        save: async () => 'saved',
        removePhoto: async () => { throw new Error('Synthetic storage outage'); }
    }), 'saved');
    assert.equal(warnings.length, 1);
});
