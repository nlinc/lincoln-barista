import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("a deployment announces the update without navigating away from an unfinished entry", async () => {
    const handlers = new Map();
    const messages = [];
    const removed = [];
    let claimed = false;
    const client = {
        postMessage: message => messages.push(message),
        navigate: () => assert.fail("An update must wait for the user's refresh action")
    };
    vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
        self: {
            addEventListener: (name, callback) => handlers.set(name, callback),
            clients: {
                claim: async () => { claimed = true; },
                matchAll: async () => [client]
            }
        },
        caches: {
            keys: async () => ["old-build", "lincoln-barista-__BUILD_COMMIT__"],
            delete: async key => removed.push(key)
        }
    });
    let activation;
    handlers.get("activate")({ waitUntil: promise => { activation = promise; } });
    await activation;
    assert.equal(claimed, true);
    assert.deepEqual(removed, ["old-build"]);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "APP_UPDATE_READY");
});
