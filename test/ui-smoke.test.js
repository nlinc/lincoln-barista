import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/js/app.js", import.meta.url), "utf8");
const jsDirectory = new URL("../public/js/", import.meta.url);
const clientModules = new Map(readdirSync(jsDirectory)
    .filter(name => name.endsWith(".js"))
    .map(name => [name, readFileSync(new URL(name, jsDirectory), "utf8")]));
const allClientJs = [...clientModules.values()].join("\n");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const storageRules = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const firebaseConfig = readFileSync(new URL("../firebase.json", import.meta.url), "utf8");
const analyticsJs = readFileSync(new URL("../public/js/shot-analytics.js", import.meta.url), "utf8");
const tuningJs = readFileSync(new URL("../public/js/elizabeth-tuning.js", import.meta.url), "utf8");
const biancaTuningJs = readFileSync(new URL("../public/js/bianca-tuning.js", import.meta.url), "utf8");
const machineConfigJs = readFileSync(new URL("../public/js/machine-config.js", import.meta.url), "utf8");
const beanRepositoryJs = readFileSync(new URL("../public/js/bean-repository.js", import.meta.url), "utf8");
const beanDetailViewJs = readFileSync(new URL("../public/js/bean-detail-view.js", import.meta.url), "utf8");
const maintenanceRepositoryJs = readFileSync(new URL("../public/js/maintenance-repository.js", import.meta.url), "utf8");
const collectionViewJs = readFileSync(new URL("../public/js/collection-view.js", import.meta.url), "utf8");
const domJs = readFileSync(new URL("../public/js/dom.js", import.meta.url), "utf8");
const maintenanceViewJs = readFileSync(new URL("../public/js/maintenance-view.js", import.meta.url), "utf8");
const routerJs = readFileSync(new URL("../public/js/router.js", import.meta.url), "utf8");
const firebaseClientJs = readFileSync(new URL("../public/js/firebase-client.js", import.meta.url), "utf8");
const mergeWorkflow = readFileSync(new URL("../.github/workflows/firebase-hosting-merge.yml", import.meta.url), "utf8");
const previewWorkflow = readFileSync(new URL("../.github/workflows/firebase-hosting-pull-request.yml", import.meta.url), "utf8");

describe("UI smoke guardrails", () => {
    it("does not ship inline style attributes in the app shell", () => {
        assert.doesNotMatch(html, /\sstyle="/);
    });

    it("keeps client DOM references aligned with the app shell", () => {
        const referencedIds = [...allClientJs.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(match => match[1]);
        for (const id of new Set(referencedIds)) assert.match(html, new RegExp(`id="${id}"`));
    });

    it("keeps cache-busted app assets on the current release", () => {
        assert.match(html, /style\.css\?v=1\.10\.0/);
        assert.match(html, /js\/app\.js\?v=1\.10\.0/);
        for (const [name, source] of clientModules) {
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            assert.match(serviceWorker, new RegExp(`/js/${escapedName}\\?v=1\\.10\\.0`), `${name} must be cached`);
            for (const match of source.matchAll(/from\s+["']\.\/([^"']+\.js)(\?v=[^"']+)?["']/g)) {
                assert.equal(match[2], "?v=1.10.0", `${name} must version its ${match[1]} import`);
            }
        }
    });

    it("keeps Firebase persistence behind repository modules", () => {
        assert.doesNotMatch(appJs, /gstatic\.com\/firebasejs|\bcollection\(|\bgetDocs\(|\bsetDoc\(|\bupdateDoc\(|\bdeleteDoc\(/);
        for (const name of ["auth-repository.js", "bean-repository.js", "maintenance-repository.js", "profile-repository.js", "shot-repository.js"]) {
            assert.match(appJs, new RegExp(name.replace(".", "\\.") + "\\?v=1\\.10\\.0"));
        }
        assert.match(beanRepositoryJs, /collection\(db, "beans"\)/);
        assert.match(maintenanceRepositoryJs, /collection\(db, "maintenance_records"\)/);
    });

    it("caps detail bean images and hides the native file input", () => {
        assert.match(css, /\.detail-image\s*\{[^}]*width:\s*220px !important;[^}]*height:\s*220px !important;/s);
        assert.match(css, /input\.visually-hidden\s*\{[^}]*width:\s*1px !important;[^}]*clip:\s*rect\(0 0 0 0\) !important;/s);
    });

    it("keeps bean entry quick and uses three simple impressions instead of star ratings", () => {
        assert.match(html, /id="bean-extra-details"[^>]*class="card bean-extra-details"/);
        assert.match(html, /id="roaster-suggestions"/);
        assert.match(html, /id="roaster-location-suggestions"/);
        assert.match(html, /data-impression="enjoyed"/);
        assert.match(html, /data-impression="meh"/);
        assert.match(html, /data-impression="not-for-me"/);
        assert.doesNotMatch(html, /bean-star|input-bean-rating|Rate [1-5] stars?/);
        assert.match(appJs, /renderBeanSuggestions/);
        assert.match(rules, /data\.impression == "enjoyed"/);
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

    it("provides a version-aware Elizabeth tuning lab", () => {
        assert.match(html, /id="view-tuning"/);
        assert.match(html, /id="btn-open-tuning"/);
        assert.match(html, /id="btn-open-detail-tuning"/);
        assert.match(html, /id="tuning-advanced-parameters"/);
        assert.match(html, /Opening the chassis exposes mains voltage/);
        assert.match(appJs, /renderTuningPlan/);
        assert.match(tuningJs, /classic-v3/);
        assert.match(tuningJs, /elizabeth3/);
        assert.doesNotMatch(appJs, /tuning[^\n]*innerHTML/i);
    });

    it("defaults machine temperatures to Fahrenheit with an optional Celsius setting", () => {
        assert.match(html, /id="profile-temperature-unit"/);
        assert.match(html, /<option value="F">Fahrenheit \(default\)<\/option>/);
        assert.match(html, /<option value="C">Celsius<\/option>/);
        assert.match(appJs, /convertTemperature/);
        assert.match(rules, /"temperatureUnit"/);
    });

    it("selects Elizabeth or Bianca after login and keeps machine data separated", () => {
        assert.match(html, /id="view-machine-select"/);
        assert.match(html, /id="btn-select-elizabeth"/);
        assert.match(html, /id="btn-select-bianca"/);
        assert.match(html, /id="profile-machine-id"/);
        assert.match(appJs, /machineId: activeMachineId\(\)/);
        assert.match(appJs, /machineSelectionRequired = savedProfile\.machineId !== "elizabeth"/);
        assert.match(appJs, /app\.router\(machineSelectionRequired \? 'machine-select' : 'list'\)/);
        assert.match(rules, /data\.machineId == "bianca"/);
    });

    it("provides a version-aware Bianca tuning and maintenance experience", () => {
        assert.match(html, /id="view-bianca-tuning"/);
        assert.match(html, /id="bianca-tuning-advanced-parameters"/);
        assert.match(html, /id="maintenance-guide-bianca"/);
        assert.match(html, /70 liters \(about 28 full 2\.5-liter tanks\)/);
        assert.match(html, /Annual service:<\/strong> Lelit assigns hydraulic descaling/);
        assert.match(appJs, /diagnoseBiancaShot/);
        assert.match(biancaTuningJs, /low-flow START/i);
        assert.doesNotMatch(appJs, /bianca[^\n]*innerHTML/i);
    });

    it("captures optional shot observations for Elizabeth-specific diagnosis", () => {
        for (const id of ["input-shot-profile", "input-shot-taste", "input-shot-temperature", "input-shot-pressure", "input-shot-first-drop", "input-shot-channeling"]) {
            assert.match(html, new RegExp(`id="${id}"`));
        }
        assert.match(appJs, /channelingObserved/);
        assert.match(appJs, /firstDropSeconds/);
        assert.match(rules, /"profileUsed", "taste", "brewTemperature", "pressureObserved"/);
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
        assert.match(css, /bottom:\s*var\(--keyboard-inset, 0px\)/);
        assert.match(css, /body\[data-view="log-shot"\] #top-bar/);
        assert.match(routerJs, /document\.body\.dataset\.view = viewName/);
        assert.match(appJs, /window\.visualViewport\?\.addEventListener\("resize", syncKeyboardInset\)/);
        assert.doesNotMatch(css, /@keyframes fadeIn[^}]*transform/s);
        assert.match(html, /<label for="input-shot-time">Time<\/label>/);
        assert.match(html, /id="shot-yield-hint"/);
        assert.match(html, /Set time from profile/);
        assert.match(css, /#view-log-shot \.mini-actions \.small-btn\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
        assert.match(html, /id="btn-logout-settings"/);
    });

    it("uses the route-aware floating action as the single shot entry point", () => {
        assert.doesNotMatch(html, /id="btn-repeat-recipe"/);
        assert.doesNotMatch(html, /id="btn-adjust-recipe"/);
        assert.match(html, /id="fab-log-shot"/);
        assert.match(appJs, /on\("fab-log-shot", "click", \(\) => app\.openLogShot\(\)\)/);
        assert.match(appJs, /yieldInput\.value = ''/);
        assert.match(appJs, /Enter the actual yield\./);
    });

    it("keeps mobile extraction history compact", () => {
        assert.match(css, /\.log-row\s*\{[^}]*padding:\s*0\.85rem 1rem;[^}]*margin-bottom:\s*0\.65rem;/s);
        assert.match(css, /\.log-row-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
        assert.match(beanDetailViewJs, /orderedLogs\.slice\(0, 8\)/);
        assert.match(beanDetailViewJs, /Show \$\{orderedLogs\.length - 8\} older shots/);
    });

    it("returns bean-scoped analytics to the bean detail", () => {
        assert.match(html, /id="btn-back-analytics"/);
        assert.match(appJs, /openAnalytics\("current", "detail"\)/);
        assert.match(appJs, /analyticsReturnView === "detail"/);
    });

    it("provides useful feedback during a slow collection sync", () => {
        assert.match(appJs, /Still syncing… The first load can take a few seconds\./);
        assert.match(appJs, /window\.clearTimeout\(slowTimer\)/);
        assert.match(beanDetailViewJs, /Common Grinds/);
    });

    it("uses local install assets and registers an offline shell", () => {
        assert.match(html, /href="icon\.svg"/);
        assert.match(manifest, /"src": "icon\.svg"/);
        assert.match(appJs, /serviceWorker\.register\("\/sw\.js"\)/);
    });

    it("tracks owned maintenance records without injecting user notes as HTML", () => {
        assert.match(html, /id="view-maintenance"/);
        assert.match(html, /id="maintenance-quick-actions"/);
        assert.match(html, /id="maintenance-next-date"/);
        assert.match(maintenanceRepositoryJs, /collection\(db, "maintenance_records"\)/);
        assert.match(appJs, /saveMaintenancePreset/);
        assert.match(machineConfigJs, /monthsUntilDue:\s*1/);
        assert.match(machineConfigJs, /daysUntilDue:\s*7/);
        assert.match(maintenanceViewJs, /maintenance-notes/);
        assert.match(domJs, /textContent/);
        assert.doesNotMatch(allClientJs, /maintenance[^\n]*innerHTML/i);
        assert.match(rules, /match \/maintenance_records\/\{docId\}/);
        assert.match(rules, /validMaintenanceRecord/);
    });

    it("keeps Lelit manual guidance beside one-tap care actions", () => {
        assert.match(html, /After every use:<\/strong> Wipe the steam wand/);
        assert.match(html, /Monthly:<\/strong> Backflush/);
        assert.match(html, /Never put descaling products in the water tank/);
        assert.match(html, /Lelit Elizabeth PL92T manual, pages 23–25/);
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
        assert.match(collectionViewJs, /thumb\.loading = "lazy"/);
        assert.match(appJs, /runWhenIdle\(\(\) => app\.migrateLegacyImages\(\)\)/);
        assert.match(appJs, /updateBean\(bean\.id, \{ \.\.\.uploaded/);
    });

    it("avoids remote AI dependencies and serves the app shell stale-while-revalidate", () => {
        assert.doesNotMatch(html, /Gemini|True AI|daily-tip-text/i);
        assert.doesNotMatch(appJs, /httpsCallable|getFunctions|Gemini|aiEnabled|aiCache|getAIAdvice|Butler/);
        assert.doesNotMatch(firebaseConfig, /"functions"/);
        assert.match(serviceWorker, /request\.mode === "navigate"/);
        assert.match(serviceWorker, /respondWith\(network\.catch/);
        assert.match(serviceWorker, /caches\.match\(event\.request\)/);
        assert.match(serviceWorker, /event\.waitUntil\(update\.catch/);
    });

    it("shows and deploy-stamps the running commit", () => {
        assert.match(html, /class="build-chip">v1\.10\.0 · <code data-build-commit>__BUILD_COMMIT__</);
        assert.match(appJs, /querySelectorAll\("\[data-build-commit\]"\)/);
        assert.match(serviceWorker, /lincoln-barista-__BUILD_COMMIT__/);
        assert.match(mergeWorkflow, /Stamp build commit/);
        assert.match(previewWorkflow, /Stamp build commit/);
    });

    it("offers an explicit refresh when a deploy is ready", () => {
        assert.match(html, /id="update-banner"/);
        assert.match(html, /id="btn-refresh-app"[^>]*>Refresh now</);
        assert.match(appJs, /updatefound/);
        assert.match(appJs, /controllerchange/);
        assert.match(appJs, /APP_UPDATE_READY/);
        assert.match(appJs, /btn-refresh-app/);
        assert.match(serviceWorker, /APP_UPDATE_READY/);
        assert.match(serviceWorker, /client\.navigate\(client\.url\)/);
    });

    it("keeps the settings route wired to the header action", () => {
        assert.match(appJs, /on\("btn-open-settings", "click", \(\) => app\.openSettings\(\)\)/);
        assert.match(appJs, /openSettings:\s*\(\) =>/);
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
        assert.match(beanRepositoryJs, /archived:\s*true/);
        assert.doesNotMatch(beanRepositoryJs, /deleteDoc\(doc\(db,\s*"beans"/);
    });

    it("removes the legacy star field when an existing bean gets an impression", () => {
        assert.match(beanRepositoryJs, /rating:\s*deleteField\(\)/);
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
        assert.match(firebaseClientJs, /getStorage\(firebaseApp,\s*"gs:\/\/espresso-4298d\.firebasestorage\.app"\)/);
        assert.match(beanRepositoryJs, /uploadString\(ref,\s*dataUrl,\s*"data_url"/);
        assert.match(beanRepositoryJs, /imageUrl/);
        assert.match(beanRepositoryJs, /imagePath/);
        assert.match(rules, /"imageUrl"/);
        assert.match(rules, /"imagePath"/);
        assert.match(storageRules, /match \/users\/\{userId\}\/beans\/\{beanId\}\/\{fileName\}/);
        assert.match(storageRules, /request\.auth\.uid == userId/);
        assert.match(storageRules, /request\.resource\.size < 750000/);
    });
});
