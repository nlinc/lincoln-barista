import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeGrindFrequency, summarizeShotPatterns, validateShot } from "../public/js/shot-analytics.js";

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
    it("rejects incomplete or impossible shot values", () => {
        const result = validateShot({ grind: "14", dose: "0", yield: "", time: "-1" });

        assert.equal(result.valid, false);
        assert.equal(result.errors.length, 3);
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
