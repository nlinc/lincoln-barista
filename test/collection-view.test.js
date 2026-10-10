import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beanImpressionLabel, beansForScope, collectionPreview, resolveBeanImpression, selectVisibleBeans, swipeAction } from "../public/js/collection-view.js";

const beans = [
    { id: "1", name: "Zulu", roaster: "North", origin: "Kenya", roastLevel: "Light", impression: "meh", tags: ["berry"], createdAt: { seconds: 1 } },
    { id: "2", name: "Alpha", roaster: "South", origin: "Brazil", roastLevel: "Dark", impression: "enjoyed", tags: ["chocolate"], createdAt: { seconds: 3 } },
    { id: "3", name: "Middle", roaster: "North", origin: "Colombia", roastLevel: "Medium", impression: "not-for-me", tags: ["caramel"], createdAt: { seconds: 2 } }
];

describe("collection view model", () => {
    it('separates current and finished bags without merging or rewriting their identities', () => {
        const finished = { id: 'finished', name: 'Alpha', archived: true, imagePath: 'original-photo' };
        const collection = [...beans, finished];
        assert.deepEqual(beansForScope(collection).map(bean => bean.id), ['1', '2', '3']);
        assert.deepEqual(beansForScope(collection, 'finished'), [finished]);
        assert.equal(beansForScope(collection, 'finished')[0], finished);
        const justFinished = { id: 'old-bag', archived: true, createdAt: { seconds: 1 }, archivedAt: { seconds: 100 } };
        const earlierFinished = { id: 'newer-bag', archived: true, createdAt: { seconds: 50 }, archivedAt: { seconds: 60 } };
        assert.deepEqual(collectionPreview([earlierFinished, justFinished]).beans.map(bean => bean.id), ['old-bag', 'newer-bag']);
    });

    it('reveals actions on deliberate horizontal swipes and leaves scrolling and small movements alone', () => {
        assert.equal(swipeAction(-80, 10), 'open');
        assert.equal(swipeAction(80, 10), 'close');
        for (const [x, y] of [[-20, 0], [-70, 100], [-60, 45], [0, 100]]) assert.equal(swipeAction(x, y), null);
    });

    it("filters across bean metadata and tags", () => {
        assert.deepEqual(selectVisibleBeans(beans, new Set(["north"])).map(bean => bean.id), ["3", "1"]);
        assert.deepEqual(selectVisibleBeans(beans, new Set(["dark", "chocolate"])).map(bean => bean.id), ["2"]);
    });

    it('searches coffee names and roasters with case, accent and whitespace tolerance', () => {
        const collection = [...beans, { id: 'accent', name: 'Café Blend', roaster: 'Nórth Coffee', archived: true }];
        assert.deepEqual(selectVisibleBeans(collection, new Set(), 'name', '  CAFE   north  ').map(bean => bean.id), ['accent']);
        assert.deepEqual(selectVisibleBeans(collection, new Set(['light']), 'newest', 'NORTH').map(bean => bean.id), ['1']);
        assert.equal(collectionPreview(collection, new Set(), 'newest', true, 'unknown coffee').total, 0);
        assert.equal(collectionPreview(collection, new Set(), 'newest', false, '   ').total, 4);
        assert.deepEqual(beansForScope(collection, 'finished').map(bean => bean.id), ['accent']);
        assert.deepEqual(selectVisibleBeans(collection, new Set(), 'newest', '<script>').map(bean => bean.id), []);
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
