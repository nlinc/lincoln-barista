import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const mergeWorkflow = readFileSync(new URL("../.github/workflows/firebase-hosting-merge.yml", import.meta.url), "utf8");
const previewWorkflow = readFileSync(new URL("../.github/workflows/firebase-hosting-pull-request.yml", import.meta.url), "utf8");

describe("UI smoke guardrails", () => {
    it("does not ship inline style attributes in the app shell", () => {
        assert.doesNotMatch(html, /\sstyle="/);
    });

    it("keeps cache-busted app assets on the current release", () => {
        assert.match(html, /style\.css\?v=1\.7\.0/);
        assert.match(html, /js\/app\.js\?v=1\.7\.0/);
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

    it("keeps analytics code off the critical rendering path", () => {
        assert.doesNotMatch(html, /<script[^>]+chart\.js/i);
        assert.match(appJs, /loadChartLibrary/);
        assert.match(appJs, /chart\.js@4\.5\.1\/dist\/chart\.umd\.min\.js/);
        assert.match(html, /fonts\.googleapis\.com[^>]+media="print"/);
    });

    it("captures the user's grinder direction for honest trend language", () => {
        assert.match(html, /id="profile-finer-direction"/);
        assert.match(appJs, /finerDirection/);
        assert.match(rules, /"finerDirection"/);
    });

    it("keeps the phone shot form compact with an always-reachable save action", () => {
        assert.match(html, /class="form-grid shot-grid"/);
        assert.match(html, /id="btn-cancel-shot-top"/);
        assert.match(css, /\.shot-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
        assert.match(css, /#view-log-shot \.shot-actions\s*\{[^}]*position:\s*fixed;/s);
        assert.match(css, /body\[data-view="log-shot"\] #top-bar/);
        assert.match(appJs, /document\.body\.dataset\.view = viewName/);
        assert.match(html, /id="btn-logout-settings"/);
    });

    it("uses local install assets and registers an offline shell", () => {
        assert.match(html, /href="icon\.svg"/);
        assert.match(manifest, /"src": "icon\.svg"/);
        assert.match(appJs, /serviceWorker\.register\("\/sw\.js"\)/);
    });

    it("tracks owned maintenance records without injecting user notes as HTML", () => {
        assert.match(html, /id="view-maintenance"/);
        assert.match(html, /id="maintenance-next-date"/);
        assert.match(appJs, /collection\(db, "maintenance_records"\)/);
        assert.match(appJs, /maintenance-notes/);
        assert.match(appJs, /textContent/);
        assert.doesNotMatch(appJs, /maintenance[^\n]*innerHTML/i);
        assert.match(rules, /match \/maintenance_records\/\{docId\}/);
        assert.match(rules, /validMaintenanceRecord/);
    });

    it("reuses shot history instead of refetching it for every screen", () => {
        assert.match(appJs, /fetchAllLogs/);
        assert.match(appJs, /logsLoadPromise/);
        assert.match(appJs, /logsForBean/);
        assert.match(appJs, /upsertCachedLog/);
        assert.match(appJs, /await app\.fetchAllLogs\(\)/);
        assert.doesNotMatch(appJs, /where\("beanId",\s*"=="/);
    });

    it("lazy-loads photos and migrates legacy image payloads in the background", () => {
        assert.match(html, /id="detail-image"[^>]+loading="lazy"[^>]+decoding="async"/);
        assert.match(appJs, /thumb\.loading = "lazy"/);
        assert.match(appJs, /runWhenIdle\(\(\) => app\.migrateLegacyImages\(\)\)/);
        assert.match(appJs, /updateDoc\(doc\(db, "beans", bean\.id\), \{ \.\.\.uploaded/);
    });

    it("persists AI responses and serves the app shell stale-while-revalidate", () => {
        assert.match(appJs, /persistAiCache/);
        assert.match(appJs, /lincoln-barista-tip-/);
        assert.match(serviceWorker, /caches\.match\(event\.request\)/);
        assert.match(serviceWorker, /event\.waitUntil\(update\.catch/);
    });

    it("shows and deploy-stamps the running commit", () => {
        assert.match(html, /id="build-commit">__BUILD_COMMIT__</);
        assert.match(appJs, /buildCommit\.textContent = "development"/);
        assert.match(serviceWorker, /lincoln-barista-__BUILD_COMMIT__/);
        assert.match(mergeWorkflow, /Stamp build commit/);
        assert.match(previewWorkflow, /Stamp build commit/);
    });

    it("uses explicit Google authentication for production deploys", () => {
        assert.match(mergeWorkflow, /google-github-actions\/auth@v3/);
        assert.match(mergeWorkflow, /credentials_json:\s*\$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT_ESPRESSO_4298D \}\}/);
        assert.match(mergeWorkflow, /firebase-tools@15\.22\.1 deploy/);
        assert.doesNotMatch(mergeWorkflow, /w9jds\/firebase-action/);
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
