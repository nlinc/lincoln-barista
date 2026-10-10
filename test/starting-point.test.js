import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateStartingPoint, normalizeStartingSetup } from "../public/js/starting-point.js";
import { normalizeUserProfile } from "../public/js/machine-config.js";

const setup = { ownedBasketIds: ["pullman-15", "pullman-17"], doseMin: 15, doseMax: 19 };

describe("new bean starting point", () => {
    it("uses the fixed 18g measurement and selects a basket for a bounded starting dose", () => {
        const puffy = calculateStartingPoint({ setup, volume: 48 });
        const dense = calculateStartingPoint({ setup, volume: 37 });
        assert.equal(puffy.density, 18 / 48);
        assert.equal(puffy.dose, 16.2);
        assert.equal(puffy.basket.id, "pullman-15");
        assert.equal(puffy.yield, 32.4);
        assert.equal(dense.basket.id, "pullman-17");
        assert.equal(dense.dose, 19);
        assert.equal(puffy.headspace, null);
        assert.match(puffy.notes.join(" "), /assum|calibration|proxy/);
    });

    it('uses actual sample weight and preserves old 18g calculations', () => {
        const old = calculateStartingPoint({ setup, volume: 45 });
        const smaller = calculateStartingPoint({ setup, weight: 16, volume: 40 });
        assert.equal(smaller.density, 0.4);
        assert.equal(smaller.dose, old.dose);
        assert.equal(smaller.basket.id, old.basket.id);
        assert.match(smaller.reasons[0], /16g occupies 40 mL/);
        for (const weight of [0, 31, 'bad', Infinity]) assert.ok(calculateStartingPoint({ setup, weight, volume: 40 }).error);
        assert.equal(calculateStartingPoint({ setup, weight: 16, volume: 50 }).density, 0.32);
        const calibrated = { ...setup, referenceVolume: 45, calibrations: { 'pullman-17': { referenceDose: 18, puckDepth: 12, clearance: 14 } } };
        assert.equal(calculateStartingPoint({ setup: calibrated, weight: 16, volume: 40, basketId: 'pullman-17' }).headspace, 2);
    });

    it("honors manual selection and never recommends an unowned basket", () => {
        const plan = calculateStartingPoint({ setup, volume: 48, basketId: "pullman-17" });
        assert.equal(plan.basket.id, "pullman-17");
        assert.equal(plan.dose, 17);
        assert.ok(calculateStartingPoint({ setup, basketId: "pullman-19" }).error);
        assert.ok(calculateStartingPoint({ setup: { ownedBasketIds: [] } }).error);
    });

    it("handles missing measurement and rejects invalid volumes or incompatible dose ranges", () => {
        assert.equal(calculateStartingPoint({ setup }).dose, 18);
        for (const volume of [0, -1, 51, Infinity, "48oops"]) assert.ok(calculateStartingPoint({ setup, volume }).error);
        assert.ok(calculateStartingPoint({ setup: { ...setup, doseMin: 20, doseMax: 22 } }).error);
    });

    it("uses an explicitly saved baseline and calibrated geometry to pursue the preferred headspace", () => {
        const calibrated = { ...setup, referenceVolume: 40, calibrations: { "pullman-17": { referenceDose: 18, puckDepth: 12, clearance: 14 } } };
        const plan = calculateStartingPoint({ setup: calibrated, volume: 40, basketId: "pullman-17" });
        assert.equal(plan.headspace, 2);
        assert.equal(plan.dose, 18);
        const changed = calculateStartingPoint({ setup: { ...calibrated, headspace: 2.5 }, volume: 40, basketId: "pullman-17" });
        assert.ok(changed.dose < plan.dose);
        assert.ok(changed.headspace > plan.headspace);
        const noBaseline = calculateStartingPoint({ setup: { ...calibrated, referenceVolume: null }, volume: 40, basketId: "pullman-17" });
        assert.equal(noBaseline.headspace, null);
    });

    it("blocks a first-shot handoff when calibration estimates puck contact", () => {
        const plan = calculateStartingPoint({ setup: { ...setup, referenceVolume: 40, calibrations: { "pullman-17": { referenceDose: 18, puckDepth: 12, clearance: 12.1 } } }, volume: 50, basketId: "pullman-17" });
        assert.ok(plan.headspace < 0);
        assert.equal(plan.canLog, false);
    });

    it("does not invent grinder clicks and keeps process separate from density or grind predictions", () => {
        const natural = calculateStartingPoint({ setup: { ...setup, baselineGrind: "5", grinderName: "My grinder" }, volume: 48, process: "natural" });
        const washed = calculateStartingPoint({ setup: { ...setup, baselineGrind: "5", grinderName: "My grinder" }, volume: 48, process: "washed" });
        assert.equal(natural.grind, washed.grind);
        assert.equal(natural.dose, washed.dose);
        assert.match(natural.grind, /Start at 5 on My grinder/);
        assert.doesNotMatch(natural.grind, /click/);
    });

    it("honors saved ratio and temperature units without enabling Bianca automation", () => {
        const plan = calculateStartingPoint({ setup: { ...setup, ratio: 2.1 }, machineId: "bianca", machine: { machineVersion: "v2", temperatureUnit: "C" }, volume: 48, roast: "light" });
        assert.equal(plan.yield, 34);
        assert.equal(plan.temperatureUnit, "C");
        assert.match(plan.preinfusion, /automation off/);
        assert.equal(calculateStartingPoint({ setup, machine: { machineVersion: "elizabeth3" } }).preinfusion.includes("Pagaia"), true);
        assert.match(calculateStartingPoint({ setup, machine: { machineVersion: "classic-early" } }).preinfusion, /no V3/);
        assert.match(calculateStartingPoint({ setup, machine: { preinfusionMode: "none" } }).preinfusion, /Off/);
    });

    it("normalizes old profiles, keeps machine setups independent and discards invalid calibration", () => {
        const profile = normalizeUserProfile({});
        assert.deepEqual(profile.startingPoints.elizabeth.ownedBasketIds, ["stock-elizabeth"]);
        assert.deepEqual(profile.startingPoints.bianca.ownedBasketIds, ["stock-bianca"]);
        profile.startingPoints.elizabeth.ownedBasketIds.push("pullman-15");
        assert.equal(profile.startingPoints.bianca.ownedBasketIds.length, 1);
        const clean = normalizeStartingSetup({ ownedBasketIds: ["stock-bianca", "pullman-15", "invented"], calibrations: { "pullman-15": { referenceDose: 16, puckDepth: 12, clearance: 10 } } });
        assert.deepEqual(clean.ownedBasketIds, ["pullman-15"]);
        assert.deepEqual(clean.calibrations, {});
        for (const calibration of [true, "bad", [], { referenceDose: Infinity, puckDepth: 12, clearance: 14 }, { referenceDose: 18, puckDepth: -1, clearance: 14 }]) {
            assert.deepEqual(normalizeStartingSetup({ calibrations: { "pullman-17": calibration } }).calibrations, {});
        }
    });
});
