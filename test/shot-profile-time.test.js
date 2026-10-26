import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as form from '../public/js/shot-form-view.js';

const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const profile = { b1: { infusion: 4, bloom: 6, brew: 25 }, b2: { infusion: 5, bloom: 7, brew: 31 }, defaultDose: 16,
    startingPoints: { elizabeth: { ownedBasketIds: [] }, bianca: { ownedBasketIds: [] } } };
function controller(t, { machine = 'elizabeth', selected = 'p1' } = {}) {
    const nodes = new Map();
    const document = { getElementById: id => {
        if (!nodes.has(id)) nodes.set(id, { value: '', dataset: {}, hidden: false, placeholder: '', textContent: '',
            classList: { toggle() {}, add() {}, remove() {} },
            options: ['manual', 'p1', 'p2', 'bianca-standard'].map(value => ({ value, hidden: machine === 'bianca' ? value.startsWith('p') : value.startsWith('bianca') })) });
        return nodes.get(id);
    } };
    const previous = globalThis.document;
    globalThis.document = document;
    t.after(() => { globalThis.document = previous; });
    const app = { resetShotErrors() {}, applyMachineUi() {}, renderExtractionPreview() {}, router() {}, updateGrindSuggestion() {}, grindSuggestion() {} };
    const context = { document, app, userProfile: structuredClone(profile), currentActiveBean: { id: 'bag' }, logsCache: [], currentRecipeShot: null,
        haptic() {}, activeMachineId: () => machine, activeMachineProfile: () => ({ temperatureUnit: 'F', brewTemperature: 200 }),
        bagBrewSetup: () => null, renderShotBaskets() {}, updateTemperatureUnitLabels() {}, convertTemperature: x => x,
        recipeWithBestGrind: () => ({ shot: { profileUsed: selected, dose: 16, yield: 32, time: 19, grind: 6 } }),
        recordMachineId: log => log?.machineId || 'elizabeth', ...form };
    const start = source.indexOf('    openLogShot:');
    const end = source.indexOf('    renderExtractionPreview:', start);
    Object.assign(app, vm.runInNewContext('({' + source.slice(start, end) + '})', context));
    return { app, nodes, document, context };
}

test('a new P1 recipe uses current programmed seconds, not the old shot time', t => {
    const { app, document } = controller(t);
    app.openLogShot();
    assert.equal(document.getElementById('input-shot-profile').value, 'p1');
    assert.equal(String(document.getElementById('input-shot-time').value), '35');
    assert.equal(document.getElementById('input-shot-yield').value, '');
});

test('P2 selection and quick buttons read the current settings each time', t => {
    const { app, document, context } = controller(t, { selected: 'p2' });
    app.openLogShot();
    assert.equal(document.getElementById('input-shot-time').value, '43');
    app.setTimeFromProfile(1);
    assert.equal(document.getElementById('input-shot-time').value, '35');
    context.userProfile.b2.brew = 40;
    document.getElementById('input-shot-profile').value = 'p2';
    app.syncTimeFromProfile();
    assert.equal(document.getElementById('input-shot-time').value, '52');
});

test('manual and Bianca logging do not reuse a historical or Elizabeth time', t => {
    for (const options of [{ selected: 'manual' }, { machine: 'bianca', selected: 'bianca-standard' }, { machine: 'bianca', selected: 'p1' }]) {
        const { app, document } = controller(t, options);
        app.openLogShot();
        assert.equal(document.getElementById('input-shot-time').value, '');
        assert.equal(document.getElementById('shot-time-hint').hidden, true);
    }
});

test('switching to Manual clears an automatic time but preserves a typed override', t => {
    const { app, document } = controller(t);
    app.openLogShot();
    document.getElementById('input-shot-profile').value = 'manual';
    app.syncTimeFromProfile();
    assert.equal(document.getElementById('input-shot-time').value, '');
    app.setTimeFromProfile(1);
    document.getElementById('input-shot-time').value = '32';
    form.clearProgrammedShotTime();
    document.getElementById('input-shot-profile').value = 'manual';
    app.syncTimeFromProfile();
    assert.equal(document.getElementById('input-shot-time').value, '32');
    assert.equal(document.getElementById('shot-time-hint').hidden, true);
});

test('editing a saved shot retains its recorded time even if the program changed', t => {
    const { app, document, context } = controller(t);
    const log = { id: 'old-shot', beanId: 'bag', machineId: 'elizabeth', profileUsed: 'p1', time: '27', dose: '16', yield: '32', grind: '6', roastDate: '2026-10-01' };
    context.logsCache.push(log);
    context.userProfile.b1.brew = 40;
    const start = source.indexOf('    openEditShot:');
    const end = source.indexOf('    deleteShot:', start);
    app.openEditShot = vm.runInNewContext('({' + source.slice(start, end) + '})', context).openEditShot;
    app.openLogShot();
    app.openEditShot(log.id);
    assert.equal(document.getElementById('input-shot-time').value, '27');
    assert.equal(document.getElementById('input-shot-profile').value, 'p1');
    assert.equal(document.getElementById('shot-time-hint').hidden, true);
    assert.equal(log.time, '27');
});

test('invalid or unavailable programmed settings do not invent a duration', () => {
    for (const settings of [{}, { b1: { infusion: 0, bloom: 0, brew: 0 } }, { b1: { infusion: -1, bloom: 2, brew: 25 } }, { b1: { brew: 'not a number' } }, { b1: { brew: true } }, { b1: { infusion: 1e308, bloom: 1e308, brew: 25 } }]) {
        assert.equal(form.programmedShotSeconds('p1', 'elizabeth', settings), null);
    }
    assert.equal(form.programmedShotSeconds('p1', 'bianca', profile), null);
    assert.equal(form.programmedShotSeconds('manual', 'elizabeth', profile), null);
    assert.equal(form.programmedShotSeconds('p1', 'elizabeth', { b1: { infusion: '4', bloom: '6', brew: '25' } }), 35);
});

test('editing a shot retains numeric and string zero observations', t => {
    for (const value of [0, '0']) {
        const { app, document, context } = controller(t);
        const log = { id: 'zero-shot', beanId: 'bag', machineId: 'elizabeth', time: '30', dose: '16', yield: '32', grind: '6.2',
            pressureObserved: value, firstDropSeconds: value };
        context.logsCache.push(log);
        const start = source.indexOf('    openEditShot:');
        const end = source.indexOf('    deleteShot:', start);
        app.openEditShot = vm.runInNewContext('({' + source.slice(start, end) + '})', context).openEditShot;
        app.openEditShot(log.id);
        assert.equal(String(document.getElementById('input-shot-pressure').value), '0');
        assert.equal(String(document.getElementById('input-shot-first-drop').value), '0');
        assert.equal(log.pressureObserved, value);
        assert.equal(log.firstDropSeconds, value);
    }
});

test('editing keeps missing observations blank and recorded positive values intact', t => {
    for (const value of [undefined, null, '', 9, '7.5']) {
        const { app, document, context } = controller(t);
        const log = { id: 'observed-shot', beanId: 'bag', machineId: 'bianca', time: '29', dose: '16', yield: '32', grind: '12',
            pressureObserved: value, firstDropSeconds: value };
        context.logsCache.push(log);
        const start = source.indexOf('    openEditShot:');
        const end = source.indexOf('    deleteShot:', start);
        app.openEditShot = vm.runInNewContext('({' + source.slice(start, end) + '})', context).openEditShot;
        app.openEditShot(log.id);
        const expected = String(value ?? '');
        assert.equal(String(document.getElementById('input-shot-pressure').value), expected);
        assert.equal(String(document.getElementById('input-shot-first-drop').value), expected);
    }
});
