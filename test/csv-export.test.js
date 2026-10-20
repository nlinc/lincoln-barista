import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvText, shotExportRow } from "../public/js/csv-export.js";

describe("CSV export fidelity", () => {
    it("preserves recorded zero measurements instead of exporting missing values", () => {
        const log = {
            beanId: "test-bean", machineId: "bianca", grind: 0, time: 30, dose: 18,
            yield: 36, brewTemperature: 0, pressureObserved: 0, firstDropSeconds: 0,
            tampForceLb: 0, channelingObserved: false
        };
        const original = structuredClone(log);
        const row = shotExportRow(log, { name: "Test coffee", roaster: "Test roaster" }, "10/19/2026", "C");
        assert.deepEqual(row, ["10/19/2026", "bianca", "Test coffee", "Test roaster", "", 0, 30, 18, 36, "", "", 0, "C", 0, 0, false, "", 0]);
        assert.equal(csvText([row]), "10/19/2026,bianca,Test coffee,Test roaster,,0,30,18,36,,,0,C,0,0,false,,0");
        assert.deepEqual(log, original);
    });

    it("keeps missing observations blank and retains the existing metadata fallbacks", () => {
        const row = shotExportRow({ beanId: "deleted-bean", pressureObserved: null, firstDropSeconds: undefined }, {}, "");
        assert.equal(row.length, 18);
        assert.equal(row[1], "elizabeth");
        assert.equal(row[2], "deleted-bean");
        assert.equal(row[11], "");
        assert.equal(row[12], "F");
        assert.equal(row[13], "");
        assert.equal(row[14], "");
        assert.equal(row[17], "");
        assert.equal(shotExportRow({ temperatureUnit: "C" }, {}, "", "F")[12], "C");
    });

    it("quotes carriage returns, newlines, commas and embedded quotes without altering text", () => {
        assert.equal(
            csvText([["coffee", "roaster"], ["A, B", 'The "Roaster"'], ["line one\rline two", "one\ntwo"], ["one\r\ntwo", null]]),
            'coffee,roaster\n"A, B","The ""Roaster"""\n"line one\rline two","one\ntwo"\n"one\r\ntwo",'
        );
        assert.equal(csvText([[0, false, undefined, ""]]), "0,false,,");
    });
});
