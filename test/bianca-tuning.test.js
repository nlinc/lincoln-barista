import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    BIANCA_SOURCES,
    convertBiancaTemperature,
    diagnoseBiancaShot,
    explainBiancaFlow,
    getBiancaBaseline
} from "../public/js/bianca-tuning.js";

describe("Bianca tuning", () => {
    it("defaults to Fahrenheit and converts to Celsius", () => {
        assert.equal(getBiancaBaseline("medium").temperatureUnit, "F");
        assert.equal(convertBiancaTemperature(200, "F", "C"), 93);
        assert.equal(getBiancaBaseline("light", 18, "C").temperatureUnit, "C");
    });

    it("starts with a standard full-paddle shot before profiling", () => {
        const advice = diagnoseBiancaShot({ roast: "medium", symptom: "starting" });
        assert.match(advice.actions.join(" "), /pre-infusion and low-flow OFF/i);
        assert.match(advice.actions.join(" "), /dial grind before profiling/i);
    });

    it("prioritizes grind and recipe over hardware", () => {
        const advice = diagnoseBiancaShot({ roast: "light", symptom: "sour", pressure: 5 });
        assert.match(advice.actions[0], /grind finer/i);
        assert.doesNotMatch(advice.actions.join(" "), /adjust.*pump screw/i);
        assert.match(advice.warnings.join(" "), /puck resistance/i);
    });

    it("separates V3 automation from early machines", () => {
        assert.match(explainBiancaFlow({ machineVersion: "v2" }), /not factory V3 low-flow/i);
        const advice = diagnoseBiancaShot({ machineVersion: "v2", symptom: "starting" });
        assert.match(advice.warnings.join(" "), /Do not copy V3/i);
    });

    it("describes the programmed V3 timeline without calling paddle pressure fixed", () => {
        const text = explainBiancaFlow({ machineVersion: "v3", preinfusionOn: 5, preinfusionOff: 5, lowFlowStart: 15, lowFlowFinal: 30 });
        assert.match(text, /5s pump-on/);
        assert.match(text, /low flow through 15s/);
        assert.match(text, /fully open/);
    });

    it("resolves every advice source", () => {
        const ids = new Set(BIANCA_SOURCES.map(source => source.id));
        diagnoseBiancaShot({}).sourceIds.forEach(id => assert.ok(ids.has(id), id));
    });
});
