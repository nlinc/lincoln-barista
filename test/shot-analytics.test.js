import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { filterShotTrends, recommendStartingGrind, summarizeBasketResults, summarizeGrindFrequency, summarizeShotPatterns, validateShot } from "../public/js/shot-analytics.js";

const shot = (age, grind, overrides = {}) => ({
    beanId: "bean-1",
    roastDate: "2026-05-01",
    date: new Date(Date.UTC(2026, 4, 1 + age, 12)),
    grind: String(grind),
    dose: "18",
    yield: "36",
    time: "30",
    ...overrides
});

describe("shot analytics", () => {
    it('combines basket, roast and machine filters while keeping unknown baskets separate', () => {
        const beans = [{ id: 'bean-1', roastLevel: 'Medium' }, { id: 'bean-2', roastLevel: 'Light' }];
        const logs = [shot(0, 14, { basketId: 'stock-elizabeth' }), shot(1, 7, { basketId: 'pullman-15' }),
            shot(2, 6, { basketId: 'pullman-17', beanId: 'bean-2' }), shot(3, 12),
            shot(4, 5, { basketId: 'pullman-15', machineId: 'bianca' })];
        assert.deepEqual(filterShotTrends(logs, beans, { machineId: 'elizabeth', basketId: 'pullman-15', roast: 'medium' }), [logs[1]]);
        assert.deepEqual(filterShotTrends(logs, beans, { machineId: 'elizabeth', basketId: 'unknown' }), [logs[3]]);
        assert.equal(filterShotTrends(logs, beans, { machineId: 'elizabeth' }).length, 4);
        assert.equal(filterShotTrends(logs, beans, { machineId: 'elizabeth', basketId: 'pullman-19' }).length, 0);
    });

    it('compares measured medians and recorded taste without counting incomplete shots', () => {
        const logs = [shot(0, 14, { basketId: 'stock-elizabeth', taste: 'balanced' }),
            shot(1, 12, { basketId: 'stock-elizabeth', yield: '40', time: '32' }),
            shot(2, 6, { basketId: 'pullman-15', dose: '16', yield: '32', taste: 'sour' }),
            shot(3, 99, { basketId: 'pullman-15', time: '' }), shot(4, 10)];
        const rows = summarizeBasketResults(logs, [{ id: 'bean-1', roastLevel: 'Medium' }]);
        const stock = rows.find(row => row.id === 'stock-elizabeth');
        assert.equal(stock.count, 2);
        assert.equal(stock.grind, 13);
        assert.equal(stock.yield, 38);
        assert.equal(stock.time, 31);
        assert.equal(stock.balanced, 1);
        assert.equal(rows.find(row => row.id === 'pullman-15').count, 1);
        assert.equal(rows.find(row => row.id === 'unknown').count, 1);
    });

    it('does not interpret a basket switch as grind drift with bean age', () => {
        const logs = [shot(0, 14, { basketId: 'stock-elizabeth' }), shot(7, 14, { basketId: 'stock-elizabeth' }),
            shot(14, 6, { basketId: 'pullman-15' }), shot(21, 6, { basketId: 'pullman-15' })];
        const summary = summarizeShotPatterns(logs, [{ id: 'bean-1', roastLevel: 'Medium' }]);
        assert.equal(summary.ageTrend, null);
        assert.equal(summary.flowTrend, null);
        assert.deepEqual(summary.usable.map(log => log.grindDelta), [0, 0, 0, 0]);
        assert.match(summary.insights[0].text, /Select one basket/);
    });
    it('rejects numeric prefixes and empty or boolean measured values', () => {
        for (const dose of ['18oops', '', ' ', null, undefined, true]) {
            assert.equal(validateShot({ grind: '14', time: '30', dose, yield: '36' }).valid, false);
        }
        assert.equal(validateShot({ grind: '14', time: '30', dose: '18.5', yield: '36' }).valid, true);
    });

    it("rejects incomplete or impossible shot values", () => {
        const result = validateShot({ grind: "14", dose: "0", yield: "", time: "-1" });

        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 3);
        assert.deepEqual(result.fieldErrors, {
            time: 'Time must be greater than zero.',
            dose: 'Dose must be greater than zero.',
            yield: 'Yield must be greater than zero.'
        });
        assert.deepEqual(validateShot({ grind: '', time: '30', dose: '18', yield: '36' }).fieldErrors,
            { grind: 'Enter a valid grind setting.' });
        assert.deepEqual(validateShot({ grind: '0', time: '30', dose: '18', yield: '36' }).fieldErrors, {});
    });

    it("detects weekly finer movement when lower numbers mean finer", () => {
        const logs = [
            shot(0, 15),
            shot(7, 14.5),
            shot(14, 14),
            shot(21, 13.5)
        ];
        const summary = summarizeShotPatterns(
            logs,
            [{ id: "bean-1", name: "Test Bean", roastLevel: "Medium" }],
            { finerDirection: "lower" }
        );

        assert.equal(summary.metrics.shots, 4);
        assert.equal(summary.metrics.ageSpan, 21);
        assert.equal(summary.ageTrend.weeklyChange.toFixed(2), "-0.50");
        assert.match(summary.insights[0].text, /finer on your grinder/);
    });

    it("normalizes all-bean grind data from each bean's first shot", () => {
        const logs = [
            shot(0, 15),
            shot(7, 14.5),
            shot(0, 6, { beanId: "bean-2" }),
            shot(7, 5.5, { beanId: "bean-2" })
        ];
        const summary = summarizeShotPatterns(logs, [
            { id: "bean-1", roastLevel: "Medium" },
            { id: "bean-2", roastLevel: "Medium" }
        ]);

        assert.equal(summary.isSingleBean, false);
        assert.deepEqual(summary.agePoints.map(point => point.y), [0, 0, 0.5, 0.5]);
        assert.match(summary.insights[0].text, /finer every 7 days/);
    });

    it("sorts grind frequency by numeric setting", () => {
        const frequency = summarizeGrindFrequency([
            { grind: "8.5" }, { grind: "5" }, { grind: "8" },
            { grind: "4.7" }, { grind: "8.5" }, { grind: "9" }
        ]);

        assert.deepEqual(frequency, [
            { label: "4.7", grind: 4.7, count: 1 },
            { label: "5", grind: 5, count: 1 },
            { label: "8", grind: 8, count: 1 },
            { label: "8.5", grind: 8.5, count: 2 },
            { label: "9", grind: 9, count: 1 }
        ]);
    });
});

describe('starting grind from matching history', () => {
    const bean = { id: 'bean-1', roastLevel: 'Medium' };
    const beans = [bean, { id: 'bean-2', roastLevel: 'Medium' }, { id: 'light', roastLevel: 'Light' }];
    const recent = (grind, overrides = {}) => shot(1, grind, { date: '2026-10-05T12:00:00Z', basketId: 'pullman-15', dose: '16', yield: '32', time: '30', ...overrides });
    const recommend = logs => recommendStartingGrind({ logs, beans, bean, machineId: 'elizabeth', basketId: 'pullman-15', dose: 16, ratio: 2, now: new Date('2026-10-11T12:00:00Z') });

    it('prefers this bean and returns a median without changing source shots or recipes', () => {
        const logs = [recent(5.8), recent(6), recent(6.2), ...Array.from({ length: 5 }, () => recent(20, { beanId: 'bean-2' }))];
        const original = JSON.stringify(logs);
        assert.deepEqual(recommend(logs), { grind: 6, count: 3, scope: 'bean', roast: 'medium', min: 5.8, max: 6.2 });
        assert.equal(JSON.stringify(logs), original);
    });

    it('waits for enough evidence and never borrows another basket, roast, machine or recipe', () => {
        const mismatches = [recent(99, { basketId: 'stock-elizabeth' }), recent(99, { basketId: 'pullman-17' }),
            recent(99, { machineId: 'bianca' }), recent(99, { beanId: 'light' }),
            recent(99, { dose: '19', yield: '38' }), recent(99, { yield: '48' }),
            recent(99, { date: '2026-01-01' }), recent(99, { date: '2026-10-12' }),
            recent(99, { time: '' }), recent(99, { taste: 'sour' }), recent(99, { channelingObserved: true })];
        assert.equal(recommend([recent(6), recent(6.2), ...mismatches]), null);
        assert.equal(recommend([recent(6), recent(6.2), recent(6.4), ...mismatches]).grind, 6.2);
    });

    it('uses a same-roast fallback only after five successful shots across two beans', () => {
        const logs = [recent(5), recent(6), recent(7, { beanId: 'bean-2' }), recent(8, { beanId: 'bean-2' }), recent(9, { beanId: 'bean-2' })];
        assert.equal(recommend(logs.slice(0, 4)), null);
        assert.equal(recommend(logs).grind, 7);
        assert.equal(recommend(logs).scope, 'roast');
        assert.equal(recommend(logs.map(log => ({ ...log, beanId: 'bean-2' }))), null);
    });

    it('uses recorded balanced taste, rejects unknown selections, and preserves grind zero', () => {
        const logs = [recent(0, { time: '50', taste: 'balanced' }), recent(0), recent(0)];
        assert.equal(recommend(logs).grind, 0);
        assert.equal(recommendStartingGrind({ logs, beans, bean, machineId: 'elizabeth', basketId: '', dose: 16, ratio: 2 }), null);
        assert.equal(recommendStartingGrind({ logs, beans, bean, machineId: 'elizabeth', basketId: 'stock-bianca', dose: 16, ratio: 2 }), null);
    });
});
