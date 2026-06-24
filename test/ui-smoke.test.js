import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8");

describe("UI smoke guardrails", () => {
    it("does not ship inline style attributes in the app shell", () => {
        assert.doesNotMatch(html, /\sstyle="/);
    });

    it("keeps cache-busted app assets on the current release", () => {
        assert.match(html, /style\.css\?v=1\.6\.0/);
        assert.match(html, /js\/app\.js\?v=1\.6\.0/);
    });

    it("caps detail bean images and hides the native file input", () => {
        assert.match(css, /\.detail-image\s*\{[^}]*width:\s*220px !important;[^}]*height:\s*220px !important;/s);
        assert.match(css, /input\.visually-hidden\s*\{[^}]*width:\s*1px !important;[^}]*clip:\s*rect\(0 0 0 0\) !important;/s);
    });

    it("provides analytics controls from detail and analytics views", () => {
        assert.match(html, /id="btn-open-detail-analytics"/);
        assert.match(html, /id="btn-analytics-current"/);
        assert.match(html, /id="btn-analytics-all"/);
        assert.match(html, /id="ageChart"/);
        assert.match(html, /id="analytics-pattern-list"/);
        assert.match(appJs, /openAnalytics\("current"\)/);
        assert.match(appJs, /openAnalytics\("all"\)/);
    });

    it("captures the user's grinder direction for honest trend language", () => {
        assert.match(html, /id="profile-finer-direction"/);
        assert.match(appJs, /finerDirection/);
        assert.match(rules, /"finerDirection"/);
    });

    it("uses local install assets and registers an offline shell", () => {
        assert.match(html, /href="icon\.svg"/);
        assert.match(manifest, /"src": "icon\.svg"/);
        assert.match(appJs, /serviceWorker\.register\("\/sw\.js"\)/);
    });
});

describe("Data safety guardrails", () => {
    it("archives beans instead of deleting their documents", () => {
        assert.match(appJs, /archived:\s*true/);
        assert.doesNotMatch(appJs, /deleteDoc\(doc\(db,\s*"beans"/);
    });

    it("allows archived bean fields in Firestore rules", () => {
        assert.match(rules, /"archived"/);
        assert.match(rules, /"archivedAt"/);
        assert.match(rules, /data\.archived is bool/);
    });

    it("keeps local image payloads below Firestore document limits", () => {
        assert.match(appJs, /MAX_IMAGE_EDGE\s*=\s*480/);
        assert.match(appJs, /MAX_IMAGE_BYTES\s*=\s*750000/);
        assert.match(rules, /data\.image\.size\(\) < 750000/);
    });

    it("stores new bean photos in Firebase Storage", () => {
        assert.match(appJs, /getStorage\(appInstance,\s*'gs:\/\/espresso-4298d\.firebasestorage\.app'\)/);
        assert.match(appJs, /uploadString\(ref,\s*dataUrl,\s*"data_url"/);
        assert.match(appJs, /imageUrl/);
        assert.match(appJs, /imagePath/);
        assert.match(rules, /"imageUrl"/);
        assert.match(rules, /"imagePath"/);
        assert.match(storageRules, /match \/users\/\{userId\}\/beans\/\{beanId\}\/\{fileName\}/);
        assert.match(storageRules, /request\.auth\.uid == userId/);
        assert.match(storageRules, /request\.resource\.size < 750000/);
    });
});
