import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { beanNormalizationPatch, normalizeBeanRecord, normalizeBeanTags, normalizeRoastDate, recordTime, resolveBeanImpression } from '../public/js/bean-record.js';

describe('bean record compatibility', () => {
    it('normalizes descriptive values without changing bag identity, photos, measurements, or timestamps', () => {
        const raw = { id: 'bag', uid: 'owner', name: ' Coffee  blend ', roaster: ' Roaster ', origin: '  Brazil ', roastLevel: 'dark', tags: [' Cocoa ', 'cocoa', '', 'Fruit'], image: 'legacy photo', imagePath: 'photo', startingMeasurement: { volume: 40 }, createdAt: { seconds: 10 } };
        const bean = normalizeBeanRecord(raw);
        assert.equal(bean.name, 'Coffee blend');
        assert.equal(bean.roastLevel, 'Dark');
        assert.deepEqual(bean.tags, ['Cocoa', 'Fruit']);
        for (const field of ['id', 'uid', 'image', 'imagePath', 'startingMeasurement', 'createdAt']) assert.equal(bean[field], raw[field]);
        assert.equal(raw.name, ' Coffee  blend ');
    });

    it('keeps deliberately cleared impressions clear instead of resurrecting old stars', () => {
        assert.equal(resolveBeanImpression({ rating: 5 }), 'enjoyed');
        assert.equal(resolveBeanImpression({ impression: null, rating: 5 }), '');
        assert.equal(resolveBeanImpression({ impression: '', rating: 5 }), '');
        assert.equal(resolveBeanImpression({ impression: 'meh', rating: 5 }), 'meh');
        assert.equal(resolveBeanImpression({ rating: 99 }), '');
    });

    it('handles missing and malformed tags without rendering objects or splitting tasting phrases', () => {
        assert.deepEqual(normalizeBeanTags(null), []);
        assert.deepEqual(normalizeBeanTags('Chocolate, fruit'), []);
        assert.deepEqual(normalizeBeanTags([{}, 5, 'Chocolate, fruit', ' chocolate, FRUIT ']), ['Chocolate, fruit']);
    });

    it('normalizes historical US roast dates and rejects impossible dates', () => {
        assert.equal(normalizeRoastDate('3/23/26'), '2026-03-23');
        assert.equal(normalizeRoastDate('1/12/26'), '2026-01-12');
        assert.equal(normalizeRoastDate('2024-02-29'), '2024-02-29');
        for (const value of ['', null, 'Unknown', '2026-02-30', '13/2/26', 'Feb 30']) assert.equal(normalizeRoastDate(value), '');
        assert.equal(normalizeBeanRecord({ currentRoastDate: '', roastDate: '2025-01-01' }).currentRoastDate, '');
    });

    it('preserves retired measurements and conflicting roast batches under legacy', () => {
        const raw = { rating: 5, fiveBeanWeight: '.5', flavor: { body: '4' }, roastDate: '2025-11-10', currentRoastDate: '2026-01-03' };
        const patch = beanNormalizationPatch(raw);
        assert.equal(patch.fields.impression, 'enjoyed');
        assert.deepEqual(patch.fields.legacy, { rating: 5, roastDate: '2025-11-10', fiveBeanWeight: '.5', flavor: { body: '4' } });
        assert.equal(patch.fields.currentRoastDate, undefined);
        assert.equal(patch.fields.tenBeanWeight, undefined);
        const migrated = { ...raw, ...patch.fields };
        patch.remove.forEach(key => delete migrated[key]);
        assert.deepEqual(beanNormalizationPatch(migrated), { fields: {}, remove: [], issues: [] });
    });

    it('retains original date formatting and refuses conflicting historical values', () => {
        const patch = beanNormalizationPatch({ currentRoastDate: '3/23/26' });
        assert.equal(patch.fields.currentRoastDate, '2026-03-23');
        assert.equal(patch.fields.legacy.currentRoastDate, '3/23/26');
        const conflict = beanNormalizationPatch({ fiveBeanWeight: '1', legacy: { fiveBeanWeight: '.5' } });
        assert.deepEqual(conflict.remove, []);
        assert.equal(conflict.issues.length, 1);
        const dateConflict = beanNormalizationPatch({ currentRoastDate: '3/23/26', legacy: { currentRoastDate: '1/12/26' } });
        assert.equal(dateConflict.fields.currentRoastDate, undefined);
        assert.equal(dateConflict.fields.legacy, undefined);
        assert.equal(dateConflict.issues.length, 1);
    });

    it('sorts timestamps consistently across Firestore, Date, and exported ISO records', () => {
        const iso = '2026-10-09T12:00:00.123Z';
        const ms = Date.parse(iso);
        assert.equal(recordTime(new Date(iso)), ms);
        assert.equal(recordTime(iso), ms);
        assert.equal(recordTime({ seconds: Math.floor(ms / 1000), nanoseconds: 123000000 }), ms);
        assert.equal(recordTime(undefined), 0);
    });
});
