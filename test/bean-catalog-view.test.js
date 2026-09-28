import test from "node:test";
import assert from "node:assert/strict";
import {
    catalogEntries,
    catalogSuggestions,
    cleanCatalogText,
    findActiveCatalogMatch,
    reusableBeanDetails
} from "../public/js/bean-catalog-view.js";

const beans = [
    { id: "old", name: "Geometry", roaster: "Onyx", roasterLocation: "Arkansas", archived: true, createdAt: { seconds: 1 } },
    { id: "new", name: " geometry ", roaster: " ONYX ", roasterLocation: "arkansas", createdAt: { seconds: 3 } },
    { id: "other", name: "Sweet Shop", roaster: "Square Mile", createdAt: { seconds: 2 } }
];

test("catalog deduplicates names and roasters across archived and active beans", () => {
    assert.equal(cleanCatalogText("  Square   Mile "), "Square Mile");
    assert.deepEqual(catalogEntries(beans).map(bean => bean.id), ["new", "other"]);
    assert.deepEqual(catalogSuggestions(beans, "roaster"), ["ONYX", "Square Mile"]);
    assert.deepEqual(catalogSuggestions(beans, "roasterLocation"), ["arkansas"]);
});

test("duplicate guidance matches active beans after case and whitespace normalization", () => {
    assert.equal(findActiveCatalogMatch(beans, " onyx ", " GEOMETRY ")?.id, "new");
    assert.equal(findActiveCatalogMatch(beans, "", "Geometry"), null);
    assert.equal(findActiveCatalogMatch(beans.filter(bean => bean.id !== "new"), "Onyx", "Geometry"), null);
});

test("reusing a past bean copies coffee details but never bag or opinion history", () => {
    const details = reusableBeanDetails({
        name: "  Geometry ", roaster: "Onyx", roasterLocation: "Arkansas", origin: "Ethiopia",
        roastLevel: "Light", tenBeanWeight: "1.7", tags: ["berry"],
        currentRoastDate: "2025-01-01", imageUrl: "photo", impression: "enjoyed", rating: 5
    });
    assert.deepEqual(details, {
        name: "Geometry", roaster: "Onyx", roasterLocation: "Arkansas", origin: "Ethiopia",
        roastLevel: "Light", tenBeanWeight: "1.7", tags: ["berry"]
    });
});
