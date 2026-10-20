import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestShotFor, chooseBestShot, recipeWithBestGrind } from '../public/js/best-shot.js';
import { setupRecipe } from '../public/js/brew-setup.js';

const setup = { basketId: 'pullman-15', dose: 16, ratio: 2, grind: '8', brewTemperature: 200, temperatureUnit: 'F', profileUsed: 'manual', tampForceLb: 25 };
const shot = (id, overrides = {}) => ({ id, beanId: 'bag', machineId: 'elizabeth', roastDate: '2026-10-01', basketId: 'pullman-15', grind: '6.2', dose: '16', yield: '32', time: '30', date: '2026-10-10T12:00:00Z', ...overrides });
const bean = { id: 'bag', roastLevel: 'Medium', currentRoastDate: '2026-10-01', brewSetups: { elizabeth: setup } };

describe('automatic best shot grind', () => {
    it('prefers confirmed balanced taste over an unassessed shot closer to target', () => {
        const balanced = shot('balanced', { taste: 'balanced', yield: '33' });
        const unknown = shot('unknown');
        assert.equal(chooseBestShot([unknown, balanced], 'Medium').shot, balanced);
    });

    it('prefers recipe range, then the ratio closest to the saved target, over the latest shot', () => {
        const closest = shot('closest', { grind: '6.1', yield: '33', taste: 'balanced' });
        const latest = shot('latest', { grind: '7', yield: '34', taste: 'balanced', date: '2026-10-11T12:00:00Z' });
        const outOfRange = shot('fast', { yield: '32', time: '15', taste: 'balanced' });
        assert.equal(bestShotFor(bean, [latest, outOfRange, closest], 'elizabeth').shot, closest);
        const longerTarget = { ...bean, brewSetups: { elizabeth: { ...setup, ratio: 2.125 } } };
        assert.equal(bestShotFor(longerTarget, [closest, latest], 'elizabeth').shot, latest);
    });

    it('uses the newest shot to break quality and ratio ties regardless of fetch order', () => {
        const older = shot('older', { date: { seconds: 1791547200 } });
        const newer = shot('newer', { date: new Date('2026-10-11T12:00:00Z') });
        assert.equal(chooseBestShot([older, newer], 'Medium').shot, newer);
    });

    it('never promotes sour, bitter, channeling or incomplete shots over a successful one', () => {
        const good = shot('good');
        const bad = ['sour', 'bitter', 'astringent', 'hollow', 'channeling'].map(taste => shot(taste, { taste }));
        bad.push(shot('uneven', { taste: 'balanced', channelingObserved: true }), shot('incomplete', { grind: '' }));
        assert.equal(chooseBestShot([...bad, good], 'Medium').shot, good);
        assert.equal(chooseBestShot([shot('incomplete', { time: '' })], 'Medium'), null);
    });

    it('resumes the latest complete shot when nothing is successful without replacing a saved grind', () => {
        const older = shot('older', { taste: 'sour' });
        const latest = shot('latest', { taste: 'bitter', date: '2026-10-12T12:00:00Z' });
        assert.deepEqual(chooseBestShot([older, latest], 'Medium'), { shot: latest, status: 'Resume' });
        const recipe = setupRecipe(setup);
        assert.equal(recipeWithBestGrind(bean, [older, latest], 'elizabeth', recipe), recipe);
    });

    it('keeps other bags, batches, machines, baskets and materially different doses out', () => {
        const mismatches = [{ beanId: 'other' }, { roastDate: '2026-09-01' }, { machineId: 'bianca' }, { basketId: 'stock-elizabeth' }, { basketId: '' }, { dose: '19' }];
        for (const mismatch of mismatches) assert.equal(bestShotFor(bean, [shot('mismatch', mismatch)], 'elizabeth'), null);
        assert.equal(bestShotFor({ ...bean, id: 'new-bag' }, [shot('old')], 'elizabeth'), null);
    });

    it('preserves dose/ratio targets and blank measured results while carrying the best grind forward', () => {
        const best = shot('best', { grind: 0, dose: '16.5', yield: '33', taste: 'balanced' });
        const recipe = recipeWithBestGrind(bean, [best], 'elizabeth', setupRecipe(setup));
        assert.equal(recipe.shot.grind, '0');
        assert.equal(recipe.bestShotId, 'best');
        assert.equal(recipe.shot.dose, '16');
        assert.equal(recipe.shot.yield, '32');
        assert.equal(recipe.shot.time, '');
        assert.equal(setup.grind, '8');
    });

    it('uses 1:2 without a saved setup and accepts equivalent historical date and machine labels', () => {
        const best = shot('best', { machineId: undefined, roastDate: '10/1/26', basketId: '' });
        const recipe = recipeWithBestGrind({ ...bean, brewSetups: {} }, [shot('other', { yield: '34' }), best], 'elizabeth', null);
        assert.equal(recipe.shot, best);
        assert.equal(recipe.status, 'Best');
        assert.equal(recipe.shot.basketId, '');
    });
});
