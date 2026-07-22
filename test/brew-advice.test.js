import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBrewAdvice } from "../public/js/brew-advice.js";

describe("getBrewAdvice", () => {
    it("marks a balanced medium roast shot as golden range", () => {
        assert.deepEqual(
            getBrewAdvice({ dose: "18", yield: "36", time: "30" }, "Medium"),
            { text: "Golden Range Identified", status: "good" }
        );
    });

    it("recommends grinding finer for a fast high-yield shot", () => {
        const advice = getBrewAdvice({ dose: "18", yield: "46", time: "25" }, "Medium");

        assert.equal(advice.status, "fast");
        assert.match(advice.text, /Finer/);
    });

    it("recommends grinding coarser for a choked low-flow shot", () => {
        const advice = getBrewAdvice({ dose: "18", yield: "24", time: "45" }, "Dark");

        assert.equal(advice.status, "slow");
        assert.match(advice.text, /Coarser/);
    });

    it("falls back to medium targets for unknown roast levels", () => {
        assert.deepEqual(
            getBrewAdvice({ dose: "18", yield: "36", time: "30" }, "Mystery"),
            { text: "Golden Range Identified", status: "good" }
        );
    });

    it("does not call incomplete data a golden shot", () => {
        assert.deepEqual(
            getBrewAdvice({ dose: "", yield: "36", time: "30" }, "Medium"),
            { text: "Complete dose, yield, and time to analyze", status: "incomplete" }
        );
    });
});
