import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    createDefaultUserProfile,
    maintenanceDueState,
    maintenancePresetsFor,
    normalizeUserProfile,
    presetDueDate,
    recordMachineId
} from "../public/js/machine-config.js";

describe("machine configuration", () => {
    it("creates independent default profiles", () => {
        const first = createDefaultUserProfile();
        const second = createDefaultUserProfile();
        first.elizabeth.brewTemperature = 190;
        assert.equal(second.elizabeth.brewTemperature, 200);
        assert.equal(second.bianca.temperatureUnit, "F");
    });

    it("normalizes saved machine settings", () => {
        const profile = normalizeUserProfile({
            machineId: "bianca",
            defaultDose: "20",
            finerDirection: "higher",
            bianca: { machineVersion: "v2", temperatureUnit: "C" }
        });
        assert.equal(profile.machineName, "Lelit Bianca");
        assert.equal(profile.defaultDose, 20);
        assert.equal(profile.finerDirection, "higher");
        assert.equal(profile.bianca.machineVersion, "v2");
        assert.equal(profile.bianca.brewTemperature, 93);
    });

    it("keeps legacy records assigned to Elizabeth", () => {
        assert.equal(recordMachineId({}), "elizabeth");
        assert.equal(recordMachineId({ machineId: "bianca" }), "bianca");
    });

    it("provides model-specific maintenance schedules", () => {
        const elizabeth = maintenancePresetsFor("elizabeth");
        const bianca = maintenancePresetsFor("bianca");
        assert.ok(elizabeth.some(preset => preset.type === "Backflush" && preset.monthsUntilDue === 1));
        assert.ok(bianca.some(preset => preset.type === "Water filter" && preset.monthsUntilDue === 4));
        assert.ok(bianca.some(preset => preset.type === "Professional annual service" && preset.monthsUntilDue === 12));
    });

    it("calculates weekly and end-of-month reminders", () => {
        assert.equal(presetDueDate({ daysUntilDue: 7 }, "2026-08-12"), "2026-08-19");
        assert.equal(presetDueDate({ monthsUntilDue: 1 }, "2026-01-31"), "2026-02-28");
    });

    it("classifies reminder urgency against a supplied date", () => {
        const today = new Date("2026-08-12T12:00:00");
        assert.deepEqual(maintenanceDueState("2026-08-11", today), { tone: "overdue", label: "1d overdue" });
        assert.deepEqual(maintenanceDueState("2026-08-12", today), { tone: "due", label: "Due today" });
        assert.deepEqual(maintenanceDueState("2026-08-20", today), { tone: "due", label: "Due in 8d" });
    });
});
