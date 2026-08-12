import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseCurrentRecipe, summarizeDialIn } from "../public/js/bean-detail-view.js";

describe("bean detail view model", () => {
    it("prefers the newest balanced in-range shot as the current recipe", () => {
        const logs = [
            { grind: "5", dose: "18", yield: "42", time: "22", taste: "sour" },
            { grind: "4", dose: "18", yield: "36", time: "30", taste: "balanced" }
        ];
        assert.deepEqual(chooseCurrentRecipe(logs, "Medium"), { shot: logs[1], status: "Dialed" });
    });

    it("summarizes valid shots by grind and ranks ratios nearest 1:2 first", () => {
        const rows = summarizeDialIn([
            { grind: "5", dose: "18", yield: "36", time: "30" },
            { grind: "5", dose: "18", yield: "38", time: "32" },
            { grind: "6", dose: "18", yield: "27", time: "25" },
            { grind: "bad", dose: "", yield: "", time: "" }
        ]);
        assert.equal(rows[0].grind, "5");
        assert.equal(rows[0].count, 2);
        assert.equal(rows[0].avgTime, 31);
        assert.equal(rows.length, 2);
    });
});
