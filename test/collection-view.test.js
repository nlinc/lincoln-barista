import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beanImpressionLabel, collectionPreview, resolveBeanImpression, selectVisibleBeans } from "../public/js/collection-view.js";

const beans = [
    { id: "1", name: "Zulu", roaster: "North", origin: "Kenya", roastLevel: "Light", impression: "meh", tags: ["berry"], createdAt: { seconds: 1 } },
    { id: "2", name: "Alpha", roaster: "South", origin: "Brazil", roastLevel: "Dark", impression: "enjoyed", tags: ["chocolate"], createdAt: { seconds: 3 } },
    { id: "3", name: "Middle", roaster: "North", origin: "Colombia", roastLevel: "Medium", impression: "not-for-me", tags: ["caramel"], createdAt: { seconds: 2 } }
];

describe("collection view model", () => {
    it("filters across bean metadata and tags", () => {
        assert.deepEqual(selectVisibleBeans(beans, new Set(["north"])).map(bean => bean.id), ["3", "1"]);
        assert.deepEqual(selectVisibleBeans(beans, new Set(["dark", "chocolate"])).map(bean => bean.id), ["2"]);
    });

    it("supports name, impression, and newest sorting without mutating the source", () => {
        assert.deepEqual(selectVisibleBeans(beans, new Set(), "name").map(bean => bean.name), ["Alpha", "Middle", "Zulu"]);
        assert.deepEqual(selectVisibleBeans(beans, new Set(), "impression").map(bean => bean.impression), ["enjoyed", "meh", "not-for-me"]);
        assert.deepEqual(selectVisibleBeans(beans).map(bean => bean.id), ["2", "3", "1"]);
        assert.deepEqual(beans.map(bean => bean.id), ["1", "2", "3"]);
    });

    it("maps legacy star values into the simpler impression choices", () => {
        assert.equal(resolveBeanImpression({ rating: 5 }), "enjoyed");
        assert.equal(resolveBeanImpression({ rating: 3 }), "meh");
        assert.equal(resolveBeanImpression({ rating: 1 }), "not-for-me");
        assert.equal(beanImpressionLabel({ rating: 5 }), "😊 Enjoyed");
    });

    it('previews three beans after sorting and expands without losing the rest', () => {
        const collection = [...beans, { id: '4', name: 'Newest', createdAt: new Date('2026-10-09') }];
        const preview = collectionPreview(collection);
        assert.equal(preview.total, 4);
        assert.deepEqual(preview.beans.map(bean => bean.id), ['4', '2', '3']);
        assert.equal(collectionPreview(collection, new Set(), 'newest', true).beans.length, 4);
        assert.equal(collectionPreview(collection, new Set(['north'])).total, 2);
    });
});
