import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shotNormalizationPatch } from '../public/js/shot-record.js';

describe('historical shot normalization', () => {
    it('preserves retired stars and date formatting without inferring taste or changing measured results', () => {
        const shot = { id: 'shot', beanId: 'bag', rating: 0, roastDate: '1/12/26', dose: '18', yield: '36', time: '30', grind: '14', date: new Date() };
        const patch = shotNormalizationPatch(shot);
        assert.deepEqual(patch.fields, { machineId: 'elizabeth', roastDate: '2026-01-12', legacy: { rating: 0, roastDate: '1/12/26' } });
        assert.deepEqual(patch.remove, ['rating']);
        const migrated = { ...shot, ...patch.fields };
        patch.remove.forEach(field => delete migrated[field]);
        for (const field of ['id', 'beanId', 'dose', 'yield', 'time', 'grind', 'date']) assert.equal(migrated[field], shot[field]);
        assert.equal(migrated.taste, undefined);
        assert.deepEqual(shotNormalizationPatch(migrated), { fields: {}, remove: [], issues: [] });
    });

    it('retains unknown dates, explicit machines, and conflicting legacy values for review', () => {
        const patch = shotNormalizationPatch({ machineId: 'bianca', roastDate: 'Unknown', rating: 4, legacy: { rating: 3 } });
        assert.deepEqual(patch.fields, {});
        assert.deepEqual(patch.remove, []);
        assert.equal(patch.issues.length, 1);
    });
});
