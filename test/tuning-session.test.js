import test from 'node:test';
import assert from 'node:assert/strict';
import { latestTuningShot, tuningBeans, tuningRoast } from '../public/js/tuning-session.js';

test('tuning choices exclude archived beans and use a safe roast fallback', () => {
    const beans = [{ id: 'active', roastLevel: 'light' }, { id: 'old', archived: true }];
    assert.deepEqual(tuningBeans(beans).map(bean => bean.id), ['active']);
    assert.equal(tuningRoast(beans[0]), 'light');
    assert.equal(tuningRoast({ roastLevel: 'Omni' }), 'medium');
});

test('latest shot context stays scoped to the chosen bean and machine', () => {
    const logs = [
        { beanId: 'other', machineId: 'bianca', dose: 20 },
        { beanId: 'chosen', machineId: 'elizabeth', dose: 17 },
        { beanId: 'chosen', machineId: 'bianca', dose: 18 },
        { beanId: 'chosen', machineId: 'bianca', dose: 16 }
    ];
    assert.equal(latestTuningShot(logs, 'chosen', 'bianca')?.dose, 18);
    assert.equal(latestTuningShot(logs, 'chosen', 'elizabeth')?.dose, 17);
    assert.equal(latestTuningShot(logs, 'missing', 'bianca'), null);
});
