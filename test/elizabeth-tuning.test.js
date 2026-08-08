import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    ELIZABETH_ADVANCED_PARAMETERS,
    ELIZABETH_SOURCES,
    convertTemperature,
    diagnoseElizabethShot,
    explainPreinfusionMode,
    getElizabethBaseline
} from "../public/js/elizabeth-tuning.js";

describe("Elizabeth tuning baselines", () => {
    it("uses P1 for dark coffee and P2 for light coffee", () => {
        assert.equal(getElizabethBaseline("Dark").button, "P1");
        assert.equal(getElizabethBaseline("Light").button, "P2");
        assert.ok(getElizabethBaseline("Light").ratio > getElizabethBaseline("Dark").ratio);
        assert.ok(getElizabethBaseline("Light").temperature > getElizabethBaseline("Dark").temperature);
    });

    it("scales target yield from the user's dose", () => {
        assert.equal(getElizabethBaseline("Light", 17).yield, 42.5);
        assert.equal(getElizabethBaseline("Mystery", "bad").dose, 18);
    });

    it("defaults to Fahrenheit and can convert the whole baseline to Celsius", () => {
        assert.equal(getElizabethBaseline("Medium").temperatureUnit, "F");
        assert.equal(getElizabethBaseline("Medium", 18, "C").temperature, 93);
        assert.equal(convertTemperature(275, "F", "C"), 135);
    });

    it("explains the V3 global steam-versus-bloom switch", () => {
        assert.match(explainPreinfusionMode({ mode: "auto", steamTemperature: 275 }), /steam boiler on/i);
        assert.match(explainPreinfusionMode({ mode: "auto", steamTemperature: 135, temperatureUnit: "C" }), /115°C/);
        assert.match(explainPreinfusionMode({ mode: "bloom" }), /BLP/);
        assert.match(explainPreinfusionMode({ machineVersion: "classic-early" }), /do not have V3/i);
    });
});

describe("Elizabeth shot diagnosis", () => {
    it("prioritizes yield and grind before temperature for sour shots", () => {
        const advice = diagnoseElizabethShot({ roast: "light", symptom: "sour", dose: 18, yield: 36, time: 28 });
        assert.match(advice.actions[0], /Extend yield/);
        assert.match(advice.actions.at(-1), /temperature 2°F/);
    });

    it("uses a saved grind only as a grinder-specific starting point", () => {
        const advice = diagnoseElizabethShot({ symptom: "starting", startingGrind: "14.5" });
        assert.match(advice.actions[1], /saved grinder setting 14\.5/);
        assert.match(advice.actions[1], /your grinder/);
    });

    it("prioritizes puck preparation for mixed or channeling symptoms", () => {
        const advice = diagnoseElizabethShot({ symptom: "channeling", pressure: 11 });
        assert.match(advice.actions[0], /distribution first/);
        assert.match(advice.warnings[0], /does not justify OPV/);
    });

    it("never treats classic instructions as Elizabeth3 instructions", () => {
        const advice = diagnoseElizabethShot({ machineVersion: "elizabeth3", symptom: "starting" });
        assert.match(advice.warnings[0], /disabled/);
    });

    it("keeps source and advanced reference ids unique", () => {
        assert.equal(new Set(ELIZABETH_SOURCES.map(source => source.id)).size, ELIZABETH_SOURCES.length);
        assert.ok(ELIZABETH_SOURCES.every(source => source.url.startsWith("https://")));
        assert.ok(ELIZABETH_ADVANCED_PARAMETERS.length >= 8);
    });
});
