import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bagBrewSetup, basketFor, normalizeBrewSetup, setupRecipe } from '../public/js/brew-setup.js';
import { reusableBeanDetails } from '../public/js/bean-catalog-view.js';

const saved = { basketId: 'pullman-15', dose: 16, ratio: 2.1, grind: '7.3', brewTemperature: 200, temperatureUnit: 'F', profileUsed: 'manual', tampForceLb: 25 };

describe('repeatable bag setup', () => {
    it('scopes routines by bag and machine without inferring one from old shots', () => {
        const bean = { brewSetups: { elizabeth: saved, bianca: { ...saved, dose: 17, profileUsed: 'bianca-standard' } } };
        assert.equal(bagBrewSetup(bean, 'elizabeth').dose, 16);
        assert.equal(bagBrewSetup(bean, 'bianca').dose, 17);
        assert.equal(bagBrewSetup({}, 'elizabeth'), null);
        assert.equal(basketFor('stock-bianca', 'elizabeth'), undefined);
        assert.equal(bagBrewSetup({ brewSetups: { elizabeth: { ...saved, basketId: 'stock-bianca' } } }, 'elizabeth'), null);
    });
    it('keeps recipe targets separate from measured results', () => {
        const recipe = setupRecipe(saved);
        assert.equal(recipe.status, 'Saved');
        assert.equal(recipe.shot.dose, '16');
        assert.equal(recipe.shot.yield, '33.6');
        assert.equal(recipe.shot.time, '');
        assert.equal(saved.ratio, 2.1);
        assert.equal(saved.yield, undefined);
    });
    it('validates bounded values and does not transfer a bag setup to a new bag', () => {
        for (const fields of [{ dose: 0 }, { ratio: 5 }, { ratio: true }, { tampForceLb: 101 }, { brewTemperature: 400 }, { grind: 'bad' }, { profileUsed: 'bianca-paddle' }, { temperatureUnit: 'bad' }]) {
            assert.equal(normalizeBrewSetup({ ...saved, ...fields }, 'elizabeth'), null);
        }
        assert.equal(normalizeBrewSetup({ ...saved, grind: '', brewTemperature: null, tampForceLb: null }, 'elizabeth').tampForceLb, null);
        const copied = reusableBeanDetails({ name: 'Coffee', brewSetups: { elizabeth: saved }, startingMeasurement: { weight: 16, volume: 50 } });
        assert.equal(copied.brewSetups, undefined);
        assert.equal(copied.startingMeasurement, undefined);
    });
});
