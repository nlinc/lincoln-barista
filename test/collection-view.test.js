import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectVisibleBeans } from "../public/js/collection-view.js";

const beans = [
    { id: "1", name: "Zulu", roaster: "North", origin: "Kenya", roastLevel: "Light", rating: 3, tags: ["berry"], createdAt: { seconds: 1 } },
    { id: "2", name: "Alpha", roaster: "South", origin: "Brazil", roastLevel: "Dark", rating: 5, tags: ["chocolate"], createdAt: { seconds: 3 } },
    { id: "3", name: "Middle", roaster: "North", origin: "Colombia", roastLevel: "Medium", rating: 4, tags: ["caramel"], createdAt: { seconds: 2 } }
];

describe("collection view model", () => {
    it("filters across bean metadata and tags", () => {
        assert.deepEqual(selectVisibleBeans(beans, new Set(["north"])).map(bean => bean.id), ["3", "1"]);
        assert.deepEqual(selectVisibleBeans(beans, new Set(["dark", "chocolate"])).map(bean => bean.id), ["2"]);
    });

    it("supports name, rating, and newest sorting without mutating the source", () => {
        assert.deepEqual(selectVisibleBeans(beans, new Set(), "name").map(bean => bean.name), ["Alpha", "Middle", "Zulu"]);
        assert.deepEqual(selectVisibleBeans(beans, new Set(), "rating").map(bean => bean.rating), [5, 4, 3]);
        assert.deepEqual(selectVisibleBeans(beans).map(bean => bean.id), ["2", "3", "1"]);
        assert.deepEqual(beans.map(bean => bean.id), ["1", "2", "3"]);
    });
});
