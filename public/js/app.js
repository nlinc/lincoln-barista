/**
 * Lincoln Barista "Platinum Roast" - Main Application Logic
 * Modularized and Optimized for Mobile. v1.3.5 - UI Logic Refinement.
 */

import { observeAuthState, signInWithGoogle, signOutUser } from "./auth-repository.js?v=1.16.0";
import { chartOptions, renderAnalyticsMetrics, renderPatternList } from "./analytics-view.js?v=1.16.0";
import {
    archiveBean,
    createBean,
    createBeanId,
    deleteBeanPhoto,
    fetchBeansForUser,
    restoreBean,
    updateBean,
    uploadBeanPhoto
} from "./bean-repository.js?v=1.16.0";
import {
    chooseCurrentRecipe,
    renderBeanAge,
    renderBeanIdentity,
    renderCurrentRecipe as renderCurrentRecipeView,
    renderDialInSummary as renderDialInSummaryView,
    renderMachineBadge,
    renderShotHistory
} from "./bean-detail-view.js?v=1.16.0";
import { createMaintenanceRecord, deleteMaintenanceRecord, fetchMaintenanceForUser } from "./maintenance-repository.js?v=1.16.0";
import { renderBeanCollection, resolveBeanImpression } from "./collection-view.js?v=1.16.0";
import { cleanCatalogText, renderBeanCatalog, renderBeanMatchHint, reusableBeanDetails } from "./bean-catalog-view.js?v=1.16.0";
import { normalizeBeanRecord, normalizeBeanTags, recordTime } from "./bean-record.js?v=1.16.0";
import { el, on, renderEmpty, renderEmptyAction } from "./dom.js?v=1.16.0";
import { renderCareHome, renderMaintenanceView } from "./maintenance-view.js?v=1.16.0";
import { fetchUserProfile, saveUserProfile } from "./profile-repository.js?v=1.16.0";
import { navigate } from "./router.js?v=1.16.0";
import { createShot, deleteShot as deleteShotRecord, fetchShotsForUser, updateShot } from "./shot-repository.js?v=1.16.0";
import { renderBiancaPlan, renderBiancaReference, renderElizabethPlan, renderElizabethReference, renderTuningStart } from "./tuning-view.js?v=1.16.0";
import { tuningBeans, latestTuningShot, tuningRoast } from "./tuning-session.js?v=1.16.0";
import { getBrewAdvice } from "./brew-advice.js?v=1.16.0";
import { summarizeGrindFrequency, summarizeShotPatterns, validateShot } from "./shot-analytics.js?v=1.16.0";
import { convertTemperature, diagnoseElizabethShot } from "./elizabeth-tuning.js?v=1.16.0";
import { diagnoseBiancaShot } from "./bianca-tuning.js?v=1.16.0";
import {
    createDefaultUserProfile,
    localDateKey,
    maintenanceTime,
    normalizeBiancaProfile,
    normalizeElizabethProfile,
    normalizeUserProfile,
    presetDueDate,
    recordMachineId
} from "./machine-config.js?v=1.16.0";

import { calculateStartingPoint, normalizeStartingSetup } from "./starting-point.js?v=1.16.0";
import { readStartingSetup, renderStartingBasketOptions, renderStartingBeans, renderStartingResult, renderStartingSetup } from "./starting-point-view.js?v=1.16.0";

import { readShotMeasurements, renderShotFieldErrors, renderShotSaveError } from "./shot-form-view.js?v=1.16.0";

// App State
let currentUser = null;
let beans = [];
let catalogBeans = [];
let activeFilters = new Set();
let currentSort = 'newest';
let currentActiveBean = null;
let logsCache = [];
let allLogsCache = [];
let logsLoadPromise = null;
let allLogsLoaded = false;
let chartTrend = null;
let chartDist = null;
let chartAge = null;
let chartLoadPromise = null;
let userProfile = createDefaultUserProfile();
let currentEditingTags = [];
let currentEditingImage = null;
let currentEditingImagePath = null;
let currentRecipeShot = null;
let analyticsScope = 'all';
let analyticsReturnView = 'list';
let legacyMigrationStarted = false;
let historyExpanded = false;
let collectionExpanded = false;
let collectionScope = 'current';
let finishedSearch = '';
let shotValidationShown = false;
let collectionNotice = null;
const beanActionsPending = new Set();
let beanFetchSequence = 0;
let maintenanceRecords = [];
let maintenanceLoaded = false;
let maintenanceLoadError = false;
let maintenanceLoadPromise = null;
const maintenancePending = new Set();
let settingsTemperatureUnit = 'F';
let machineSelectionRequired = true;
let startingPlan = null;
let settingsMachineId = 'elizabeth';
let settingsStartingDrafts = {};
let startingReturnView = 'list';

// --- UTILS ---
const haptic = (type = 'light') => {
    if (!window.navigator.vibrate) return;
    if (type === 'light') window.navigator.vibrate(10);
    else if (type === 'medium') window.navigator.vibrate(30);
    else if (type === 'heavy') window.navigator.vibrate([50, 30, 50]);
};

const ratioFor = (shot) => {
    const dose = parseFloat(shot?.dose);
    const yieldVal = parseFloat(shot?.yield);
    if (!dose || isNaN(dose) || isNaN(yieldVal)) return null;
    return yieldVal / dose;
};

const activeMachineId = () => userProfile.machineId === "bianca" ? "bianca" : "elizabeth";
const activeMachineProfile = () => activeMachineId() === "bianca" ? normalizeBiancaProfile(userProfile.bianca) : normalizeElizabethProfile(userProfile.elizabeth);
const activeMaintenanceRecords = () => maintenanceRecords.filter(record => recordMachineId(record) === activeMachineId());

const updateTemperatureUnitLabels = (unit) => {
    document.querySelectorAll("[data-temperature-unit]").forEach(label => { label.textContent = unit; });
};

const formatDate = (dateLike) => {
    if (!dateLike) return "";
    const date = dateLike.toDate ? dateLike.toDate() : new Date(dateLike.seconds ? dateLike.seconds * 1000 : dateLike);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const downloadCsv = (filename, rows) => {
    const csv = rows.map(row => row.map(value => {
        const text = String(value ?? "");
        return /[",\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const MAX_IMAGE_EDGE = 480;
const MAX_IMAGE_BYTES = 750000;

const canvasToJpeg = (canvas, minQuality = 0.55) => {
    let quality = 0.78;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > MAX_IMAGE_BYTES && quality > minQuality) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
};

const isDataUrl = (value) => typeof value === "string" && value.startsWith("data:");

const beanImageSource = (bean) => bean?.imageUrl || bean?.image || null;

const logTime = (log) => recordTime(log?.date) / 1000;

const newestFirst = (logs) => [...logs].sort((a, b) => logTime(b) - logTime(a));

const loadChartLibrary = () => {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartLoadPromise) return chartLoadPromise;
    chartLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js";
        script.async = true;
        script.onload = () => resolve(window.Chart);
        script.onerror = () => { chartLoadPromise = null; reject(new Error("Charts could not be loaded.")); };
        document.head.appendChild(script);
    });
    return chartLoadPromise;
};

const runWhenIdle = (callback) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout: 3000 });
    else window.setTimeout(callback, 500);
};

const showStatus = (text, tone = "info") => {
    const status = document.getElementById("collection-status");
    if (!status) return;
    status.textContent = text;
    status.className = "status-strip status-" + tone;
};

const hideStatus = () => {
    const status = document.getElementById("collection-status");
    if (status) status.classList.add("hidden");
};

const syncKeyboardInset = () => {
    const viewport = window.visualViewport;
    const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
};

const app = {
    // --- ROUTING ---
    router: (view, addToHistory) => {
        navigate(view, addToHistory);
        if (view === 'detail' && currentActiveBean?.archived === true) document.getElementById('fab-log-shot').classList.add('hidden');
        if (view === 'list' && currentUser) app.renderBeanList();
    },

    // --- AUTH ---
    login: async () => { haptic('medium'); try { await signInWithGoogle(); } catch(e) { alert(e.message); } },
    logout: () => { if(confirm("Logout?")) { haptic('heavy'); signOutUser().then(() => location.reload()); } },
    selectMachine: async (machineId) => {
        const nextId = machineId === "bianca" ? "bianca" : "elizabeth";
        const oldId = activeMachineId();
        userProfile.machineId = nextId;
        if (!userProfile.machineName || userProfile.machineName === "Lelit Elizabeth" || userProfile.machineName === "Lelit Bianca") {
            userProfile.machineName = nextId === "bianca" ? "Lelit Bianca" : "Lelit Elizabeth";
        }
        await saveUserProfile(currentUser.uid, userProfile);
        machineSelectionRequired = false;
        if (oldId !== nextId) {
            currentRecipeShot = null;
            logsCache = currentActiveBean ? app.logsForBean(currentActiveBean.id) : [];
        }
        app.applyMachineUi();
        app.router('list');
        app.renderBeanList();
        app.renderCareHome();
    },
    applyMachineUi: () => {
        const isBianca = activeMachineId() === "bianca";
        document.getElementById('btn-open-detail-tuning').textContent = "Dial in next shot";
        document.getElementById('btn-open-tuning').setAttribute("aria-label", isBianca ? "Open Bianca tuning lab" : "Open Elizabeth tuning lab");
        document.querySelectorAll('[data-machine-option="elizabeth"]').forEach(option => { option.hidden = isBianca; });
        document.querySelectorAll('[data-machine-option="bianca"]').forEach(option => { option.hidden = !isBianca; });
        updateTemperatureUnitLabels(activeMachineProfile().temperatureUnit);
    },

    // --- BEAN MANAGEMENT ---
    fetchAllLogs: (force = false) => {
        if (allLogsLoaded && !force) return Promise.resolve(allLogsCache);
        if (logsLoadPromise && !force) return logsLoadPromise;
        logsLoadPromise = fetchShotsForUser(currentUser.uid).then(logs => {
            allLogsCache = newestFirst(logs);
            allLogsLoaded = true;
            return allLogsCache;
        }).finally(() => { logsLoadPromise = null; });
        return logsLoadPromise;
    },
    logsForBean: (beanId) => newestFirst(allLogsCache.filter(log => log.beanId === beanId && recordMachineId(log) === activeMachineId())),
    upsertCachedLog: (log) => {
        const index = allLogsCache.findIndex(item => item.id === log.id);
        if (index >= 0) allLogsCache[index] = log;
        else allLogsCache.unshift(log);
        allLogsCache = newestFirst(allLogsCache);
        if (currentActiveBean?.id === log.beanId) logsCache = app.logsForBean(log.beanId);
    },
    removeCachedLog: (logId) => {
        allLogsCache = allLogsCache.filter(log => log.id !== logId);
        logsCache = logsCache.filter(log => log.id !== logId);
    },
    fetchMaintenance: () => {
        if (maintenanceLoadPromise) return maintenanceLoadPromise;
        const uid = currentUser.uid;
        const request = fetchMaintenanceForUser(uid).then(records => {
            if (currentUser?.uid !== uid) return [];
            maintenanceRecords = records.sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
            maintenanceLoaded = true;
            maintenanceLoadError = false;
            app.renderCareHome();
            return maintenanceRecords;
        }).catch(error => {
            if (currentUser?.uid !== uid) return [];
            maintenanceLoadError = true;
            app.renderCareHome();
            throw error;
        }).finally(() => { if (maintenanceLoadPromise === request) maintenanceLoadPromise = null; });
        maintenanceLoadPromise = request;
        return request;
    },
    renderCareHome: () => {
        renderCareHome({
            machineId: activeMachineId(),
            records: activeMaintenanceRecords(),
            loaded: maintenanceLoaded,
            error: maintenanceLoadError,
            compact: collectionScope === 'finished' || beans.length <= 1,
            pending: maintenancePending,
            onQuickAction: (preset, button) => app.saveMaintenancePreset(preset, button),
            onOpen: () => app.openMaintenance()
        });
    },
    fetchBeans: async () => {
        const container = document.getElementById('bean-list-container');
        const uid = currentUser.uid;
        const fetchSequence = ++beanFetchSequence;
        if (container) renderEmpty(container, "Syncing collection...");
        const slowTimer = window.setTimeout(() => {
            if (fetchSequence === beanFetchSequence && container) {
                renderEmpty(container, "Still syncing… The first load can take a few seconds.");
            }
        }, 4500);
        try {
            const fetchedBeans = await fetchBeansForUser(uid);
            if (currentUser?.uid !== uid || fetchSequence !== beanFetchSequence) return;
            catalogBeans = fetchedBeans.map(normalizeBeanRecord);
            beans = catalogBeans.filter(bean => bean.archived !== true);
            hideStatus();
            app.renderBeanList();
            if (document.body.dataset.view === 'starting-point') {
                renderStartingBeans(beans, document.getElementById('starting-bean').value);
                app.selectStartingBean();
            }
            if (document.body.dataset.view === 'tuning') app.selectTuningBean('tuning', 'elizabeth');
            if (document.body.dataset.view === 'bianca-tuning') app.selectTuningBean('bianca-tuning', 'bianca');
            if (!legacyMigrationStarted && beans.some(bean => isDataUrl(bean.image) && !bean.imageUrl)) {
                legacyMigrationStarted = true;
                runWhenIdle(() => app.migrateLegacyImages());
            }
        } catch(e) {
            console.error("Bean fetch error:", e);
            showStatus("Couldn't sync your collection. Check your connection and try again.", "error");
            if (container) renderEmptyAction(container, "Sync unavailable", "Your saved beans could not be loaded right now.", "Retry", () => app.fetchBeans());
        } finally {
            window.clearTimeout(slowTimer);
        }
    },

    renderBeanList: () => {
        renderBeanCollection({
            beans: catalogBeans,
            activeFilters,
            currentSort,
            expanded: collectionExpanded,
            scope: collectionScope,
            query: finishedSearch,
            pending: beanActionsPending,
            notice: collectionNotice,
            onUndo: beanId => app.setBagFinished(beanId, false),
            onAdd: () => { app.resetBeanForm(); app.router("edit-bean"); },
            onShowFinished: () => app.setCollectionScope('finished'),
            onClearSearch: () => { app.setFinishedSearch(''); document.getElementById('finished-search').focus(); },
            onOpen: beanId => app.loadBeanDetail(beanId),
            onEdit: beanId => app.editBean(beanId),
            onFinish: beanId => app.setBagFinished(beanId, true),
            onRestore: beanId => app.setBagFinished(beanId, false),
            onReuse: beanId => app.newBagFromBean(beanId)
        });
        app.renderCareHome();
    },

    setSort: (value) => { currentSort = value; app.renderBeanList(); },
    toggleBeans: () => { collectionExpanded = !collectionExpanded; app.renderBeanList(); },
    setFinishedSearch: (query) => { finishedSearch = query; collectionExpanded = false; app.renderBeanList(); },
    setCollectionScope: (scope) => { collectionScope = scope; collectionExpanded = false; app.renderBeanList(); },

    setBagFinished: async (beanId, finished) => {
        const bean = catalogBeans.find(item => item.id === beanId);
        if (!bean || beanActionsPending.has(beanId) || !currentUser) return;
        const user = currentUser;
        beanActionsPending.add(beanId);
        app.renderBeanList();
        const formAction = document.getElementById('btn-delete-bean');
        const formSave = document.getElementById('btn-save-bean');
        if (document.body.dataset.view === 'edit-bean' && document.getElementById('input-bean-id').value === beanId) {
            formAction.disabled = true;
            formSave.disabled = true;
        }
        try {
            const savedFields = await (finished ? archiveBean(beanId) : restoreBean(beanId));
            if (currentUser !== user) return;
            const savedBean = catalogBeans.find(item => item.id === beanId);
            if (savedBean) {
                Object.assign(savedBean, { archived: finished }, savedFields);
                if (!finished) delete savedBean.archivedAt;
            }
            beans = catalogBeans.filter(item => item.archived !== true);
            if (currentActiveBean?.id === beanId) {
                Object.assign(currentActiveBean, { archived: finished }, savedFields);
                if (!finished) delete currentActiveBean.archivedAt;
            }
            collectionNotice = { text: `${bean.name || 'Bag'} ${finished ? 'finished. Shot history saved.' : 'is back in Current.'}`, undoId: finished ? beanId : null };
            if (!finished) collectionScope = 'current';
            const view = document.body.dataset.view;
            if ((view === 'edit-bean' && document.getElementById('input-bean-id').value === beanId) ||
                (view === 'detail' && currentActiveBean?.id === beanId)) app.router('list');
            haptic('light');
        } catch (error) {
            if (currentUser === user) {
                collectionNotice = { text: `Couldn’t ${finished ? 'finish' : 'put back'} this bag. Please try again.` };
                if (document.body.dataset.view === 'edit-bean') alert(collectionNotice.text);
                console.warn('Bag status save failed:', error);
            }
        } finally {
            beanActionsPending.delete(beanId);
            formAction.disabled = false;
            if (document.getElementById('input-bean-id').value === beanId) formSave.disabled = false;
            if (currentUser === user) app.renderBeanList();
        }
    },

    editBean: (beanId) => {
        currentActiveBean = catalogBeans.find(bean => bean.id === beanId);
        if (currentActiveBean) app.editActiveBean();
    },

    newBagFromBean: (beanId) => {
        const bean = catalogBeans.find(item => item.id === beanId);
        if (!bean) return;
        app.resetBeanForm();
        app.reuseBeanDetails(bean);
        app.router('edit-bean');
    },

    saveBean: async () => {
        const btn = document.getElementById('btn-save-bean');
        if (btn.disabled) return;
        haptic('medium');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Processing...";
        try {
            const id = document.getElementById('input-bean-id').value;
            const existingBean = id ? catalogBeans.find(bean => bean.id === id) : null;
            const beanId = id || createBeanId();
            const data = {
                uid: currentUser.uid,
                roaster: cleanCatalogText(document.getElementById('input-roaster').value),
                roasterLocation: cleanCatalogText(document.getElementById('input-roaster-location').value),
                name: cleanCatalogText(document.getElementById('input-name').value),
                origin: cleanCatalogText(document.getElementById('input-origin').value),
                roastLevel: document.getElementById('input-roast-level').value,
                tenBeanWeight: document.getElementById('input-ten-bean-weight').value.trim(),
                tags: normalizeBeanTags(currentEditingTags),
                impression: document.getElementById('input-bean-impression').value || null,
                updatedAt: new Date()
            };

            const manualRoastDate = document.getElementById('input-roast-date').value;

            if(!data.name) throw new Error("Bean name is required.");

            const imageFields = await app.prepareBeanImageFields(beanId, existingBean);
            
            if(id) await updateBean(beanId, { ...data, ...imageFields, currentRoastDate: manualRoastDate });
            else await createBean(beanId, { ...data, ...imageFields, currentRoastDate: manualRoastDate, createdAt: new Date() });
            if (!id) { collectionScope = 'current'; collectionNotice = null; }
            
            await app.fetchBeans();
            app.router('list');
        } catch(e) { alert(e.message); }
        finally { btn.disabled = false; btn.innerText = originalText; }
    },

    deleteBean: async () => {
        const beanId = document.getElementById('input-bean-id').value;
        const bean = catalogBeans.find(item => item.id === beanId);
        if (bean) await app.setBagFinished(beanId, bean.archived !== true);
    },

    editActiveBean: () => {
        haptic('light');
        const b = currentActiveBean;
        document.getElementById('bean-form-header').innerText = "Edit Bean";
        document.getElementById('input-bean-id').value = b.id;
        document.getElementById('input-roaster').value = b.roaster;
        document.getElementById('input-roaster-location').value = b.roasterLocation || '';
        document.getElementById('input-name').value = b.name;
        document.getElementById('input-origin').value = b.origin || '';
        document.getElementById('input-roast-level').value = b.roastLevel || 'Medium';
        document.getElementById('input-ten-bean-weight').value = b.tenBeanWeight || '';
        document.getElementById('input-roast-date').value = b.currentRoastDate || '';
        currentEditingTags = b.tags ? [...b.tags] : [];
        app.renderEditingTags();
        const imageSrc = beanImageSource(b);
        currentEditingImagePath = b.imagePath || null;
        if(imageSrc) {
            currentEditingImage = imageSrc;
            const preview = document.getElementById('edit-image-preview');
            preview.src = imageSrc;
            preview.classList.remove('hidden');
            document.getElementById('btn-remove-image').classList.remove('hidden');
        } else app.removeImage();
        app.setBeanImpression(resolveBeanImpression(b));
        app.renderBeanSuggestions();
        document.getElementById('bean-extra-details').open = Boolean(b.origin || b.roasterLocation || b.tenBeanWeight || b.tags?.length || imageSrc);
        document.getElementById('btn-delete-bean').classList.remove('hidden');
        document.getElementById('btn-delete-bean').textContent = b.archived === true ? 'Put back in Current' : 'Finish bag';
        document.getElementById('btn-save-bean').innerText = "Save Bean";
        app.router('edit-bean');
    },

    loadBeanDetail: async (id) => {
        try {
            currentActiveBean = catalogBeans.find(b => b.id === id);
            if(!currentActiveBean) return app.router('list');

            const roastDate = currentActiveBean.currentRoastDate || "Unknown";
            renderBeanIdentity(currentActiveBean);

            logsCache = [];
            currentRecipeShot = null;
            historyExpanded = false;
            document.getElementById("dial-in-console").classList.add("hidden");
            document.getElementById("detail-age").textContent = "";
            document.getElementById("stale-warning-container").classList.add("hidden");
            renderEmpty(document.getElementById("history-container"), "Loading shot history...");
            document.getElementById("dial-in-table-body").replaceChildren();
            app.router('detail');

            await app.fetchAllLogs();
            if (currentActiveBean?.id !== id) return;
            logsCache = app.logsForBean(id);

            renderBeanAge(roastDate);

            app.renderHistory();
            app.renderDialInSummary();
            app.renderCurrentRecipe();

            renderMachineBadge({
                b1: userProfile.b1,
                machineId: activeMachineId(),
                machineName: userProfile.machineName,
                machineVersion: activeMachineProfile().machineVersion
            });

        } catch(e) {
            console.error("Detail error:", e);
            if (currentActiveBean?.id === id) renderEmptyAction(document.getElementById("history-container"), "History unavailable", "Your saved recipe could not be loaded right now.", "Retry", () => app.loadBeanDetail(id));
        }
    },

    renderCurrentRecipe: () => {
        const recipe = chooseCurrentRecipe(logsCache, currentActiveBean?.roastLevel);
        currentRecipeShot = recipe?.shot || null;
        renderCurrentRecipeView(recipe);
    },

    renderHistory: () => {
        renderShotHistory({
            bean: currentActiveBean,
            expanded: historyExpanded,
            logs: logsCache,
            onEdit: shotId => app.openEditShot(shotId),
            onLog: () => currentActiveBean?.archived === true ? app.newBagFromBean(currentActiveBean.id) : app.openLogShot(),
            onToggle: () => {
                historyExpanded = !historyExpanded;
                app.renderHistory();
            }
        });
    },

    renderDialInSummary: () => {
        renderDialInSummaryView(logsCache);
    },

    handleImageUpload: (event) => {
        const file = event.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvasToJpeg(canvas);
                if (dataUrl.length > MAX_IMAGE_BYTES) {
                    alert("That image is still too large after resizing. Please choose a smaller photo.");
                    event.target.value = "";
                    return;
                }
                currentEditingImage = dataUrl;
                currentEditingImagePath = null;
                const preview = document.getElementById('edit-image-preview'); preview.src = currentEditingImage; preview.classList.remove('hidden');
                document.getElementById('btn-remove-image').classList.remove('hidden');
            };
            img.onerror = () => alert("That image could not be read. Please try another photo.");
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },
    uploadBeanImage: async (beanId, dataUrl) => {
        return uploadBeanPhoto(currentUser.uid, beanId, dataUrl);
    },
    deleteStoredImage: async (path) => {
        await deleteBeanPhoto(path);
    },
    prepareBeanImageFields: async (beanId, existingBean) => {
        if (!currentEditingImage) {
            await app.deleteStoredImage(existingBean?.imagePath);
            return { image: null, imageUrl: null, imagePath: null };
        }

        if (isDataUrl(currentEditingImage)) {
            const uploaded = await app.uploadBeanImage(beanId, currentEditingImage);
            if (existingBean?.imagePath && existingBean.imagePath !== uploaded.imagePath) {
                await app.deleteStoredImage(existingBean.imagePath);
            }
            return uploaded;
        }

        return {
            image: existingBean?.image || null,
            imageUrl: existingBean?.imageUrl || currentEditingImage,
            imagePath: currentEditingImagePath || existingBean?.imagePath || null
        };
    },
    migrateLegacyImages: async () => {
        const legacyBeans = beans.filter(bean => isDataUrl(bean.image) && !bean.imageUrl);
        for (const bean of legacyBeans) {
            try {
                const uploaded = await app.uploadBeanImage(bean.id, bean.image);
                await updateBean(bean.id, { ...uploaded, updatedAt: new Date() });
                Object.assign(bean, uploaded);
            } catch (error) {
                console.warn("Legacy image optimization skipped:", error);
                if (error?.code === "storage/unauthorized" || error?.code === "permission-denied") break;
            }
        }
    },
    removeImage: () => { currentEditingImage = null; currentEditingImagePath = null; document.getElementById('edit-image-preview').classList.add('hidden'); document.getElementById('btn-remove-image').classList.add('hidden'); },
    resetBeanForm: () => {
        ['input-bean-id', 'input-roaster', 'input-roaster-location', 'input-name', 'input-origin', 'input-ten-bean-weight'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('input-roast-date').value = '';
        document.getElementById('input-roast-level').value = 'Medium';
        document.getElementById('bean-form-header').innerText = "Add Bean";
        document.getElementById('btn-delete-bean').classList.add('hidden');
        document.getElementById('btn-save-bean').innerText = "Save Bean";
        currentEditingTags = []; currentEditingImagePath = null; app.renderEditingTags(); app.removeImage(); app.setBeanImpression('');
        app.renderBeanSuggestions();
        app.updateBeanMatchHint();
        document.getElementById('bean-extra-details').open = false;
        document.getElementById('bean-repeat').open = false;
    },
    setBeanImpression: (value, userInitiated = false) => {
        if (userInitiated) haptic('light');
        const input = document.getElementById('input-bean-impression');
        input.value = userInitiated && input.value === value ? '' : value;
        document.querySelectorAll('.impression-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.impression === input.value)));
    },
    renderBeanSuggestions: () => {
        renderBeanCatalog(catalogBeans);
        app.updateBeanMatchHint();
    },
    updateBeanMatchHint: () => renderBeanMatchHint(
        catalogBeans,
        document.getElementById('input-roaster').value,
        document.getElementById('input-name').value,
        document.getElementById('input-bean-id').value
    ),
    reuseBeanDetails: (sourceBean) => {
        const bean = sourceBean || catalogBeans.find(item => item.id === document.getElementById('input-repeat-bean').value);
        if (!bean) return;
        const details = reusableBeanDetails(bean);
        for (const [field, value] of Object.entries({
            'input-name': details.name,
            'input-roaster': details.roaster,
            'input-roaster-location': details.roasterLocation,
            'input-origin': details.origin,
            'input-roast-level': details.roastLevel,
            'input-ten-bean-weight': details.tenBeanWeight
        })) document.getElementById(field).value = value;
        currentEditingTags = details.tags;
        app.renderEditingTags();
        if (details.origin || details.roasterLocation || details.tenBeanWeight || details.tags.length) {
            document.getElementById('bean-extra-details').open = true;
        }
        app.updateBeanMatchHint();
    },
    renderEditingTags: () => {
        const container = document.getElementById('editing-tags-container');
        container.replaceChildren();
        currentEditingTags.forEach((t, i) => {
            const pill = document.createElement('span'); pill.className = 'tag-pill active'; pill.append(t, " ");
            const rm = el("button", "tag-remove", "✕");
            rm.onclick = () => app.removeTag(i);
            pill.appendChild(rm); container.appendChild(pill);
        });
    },
    addTag: () => {
        const input = document.getElementById('input-new-tag'); const tag = input.value.trim();
        if(tag && !currentEditingTags.includes(tag)) { currentEditingTags.push(tag); input.value = ''; app.renderEditingTags(); }
    },
    removeTag: (i) => { currentEditingTags.splice(i, 1); app.renderEditingTags(); },
    resetShotErrors: () => {
        shotValidationShown = false;
        renderShotFieldErrors();
        renderShotSaveError();
    },
    openLogShot: () => {
        if (currentActiveBean?.archived === true) return app.newBagFromBean(currentActiveBean.id);
        haptic('light');
        app.resetShotErrors();
        const machineProfile = activeMachineProfile();
        const isBianca = activeMachineId() === "bianca";
        const recipeShot = currentRecipeShot;
        updateTemperatureUnitLabels(machineProfile.temperatureUnit);
        app.applyMachineUi();
        document.getElementById('log-shot-title').innerText = recipeShot ? "New Shot from Recipe" : "Log Shot";
        document.getElementById('log-bean-name').innerText = [currentActiveBean?.roaster, currentActiveBean?.name].filter(Boolean).join(" · ");
        document.getElementById('input-log-bean-id').value = currentActiveBean?.id || '';
        document.getElementById('input-log-shot-id').value = '';
        document.getElementById('log-display-date').innerText = currentActiveBean?.currentRoastDate || "N/A";
        const defDose = userProfile.defaultDose || 18;
        document.getElementById('input-shot-dose').value = recipeShot?.dose || defDose;
        const yieldInput = document.getElementById('input-shot-yield');
        const yieldHint = document.getElementById('shot-yield-hint');
        yieldInput.value = '';
        yieldInput.placeholder = recipeShot?.yield || defDose * 2;
        yieldHint.textContent = recipeShot?.yield ? `Recipe target: ${recipeShot.yield}g. Enter the actual yield.` : '';
        yieldHint.classList.toggle('hidden', !recipeShot?.yield);
        document.getElementById('input-shot-grind').value = recipeShot?.grind || logsCache[0]?.grind || '';
        document.getElementById('input-shot-time').value = recipeShot?.time || '';
        const requestedProfile = recipeShot?.profileUsed || 'manual';
        document.getElementById('input-shot-profile').value = [...document.getElementById('input-shot-profile').options].some(option => option.value === requestedProfile && !option.hidden) ? requestedProfile : 'manual';
        document.getElementById('input-shot-taste').value = '';
        const recipeTemperature = recipeShot?.brewTemperature && recipeShot.temperatureUnit && recipeShot.temperatureUnit !== machineProfile.temperatureUnit
            ? convertTemperature(recipeShot.brewTemperature, recipeShot.temperatureUnit, machineProfile.temperatureUnit)
            : recipeShot?.brewTemperature;
        document.getElementById('input-shot-temperature').value = recipeTemperature || machineProfile.brewTemperature;
        document.getElementById('input-shot-pressure').value = machineProfile.observedPressure;
        document.getElementById('input-shot-first-drop').value = '';
        document.getElementById('input-shot-channeling').checked = false;
        const b1T = userProfile.b1 ? (parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0) : 30;
        const b2T = userProfile.b2 ? (parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0) : 30;
        document.getElementById('btn-time-1').innerText = "P1 (" + b1T + "s)";
        document.getElementById('btn-time-2').innerText = "P2 (" + b2T + "s)";
        document.getElementById('btn-time-1').classList.toggle('hidden', isBianca);
        document.getElementById('btn-time-2').classList.toggle('hidden', isBianca);
        document.getElementById('btn-save-shot').innerText = "Save Shot";
        document.getElementById('btn-delete-shot').classList.add('hidden');
        app.renderExtractionPreview();
        app.router('log-shot');
    },
    setTimeFromProfile: (n) => {
        let t = 30;
        if(n === 1 && userProfile.b1) t = (parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0);
        else if(n === 2 && userProfile.b2) t = (parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0);
        document.getElementById('input-shot-time').value = t;
        document.getElementById('input-shot-profile').value = n === 1 ? "p1" : "p2";
        app.renderExtractionPreview();
    },
    renderExtractionPreview: () => {
        if (shotValidationShown) renderShotFieldErrors(validateShot(readShotMeasurements()).fieldErrors);
        const t = document.getElementById('input-shot-time').value;
        const d = document.getElementById('input-shot-dose').value;
        const y = document.getElementById('input-shot-yield').value;
        if(t && d && y) {
            const mock = { time: t, dose: d, yield: y };
            const adv = getBrewAdvice(mock, currentActiveBean?.roastLevel);
            const r = ratioFor(mock);
            const taste = document.getElementById('input-shot-channeling').checked ? "channeling" : document.getElementById('input-shot-taste').value;
            const tuningContext = {
                roast: currentActiveBean?.roastLevel,
                symptom: taste,
                dose: d,
                yield: y,
                time: t,
                pressure: document.getElementById('input-shot-pressure').value,
                machineVersion: activeMachineProfile().machineVersion,
                temperatureUnit: activeMachineProfile().temperatureUnit
            };
            const tuning = taste ? (activeMachineId() === "bianca" ? diagnoseBiancaShot(tuningContext) : diagnoseElizabethShot(tuningContext)) : null;
            const next = tuning?.actions[0] ? " Next: " + tuning.actions[0] : "";
            document.getElementById('extraction-preview-text').innerText = "1:" + (r ? r.toFixed(1) : '?') + ". " + adv.text + next;
            document.getElementById('extraction-preview').classList.remove('hidden');
        } else document.getElementById('extraction-preview').classList.add('hidden');
    },
    saveShot: async () => {
        haptic('medium');
        renderShotSaveError();
        const saveButton = document.getElementById("btn-save-shot");
        const saveLabel = saveButton.textContent;
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        try {
            const bId = document.getElementById('input-log-bean-id').value;
            const sId = document.getElementById('input-log-shot-id').value;
            const data = {
                beanId: bId, uid: currentUser.uid,
                machineId: activeMachineId(),
                grind: document.getElementById('input-shot-grind').value.trim(),
                time: document.getElementById('input-shot-time').value.trim(),
                dose: document.getElementById('input-shot-dose').value.trim(),
                yield: document.getElementById('input-shot-yield').value.trim(),
                profileUsed: document.getElementById('input-shot-profile').value,
                taste: document.getElementById('input-shot-taste').value,
                brewTemperature: document.getElementById('input-shot-temperature').value.trim(),
                temperatureUnit: activeMachineProfile().temperatureUnit || "F",
                pressureObserved: document.getElementById('input-shot-pressure').value.trim(),
                firstDropSeconds: document.getElementById('input-shot-first-drop').value.trim(),
                channelingObserved: document.getElementById('input-shot-channeling').checked,
                date: new Date()
            };
            const validation = validateShot(data);
            shotValidationShown = true;
            renderShotFieldErrors(validation.fieldErrors, !validation.valid);
            if (!validation.valid) return;
            if(sId) {
                await updateShot(sId, data);
                app.upsertCachedLog({ id: sId, ...data });
            } else {
                data.roastDate = currentActiveBean?.currentRoastDate || "Unknown";
                const createdId = await createShot(data);
                app.upsertCachedLog({ id: createdId, ...data });
            }
            await app.loadBeanDetail(bId);
        } catch(e) { renderShotSaveError(`Couldn't save this shot. ${e.message || 'Please try again.'}`); }
        finally { saveButton.disabled = false; saveButton.textContent = saveLabel; }
    },
    openEditShot: (sId) => {
        const log = logsCache.find(l => l.id === sId); if(!log) return;
        app.resetShotErrors();
        document.getElementById('log-shot-title').innerText = "Edit Log";
        document.getElementById('log-bean-name').innerText = [currentActiveBean?.roaster, currentActiveBean?.name].filter(Boolean).join(" · ");
        document.getElementById('input-log-bean-id').value = currentActiveBean?.id || log.beanId;
        document.getElementById('input-log-shot-id').value = sId;
        document.getElementById('log-display-date').innerText = log.roastDate;
        document.getElementById('input-shot-grind').value = log.grind;
        document.getElementById('input-shot-time').value = log.time;
        document.getElementById('input-shot-dose').value = log.dose;
        document.getElementById('input-shot-yield').value = log.yield;
        document.getElementById('shot-yield-hint').classList.add('hidden');
        app.applyMachineUi();
        document.getElementById('input-shot-profile').value = log.profileUsed || 'manual';
        document.getElementById('input-shot-taste').value = log.taste || '';
        const profileUnit = activeMachineProfile().temperatureUnit || "F";
        const loggedTemperature = log.brewTemperature && log.temperatureUnit && log.temperatureUnit !== profileUnit
            ? convertTemperature(log.brewTemperature, log.temperatureUnit, profileUnit)
            : log.brewTemperature;
        document.getElementById('input-shot-temperature').value = loggedTemperature || activeMachineProfile().brewTemperature || '';
        document.getElementById('input-shot-pressure').value = log.pressureObserved || '';
        document.getElementById('input-shot-first-drop').value = log.firstDropSeconds || '';
        document.getElementById('input-shot-channeling').checked = log.channelingObserved === true;
        document.getElementById('btn-save-shot').innerText = "Update Log";
        document.getElementById('btn-delete-shot').classList.remove('hidden');
        app.renderExtractionPreview();
        app.router('log-shot');
    },
    deleteShot: async () => { if(confirm("Delete log?")) { const sId = document.getElementById('input-log-shot-id').value; const bId = document.getElementById('input-log-bean-id').value; await deleteShotRecord(sId); app.removeCachedLog(sId); await app.loadBeanDetail(bId); } },
    fetchProfile: async () => {
        try {
            const savedProfile = await fetchUserProfile(currentUser.uid);
            if (savedProfile) {
                machineSelectionRequired = savedProfile.machineId !== "elizabeth" && savedProfile.machineId !== "bianca";
                userProfile = normalizeUserProfile(savedProfile);
            } else {
                machineSelectionRequired = true;
            }
            app.applyMachineUi();
        } catch(e) {}
    },
    updateSettingsDisplay: () => {
        const b1 = (parseInt(document.getElementById('profile-b1-infusion').value)||0) + (parseInt(document.getElementById('profile-b1-bloom').value)||0) + (parseInt(document.getElementById('profile-b1-brew').value)||0);
        const b2 = (parseInt(document.getElementById('profile-b2-infusion').value)||0) + (parseInt(document.getElementById('profile-b2-bloom').value)||0) + (parseInt(document.getElementById('profile-b2-brew').value)||0);
        document.getElementById('profile-b1-total-display').innerText = b1;
        document.getElementById('profile-b2-total-display').innerText = b2;
    },
    openSettings: () => {
        if (document.body.dataset.view === 'settings') return;
        settingsMachineId = activeMachineId();
        settingsStartingDrafts = { ...userProfile.startingPoints };
        document.getElementById('settings-save-status').textContent = '';
        renderStartingSetup(settingsStartingDrafts[settingsMachineId], settingsMachineId);
        const elizabeth = normalizeElizabethProfile(userProfile.elizabeth);
        const bianca = normalizeBiancaProfile(userProfile.bianca);
        document.getElementById('profile-machine-id').value = activeMachineId();
        document.getElementById('profile-machine-name').value = userProfile.machineName;
        document.getElementById('profile-default-dose').value = userProfile.defaultDose;
        document.getElementById('profile-finer-direction').value = userProfile.finerDirection || "lower";
        document.getElementById('profile-machine-version').value = elizabeth.machineVersion;
        document.getElementById('profile-firmware').value = elizabeth.firmware;
        document.getElementById('profile-temperature-unit').value = elizabeth.temperatureUnit;
        document.getElementById('profile-brew-temperature').value = elizabeth.brewTemperature;
        document.getElementById('profile-steam-temperature').value = elizabeth.steamTemperature;
        document.getElementById('profile-observed-pressure').value = elizabeth.observedPressure;
        document.getElementById('profile-preinfusion-mode').value = elizabeth.preinfusionMode;
        document.getElementById('profile-bianca-version').value = bianca.machineVersion;
        document.getElementById('profile-bianca-firmware').value = bianca.firmware;
        document.getElementById('profile-bianca-temperature-unit').value = bianca.temperatureUnit;
        document.getElementById('profile-bianca-brew-temperature').value = bianca.brewTemperature;
        document.getElementById('profile-bianca-steam-temperature').value = bianca.steamTemperature;
        document.getElementById('profile-bianca-pressure').value = bianca.observedPressure;
        document.getElementById('profile-bianca-brew-offset').value = bianca.brewOffset;
        document.getElementById('profile-bianca-pi-on').value = bianca.preinfusionOn;
        document.getElementById('profile-bianca-pi-off').value = bianca.preinfusionOff;
        document.getElementById('profile-bianca-low-start').value = bianca.lowFlowStart;
        document.getElementById('profile-bianca-low-final').value = bianca.lowFlowFinal;
        settingsTemperatureUnit = elizabeth.temperatureUnit;
        app.updateTemperatureSettings(elizabeth.temperatureUnit, false);
        if(userProfile.b1) { document.getElementById('profile-b1-infusion').value = userProfile.b1.infusion; document.getElementById('profile-b1-bloom').value = userProfile.b1.bloom; document.getElementById('profile-b1-brew').value = userProfile.b1.brew; }
        if(userProfile.b2) { document.getElementById('profile-b2-infusion').value = userProfile.b2.infusion; document.getElementById('profile-b2-bloom').value = userProfile.b2.bloom; document.getElementById('profile-b2-brew').value = userProfile.b2.brew; }
        app.updateSettingsDisplay();
        app.updateBiancaTemperatureSettings(bianca.temperatureUnit, false);
        app.updateMachineSettingsFields(activeMachineId());
        app.router('settings');
    },
    updateMachineSettingsFields: (machineId) => {
        const isBianca = machineId === "bianca";
        document.getElementById('settings-elizabeth-fields').classList.toggle('hidden', isBianca);
        document.getElementById('settings-bianca-fields').classList.toggle('hidden', !isBianca);
        const suggestedName = isBianca ? "Lelit Bianca" : "Lelit Elizabeth";
        const input = document.getElementById('profile-machine-name');
        if (!input.value || input.value === "Lelit Elizabeth" || input.value === "Lelit Bianca") input.value = suggestedName;
    },
    switchSettingsMachine: (machineId) => {
        const { setup, error } = readStartingSetup(settingsMachineId);
        if (!document.getElementById('gear-form').reportValidity() || error) {
            document.getElementById('profile-machine-id').value = settingsMachineId;
            document.getElementById('settings-save-status').textContent = error || 'Check your basket and recipe preferences before switching machines.';
            return;
        }
        settingsStartingDrafts[settingsMachineId] = setup;
        settingsMachineId = machineId;
        renderStartingSetup(settingsStartingDrafts[settingsMachineId], settingsMachineId);
        app.updateMachineSettingsFields(machineId);
        document.getElementById('settings-save-status').textContent = '';
    },
    updateTemperatureSettings: (nextUnit, convertValues = true) => {
        const unit = nextUnit === "C" ? "C" : "F";
        const brewInput = document.getElementById('profile-brew-temperature');
        const steamInput = document.getElementById('profile-steam-temperature');
        if (convertValues && settingsTemperatureUnit !== unit) {
            const brew = convertTemperature(brewInput.value, settingsTemperatureUnit, unit);
            const steam = convertTemperature(steamInput.value, settingsTemperatureUnit, unit);
            if (brew !== null) brewInput.value = brew;
            if (steam !== null) steamInput.value = steam;
        }
        settingsTemperatureUnit = unit;
        document.getElementById('profile-temperature-unit').value = unit;
        brewInput.min = unit === "F" ? "175" : "80";
        brewInput.max = unit === "F" ? "230" : "110";
        brewInput.placeholder = unit === "F" ? "200" : "93";
        steamInput.min = unit === "F" ? "239" : "115";
        steamInput.max = unit === "F" ? "293" : "145";
        steamInput.placeholder = unit === "F" ? "275" : "135";
        updateTemperatureUnitLabels(unit);
    },
    updateBiancaTemperatureSettings: (nextUnit, convertValues = true) => {
        const unit = nextUnit === "C" ? "C" : "F";
        const brewInput = document.getElementById('profile-bianca-brew-temperature');
        const steamInput = document.getElementById('profile-bianca-steam-temperature');
        const offsetInput = document.getElementById('profile-bianca-brew-offset');
        const previous = document.getElementById('profile-bianca-temperature-unit').dataset.previousUnit || normalizeBiancaProfile(userProfile.bianca).temperatureUnit;
        if (convertValues && previous !== unit) {
            const brew = convertTemperature(brewInput.value, previous, unit);
            const steam = convertTemperature(steamInput.value, previous, unit);
            const offset = parseFloat(offsetInput.value);
            if (brew !== null) brewInput.value = brew;
            if (steam !== null) steamInput.value = steam;
            if (Number.isFinite(offset)) offsetInput.value = unit === "C" ? Math.round(offset * 5 / 9) : Math.round(offset * 9 / 5);
        }
        document.getElementById('profile-bianca-temperature-unit').dataset.previousUnit = unit;
        brewInput.min = unit === "F" ? "176" : "80";
        brewInput.max = unit === "F" ? "239" : "115";
        steamInput.min = unit === "F" ? "239" : "115";
        steamInput.max = unit === "F" ? "275" : "135";
        offsetInput.min = unit === "F" ? "-36" : "-20";
        offsetInput.max = unit === "F" ? "36" : "20";
        document.querySelectorAll('[data-bianca-temperature-unit]').forEach(label => { label.textContent = unit; });
    },
    saveProfile: async () => {
        const status = document.getElementById('settings-save-status');
        const { setup, error } = readStartingSetup(settingsMachineId);
        if (!document.getElementById('gear-form').reportValidity() || error) {
            status.textContent = error || 'Check your basket and recipe preferences.';
            return;
        }
        settingsStartingDrafts[settingsMachineId] = setup;
        const previousMachineId = activeMachineId();
        const b1 = { infusion: parseInt(document.getElementById('profile-b1-infusion').value) || 0, bloom: parseInt(document.getElementById('profile-b1-bloom').value) || 0, brew: parseInt(document.getElementById('profile-b1-brew').value) || 0 };
        const b2 = { infusion: parseInt(document.getElementById('profile-b2-infusion').value) || 0, bloom: parseInt(document.getElementById('profile-b2-bloom').value) || 0, brew: parseInt(document.getElementById('profile-b2-brew').value) || 0 };
        const temperatureUnit = document.getElementById('profile-temperature-unit').value === "C" ? "C" : "F";
        const elizabeth = normalizeElizabethProfile({
            machineVersion: document.getElementById('profile-machine-version').value,
            firmware: document.getElementById('profile-firmware').value.trim(),
            temperatureUnit,
            brewTemperature: document.getElementById('profile-brew-temperature').value,
            steamTemperature: document.getElementById('profile-steam-temperature').value,
            observedPressure: document.getElementById('profile-observed-pressure').value,
            preinfusionMode: document.getElementById('profile-preinfusion-mode').value
        });
        const bianca = normalizeBiancaProfile({
            machineVersion: document.getElementById('profile-bianca-version').value,
            firmware: document.getElementById('profile-bianca-firmware').value.trim(),
            temperatureUnit: document.getElementById('profile-bianca-temperature-unit').value,
            brewTemperature: document.getElementById('profile-bianca-brew-temperature').value,
            steamTemperature: document.getElementById('profile-bianca-steam-temperature').value,
            observedPressure: document.getElementById('profile-bianca-pressure').value,
            brewOffset: document.getElementById('profile-bianca-brew-offset').value,
            preinfusionOn: document.getElementById('profile-bianca-pi-on').value,
            preinfusionOff: document.getElementById('profile-bianca-pi-off').value,
            lowFlowStart: document.getElementById('profile-bianca-low-start').value,
            lowFlowFinal: document.getElementById('profile-bianca-low-final').value
        });
        const next = { ...userProfile, startingPoints: { ...settingsStartingDrafts }, machineId: settingsMachineId, machineName: document.getElementById('profile-machine-name').value, defaultDose: parseFloat(document.getElementById('profile-default-dose').value) || 18, finerDirection: document.getElementById('profile-finer-direction').value, b1, b2, elizabeth, bianca };
        const button = document.getElementById('btn-save-profile');
        button.disabled = true;
        status.textContent = 'Saving settings…';
        try {
            await saveUserProfile(currentUser.uid, next);
            userProfile = next;
        } catch (error) {
            status.textContent = 'Settings could not be saved. Your inputs are still here; try again.';
            return;
        } finally { button.disabled = false; }
        machineSelectionRequired = false;
        if (previousMachineId !== activeMachineId()) {
            currentRecipeShot = null;
            logsCache = currentActiveBean ? app.logsForBean(currentActiveBean.id) : [];
        }
        app.applyMachineUi();
        app.renderCareHome();
        status.textContent = 'Settings saved.';
    },
    openStartingPoint: () => {
        const fromDetail = document.body.dataset.view === 'detail';
        renderStartingBeans(beans, fromDetail ? currentActiveBean?.id : document.getElementById('starting-bean').value);
        startingReturnView = fromDetail ? 'detail' : 'list';
        renderStartingBasketOptions(normalizeStartingSetup(userProfile.startingPoints?.[activeMachineId()], activeMachineId()), activeMachineId());
        document.getElementById('starting-machine-context').textContent = `${userProfile.machineName} · ${activeMachineProfile().machineVersion} · default dose ${userProfile.defaultDose}g`;
        document.getElementById('starting-save-status').textContent = '';
        app.selectStartingBean();
        app.router('starting-point');
    },
    selectStartingBean: () => {
        const bean = beans.find(item => item.id === document.getElementById('starting-bean').value && !item.archived);
        const measurement = bean?.startingMeasurement;
        document.getElementById('starting-roast').value = measurement?.roast || tuningRoast(bean);
        document.getElementById('starting-process').value = measurement?.process || 'unknown';
        document.getElementById('starting-volume').value = measurement?.volume ?? '';
        document.getElementById('starting-save-measurement').disabled = !bean;
        document.getElementById('starting-save-status').textContent = '';
        app.renderStartingPoint();
    },
    renderStartingPoint: () => {
        const setup = normalizeStartingSetup(userProfile.startingPoints?.[activeMachineId()], activeMachineId());
        renderStartingBasketOptions(setup, activeMachineId());
        const validationError = !document.getElementById('starting-form').checkValidity() ? 'Check the recipe inputs.' : null;
        startingPlan = validationError ? { error: validationError } : calculateStartingPoint({
            setup,
            machineId: activeMachineId(),
            machine: activeMachineProfile(),
            defaultDose: userProfile.defaultDose,
            volume: document.getElementById('starting-volume').value,
            roast: document.getElementById('starting-roast').value,
            process: document.getElementById('starting-process').value,
            basketId: document.getElementById('starting-basket').value
        });
        renderStartingResult(startingPlan, !!document.getElementById('starting-bean').value);
    },
    saveStartingMeasurement: async () => {
        const bean = beans.find(item => item.id === document.getElementById('starting-bean').value && !item.archived);
        if (!bean || !document.getElementById('starting-volume').reportValidity()) return;
        const volume = document.getElementById('starting-volume').value;
        const measurement = { volume: volume === '' ? null : Number(volume), roast: document.getElementById('starting-roast').value, process: document.getElementById('starting-process').value };
        const button = document.getElementById('starting-save-measurement');
        button.disabled = true;
        const status = document.getElementById('starting-save-status');
        try {
            await updateBean(bean.id, { startingMeasurement: measurement, updatedAt: new Date() });
            bean.startingMeasurement = measurement;
            const catalogBean = catalogBeans.find(item => item.id === bean.id);
            if (catalogBean) catalogBean.startingMeasurement = measurement;
            status.textContent = 'Measurement saved for this bag.';
        } catch (error) { status.textContent = 'Measurement could not be saved. Your inputs are still here; try again.'; }
        finally { button.disabled = false; }
    },
    logStartingShot: async () => {
        if (!document.getElementById('starting-form').reportValidity()) return;
        app.renderStartingPoint();
        const plan = startingPlan;
        const bean = beans.find(item => item.id === document.getElementById('starting-bean').value && !item.archived);
        if (!bean || plan.error || !plan.canLog) return;
        const button = document.getElementById('starting-log-shot');
        button.disabled = true;
        try {
            await app.loadBeanDetail(bean.id);
            const savedRecipe = currentRecipeShot;
            currentRecipeShot = null;
            app.openLogShot();
            currentRecipeShot = savedRecipe;
            document.getElementById('input-shot-dose').value = plan.dose;
            document.getElementById('input-shot-yield').value = '';
            document.getElementById('input-shot-yield').placeholder = plan.yield;
            document.getElementById('input-shot-time').value = '';
            document.getElementById('input-shot-pressure').value = '';
            document.getElementById('input-shot-grind').value = userProfile.startingPoints?.[activeMachineId()]?.baselineGrind || '';
            document.getElementById('input-shot-temperature').value = plan.temperature;
            document.getElementById('shot-yield-hint').textContent = `Starting target: ${plan.dose}g in → ${plan.yield}g out, ${plan.time}, ${plan.basket.name}. Enter actual yield and time after brewing.`;
            document.getElementById('shot-yield-hint').classList.remove('hidden');
            app.renderExtractionPreview();
        } catch (error) { document.getElementById('starting-save-status').textContent = 'Shot form could not be opened. Try again.'; }
        finally { button.disabled = false; }
    },
    openTuning: async () => {
        if (activeMachineId() === "bianca") return app.openBiancaTuning();
        const fromDetail = document.body.dataset.view === 'detail';
        app.renderTuningReference();
        app.router('tuning');
        document.getElementById('tuning-recent-shot').textContent = "Loading recent shot…";
        let historyFailed = false;
        try { await app.fetchAllLogs(); } catch (error) { console.error("Tuning history unavailable:", error); historyFailed = true; }
        app.selectTuningBean('tuning', 'elizabeth', fromDetail ? currentActiveBean?.id : null);
        if (historyFailed) document.getElementById('tuning-recent-shot').textContent = 'Recent shot history is unavailable. You can still use a starting plan and log a new shot.';
    },
    selectTuningBean: (prefix, machineId, preferredBeanId = null) => {
        const available = tuningBeans(beans);
        const picker = document.getElementById(`${prefix}-bean`);
        const preferredId = preferredBeanId || picker.value || currentActiveBean?.id;
        const selectedBean = available.find(bean => bean.id === preferredId) || available[0] || null;
        const latestShot = selectedBean ? latestTuningShot(allLogsCache, selectedBean.id, machineId) : null;
        renderTuningStart({ prefix, beans: available, selectedBean, latestShot, machineName: machineId === 'bianca' ? 'Bianca' : 'Elizabeth' });
        document.getElementById(`${prefix}-roast`).value = tuningRoast(selectedBean);
        document.getElementById(`${prefix}-symptom`).value = 'starting';
        document.getElementById(`${prefix}-pressure`).value = '';
        if (machineId === 'bianca') app.renderBiancaTuningPlan();
        else app.renderTuningPlan();
    },
    logTuningShot: async (prefix) => {
        const selectedBean = beans.find(bean => bean.id === document.getElementById(`${prefix}-bean`).value && !bean.archived);
        if (!selectedBean) return;
        currentActiveBean = selectedBean;
        await app.loadBeanDetail(selectedBean.id);
        const savedRecipe = currentRecipeShot;
        currentRecipeShot = null;
        const latestShot = latestTuningShot(allLogsCache, selectedBean.id, activeMachineId());
        const starting = document.getElementById(`${prefix}-symptom`).value === 'starting';
        const context = {
            roast: document.getElementById(`${prefix}-roast`).value,
            dose: !starting && latestShot?.dose ? latestShot.dose : userProfile.defaultDose,
            machineVersion: activeMachineProfile().machineVersion,
            temperatureUnit: activeMachineProfile().temperatureUnit
        };
        const plan = prefix === 'bianca-tuning'
            ? diagnoseBiancaShot(context)
            : diagnoseElizabethShot(context);
        app.openLogShot();
        currentRecipeShot = savedRecipe;
        document.getElementById('input-shot-dose').value = context.dose;
        document.getElementById('input-shot-time').value = '';
        document.getElementById('input-shot-pressure').value = '';
        document.getElementById('input-shot-first-drop').value = '';
        document.getElementById('input-shot-taste').value = '';
        app.renderExtractionPreview();
        if (prefix !== 'tuning' || activeMachineProfile().machineVersion !== 'elizabeth3') {
            document.getElementById('input-shot-yield').placeholder = plan.baseline.yield;
            const hint = document.getElementById('shot-yield-hint');
            hint.textContent = `Tuning target: ${plan.baseline.dose}g in → ${plan.baseline.yield}g out. Confirm the actual dose and enter the actual yield and time after brewing.`;
            hint.classList.remove('hidden');
        }
    },
    renderTuningReference: () => {
        const elizabeth = normalizeElizabethProfile(userProfile.elizabeth);
        updateTemperatureUnitLabels(elizabeth.temperatureUnit);
        renderElizabethReference(elizabeth);
    },
    renderTuningPlan: () => {
        const elizabeth = normalizeElizabethProfile(userProfile.elizabeth);
        if (elizabeth.machineVersion === 'elizabeth3') {
            document.getElementById('tuning-plan').replaceChildren(el('div', 'status-strip status-warning', 'Elizabeth3 uses Pagaia profiles. Choose a bean and log a shot, then use its machine manual to plan the next profile.'));
            return;
        }
        const latestShot = latestTuningShot(allLogsCache, document.getElementById('tuning-bean').value, 'elizabeth');
        const starting = document.getElementById('tuning-symptom').value === 'starting';
        const advice = diagnoseElizabethShot({
            roast: document.getElementById('tuning-roast').value,
            symptom: document.getElementById('tuning-symptom').value,
            pressure: document.getElementById('tuning-pressure').value,
            dose: !starting && latestShot?.dose ? latestShot.dose : userProfile.defaultDose,
            yield: !starting ? latestShot?.yield : undefined,
            time: !starting ? latestShot?.time : undefined,
            startingGrind: latestShot?.grind,
            machineVersion: elizabeth.machineVersion,
            temperatureUnit: elizabeth.temperatureUnit
        });
        renderElizabethPlan(advice);
    },
    openBiancaTuning: async () => {
        const fromDetail = document.body.dataset.view === 'detail';
        app.renderBiancaTuningReference();
        app.router('bianca-tuning');
        document.getElementById('bianca-tuning-recent-shot').textContent = "Loading recent shot…";
        let historyFailed = false;
        try { await app.fetchAllLogs(); } catch (error) { console.error("Tuning history unavailable:", error); historyFailed = true; }
        app.selectTuningBean('bianca-tuning', 'bianca', fromDetail ? currentActiveBean?.id : null);
        if (historyFailed) document.getElementById('bianca-tuning-recent-shot').textContent = 'Recent shot history is unavailable. You can still use a starting plan and log a new shot.';
    },
    renderBiancaTuningReference: () => {
        const bianca = normalizeBiancaProfile(userProfile.bianca);
        renderBiancaReference(bianca);
    },
    renderBiancaTuningPlan: () => {
        const bianca = normalizeBiancaProfile(userProfile.bianca);
        const latestShot = latestTuningShot(allLogsCache, document.getElementById('bianca-tuning-bean').value, 'bianca');
        const starting = document.getElementById('bianca-tuning-symptom').value === 'starting';
        const advice = diagnoseBiancaShot({
            roast: document.getElementById('bianca-tuning-roast').value,
            symptom: document.getElementById('bianca-tuning-symptom').value,
            pressure: document.getElementById('bianca-tuning-pressure').value,
            dose: !starting && latestShot?.dose ? latestShot.dose : userProfile.defaultDose,
            yield: !starting ? latestShot?.yield : undefined,
            time: !starting ? latestShot?.time : undefined,
            machineVersion: bianca.machineVersion,
            temperatureUnit: bianca.temperatureUnit
        });
        renderBiancaPlan(advice);
    },
    openMaintenance: async () => {
        app.router('maintenance');
        document.getElementById('maintenance-machine-name').textContent = userProfile.machineName || "Espresso machine";
        document.getElementById('maintenance-guide-elizabeth').classList.toggle('hidden', activeMachineId() !== "elizabeth");
        document.getElementById('maintenance-guide-bianca').classList.toggle('hidden', activeMachineId() !== "bianca");
        document.getElementById('maintenance-completed-date').value = localDateKey();
        const status = document.getElementById('maintenance-status');
        status.textContent = "Syncing service history...";
        status.className = "status-strip";
        try {
            await app.fetchMaintenance();
            status.classList.add('hidden');
            app.renderMaintenance();
        } catch (error) {
            console.error("Maintenance fetch error:", error);
            status.textContent = "Couldn't sync maintenance history. Check your connection and try again.";
            status.className = "status-strip status-error";
        }
    },
    renderMaintenance: () => {
        renderMaintenanceView({
            machineId: activeMachineId(),
            records: activeMaintenanceRecords(),
            pending: maintenancePending,
            onDelete: recordId => app.deleteMaintenance(recordId),
            onQuickAction: (preset, button) => app.saveMaintenancePreset(preset, button)
        });
    },
    saveMaintenancePreset: async (preset, button) => {
        if (!maintenanceLoaded || maintenancePending.has(preset.type)) return;
        const completedDate = localDateKey();
        if (activeMaintenanceRecords().some(record => record.type === preset.type && record.completedDate === completedDate)) return;
        maintenancePending.add(preset.type);
        const data = {
            uid: currentUser.uid,
            machineId: activeMachineId(),
            type: preset.type,
            completedDate,
            nextDueDate: presetDueDate(preset, completedDate),
            notes: "",
            createdAt: new Date()
        };
        button.disabled = true;
        button.textContent = "Logging…";
        app.renderCareHome();
        app.renderMaintenance();
        try {
            const createdId = await createMaintenanceRecord(data);
            maintenanceRecords.push({ id: createdId, ...data });
            maintenanceRecords.sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
            maintenancePending.delete(preset.type);
            app.renderCareHome();
            app.renderMaintenance();
            haptic('medium');
        } catch (error) {
            maintenancePending.delete(preset.type);
            app.renderCareHome();
            app.renderMaintenance();
            alert(error.message);
        }
    },
    saveMaintenance: async () => {
        const button = document.getElementById('btn-save-maintenance');
        const completedDate = document.getElementById('maintenance-completed-date').value;
        const nextDueDate = document.getElementById('maintenance-next-date').value;
        if (!completedDate) return alert("Choose the date this service was completed.");
        if (completedDate > localDateKey()) return alert("A completed service cannot be in the future.");
        if (nextDueDate && nextDueDate < completedDate) return alert("Next due date must be after the completed date.");
        const data = {
            uid: currentUser.uid,
            machineId: activeMachineId(),
            type: document.getElementById('maintenance-type').value,
            completedDate,
            nextDueDate,
            notes: document.getElementById('maintenance-notes').value.trim(),
            createdAt: new Date()
        };
        button.disabled = true;
        button.textContent = "Saving...";
        try {
            const createdId = await createMaintenanceRecord(data);
            maintenanceRecords.push({ id: createdId, ...data });
            maintenanceRecords.sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
            document.getElementById('maintenance-next-date').value = '';
            document.getElementById('maintenance-notes').value = '';
            app.renderCareHome();
            app.renderMaintenance();
            haptic('medium');
        } catch (error) {
            alert(error.message);
        } finally {
            button.disabled = false;
            button.textContent = "Save Service";
        }
    },
    deleteMaintenance: async (recordId) => {
        if (!confirm("Delete this maintenance record?")) return;
        try {
            await deleteMaintenanceRecord(recordId);
            maintenanceRecords = maintenanceRecords.filter(record => record.id !== recordId);
            app.renderCareHome();
            app.renderMaintenance();
        } catch (error) {
            alert(error.message);
        }
    },
    openAnalytics: async (scope = analyticsScope, returnView) => {
        if (returnView) analyticsReturnView = returnView;
        analyticsScope = scope;
        app.router('analytics');
        document.getElementById("analytics-insight-text").innerText = "Loading shot patterns...";
        try {
            const useCurrentBean = analyticsScope === "current" && currentActiveBean?.id;
            const loadedLogs = (await app.fetchAllLogs()).filter(log => recordMachineId(log) === activeMachineId());
            const logs = (useCurrentBean ? loadedLogs.filter(log => log.beanId === currentActiveBean.id) : loadedLogs)
                .slice().sort((a, b) => logTime(a) - logTime(b));
            try { await loadChartLibrary(); }
            catch (error) { console.warn("Chart loading skipped:", error); }
            app.renderAnalytics(logs);
        } catch(e) {
            console.error("Analytics error:", e);
            document.getElementById("analytics-insight-text").innerText = "Analytics are momentarily unavailable.";
        }
    },
    renderAnalytics: (logs) => {
        const summary = summarizeShotPatterns(logs, catalogBeans, { finerDirection: userProfile.finerDirection });
        const usableLogs = summary.usable;
        const ageEmpty = document.getElementById("age-empty-state");
        const trendEmpty = document.getElementById("trend-empty-state");
        const distEmpty = document.getElementById("dist-empty-state");
        const currentBtn = document.getElementById("btn-analytics-current");
        const allBtn = document.getElementById("btn-analytics-all");
        const hasCurrentBean = Boolean(currentActiveBean?.id);
        currentBtn.disabled = !hasCurrentBean;
        currentBtn.classList.toggle("active", analyticsScope === "current" && hasCurrentBean);
        allBtn.classList.toggle("active", analyticsScope !== "current" || !hasCurrentBean);
        const hasChartLibrary = Boolean(window.Chart);
        const hasData = usableLogs.length > 0;
        const canChart = hasData && hasChartLibrary;
        const hasAgeData = summary.agePoints.length >= 2 && hasChartLibrary;
        ageEmpty.textContent = hasChartLibrary ? "Log complete shots across several roast ages to see drift." : "Charts could not be loaded. Pattern cards are still available.";
        ageEmpty.classList.toggle("hidden", hasAgeData);
        trendEmpty.textContent = hasChartLibrary ? "Log a few shots to see trends." : "Charts could not be loaded. Pattern cards are still available.";
        distEmpty.textContent = hasChartLibrary ? "Log a few shots to see distribution." : "Charts could not be loaded. Pattern cards are still available.";
        trendEmpty.classList.toggle("hidden", canChart);
        distEmpty.classList.toggle("hidden", canChart);
        document.getElementById("age-chart-note").textContent = summary.isSingleBean
            ? "Dots are this bean's actual settings. The line estimates whether you usually move finer or coarser as it ages."
            : "Above 0 means finer and below 0 means coarser than each bean's first shot. Use the line as a starting adjustment, then stop by taste.";
        document.getElementById("analytics-insight-text").innerText = hasData
            ? `Readout based on ${summary.metrics.shots} complete shot${summary.metrics.shots === 1 ? "" : "s"}. Patterns describe correlation, not causation.`
            : "Complete grind, dose, yield, and time values will unlock pattern analysis.";
        renderAnalyticsMetrics(summary.metrics);
        renderPatternList(summary.insights);
        if (!canChart) {
            if (chartAge) { chartAge.destroy(); chartAge = null; }
            if (chartTrend) { chartTrend.destroy(); chartTrend = null; }
            if (chartDist) { chartDist.destroy(); chartDist = null; }
            return;
        }

        const trendPoints = usableLogs.slice(-30).map(log => ({ x: log.grind, y: log.yield }));
        const grindFrequency = summarizeGrindFrequency(usableLogs);

        if (chartAge) chartAge.destroy();
        if (chartTrend) chartTrend.destroy();
        if (chartDist) chartDist.destroy();
        if (hasAgeData) {
            const ageDatasets = [{
                label: "Logged shots",
                data: summary.agePoints,
                backgroundColor: "rgba(251,191,36,0.52)",
                pointRadius: 3
            }];
            if (summary.ageTrend) {
                const ages = summary.agePoints.map(point => point.x);
                const firstAge = Math.min(...ages);
                const lastAge = Math.max(...ages);
                ageDatasets.push({
                    type: "line",
                    label: "Typical direction",
                    data: [
                        { x: firstAge, y: summary.ageTrend.intercept + summary.ageTrend.slope * firstAge },
                        { x: lastAge, y: summary.ageTrend.intercept + summary.ageTrend.slope * lastAge }
                    ],
                    borderColor: "#fbbf24",
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0
                });
            }
            chartAge = new window.Chart(document.getElementById("ageChart"), {
                type: "scatter",
                data: { datasets: ageDatasets },
                options: chartOptions("Days off roast", summary.isSingleBean ? "Grind setting" : "Finer (+) / coarser (−)", { showLegend: Boolean(summary.ageTrend) })
            });
        } else chartAge = null;
        chartTrend = new window.Chart(document.getElementById("trendChart"), {
            type: "scatter",
            data: { datasets: [{ label: "Yield", data: trendPoints, backgroundColor: "#fbbf24" }] },
            options: chartOptions("Grind", "Yield (g)")
        });
        chartDist = new window.Chart(document.getElementById("distChart"), {
            type: "bar",
            data: { labels: grindFrequency.map(item => item.label), datasets: [{ label: "Logs", data: grindFrequency.map(item => item.count), backgroundColor: "#38bdf8" }] },
            options: chartOptions("Grind", "Shot count")
        });
    },
    exportData: async () => {
        const [logs, beanSnap, maintenance] = await Promise.all([
            app.fetchAllLogs(),
            fetchBeansForUser(currentUser.uid),
            app.fetchMaintenance()
        ]);
        const beanLookup = new Map(beanSnap.map(bean => [bean.id, bean]));
        const rows = [["date", "machine", "bean", "roaster", "roast_date", "grind", "time", "dose", "yield", "machine_profile", "taste", "brew_temperature", "temperature_unit", "shot_gauge_bar", "first_drop_seconds", "channeling_observed"]];
        logs.forEach(log => {
            const bean = beanLookup.get(log.beanId) || beans.find(b => b.id === log.beanId) || {};
            rows.push([formatDate(log.date), recordMachineId(log), bean.name || log.beanId, bean.roaster || "", log.roastDate || "", log.grind, log.time, log.dose, log.yield, log.profileUsed || "", log.taste || "", log.brewTemperature || "", log.temperatureUnit || activeMachineProfile().temperatureUnit || "F", log.pressureObserved || "", log.firstDropSeconds || "", log.channelingObserved === true]);
        });
        downloadCsv("lincoln-barista-export.csv", rows);
        const maintenanceRows = [["completed_date", "machine", "service", "next_due_date", "notes"]];
        maintenance.forEach(record => maintenanceRows.push([record.completedDate, recordMachineId(record), record.type, record.nextDueDate, record.notes]));
        downloadCsv("lincoln-barista-maintenance.csv", maintenanceRows);
    },
    promptNewDate: async () => app.editActiveBean()
};

window.app = app;
document.querySelectorAll("[data-build-commit]").forEach(buildCommit => {
    if (buildCommit.textContent.includes("__BUILD_COMMIT__")) buildCommit.textContent = "development";
});
const showAppUpdate = (build) => {
    const banner = document.getElementById("update-banner");
    const label = document.getElementById("update-build-label");
    if (build && build !== "__BUILD_COMMIT__") label.textContent = `Build ${build} is ready. Refresh to update.`;
    banner.classList.remove("hidden");
};
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        const hadController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener("message", event => {
            if (hadController && event.data?.type === "APP_UPDATE_READY") showAppUpdate(event.data.build);
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (hadController) showAppUpdate();
        });
        try {
            const registration = await navigator.serviceWorker.register("/sw.js");
            if (registration.waiting && hadController) showAppUpdate();
            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                worker?.addEventListener("statechange", () => {
                    if (worker.state === "installed" && navigator.serviceWorker.controller) showAppUpdate();
                });
            });
        } catch { /* The app still works online without installation support. */ }
    });
}
observeAuthState(async u => {
    currentUser = u;
    userProfile = createDefaultUserProfile();
    startingPlan = null;
    beans = [];
    collectionExpanded = false;
    collectionScope = 'current';
    finishedSearch = '';
    app.resetShotErrors();
    collectionNotice = null;
    beanActionsPending.clear();
    catalogBeans = [];
    currentActiveBean = null;
    currentRecipeShot = null;
    logsCache = [];
    maintenanceRecords = [];
    maintenanceLoaded = false;
    maintenanceLoadError = false;
    maintenanceLoadPromise = null;
    maintenancePending.clear();
    if (!u) { app.router('login'); return; }
    allLogsCache = [];
    allLogsLoaded = false;
    logsLoadPromise = null;
    await app.fetchProfile();
    app.applyMachineUi();
    app.router(machineSelectionRequired ? 'machine-select' : 'list');
    app.renderCareHome();
    app.fetchMaintenance().catch(console.error);
    app.fetchAllLogs().catch(console.error);
    app.fetchBeans();
});
on("btn-login", "click", () => app.login()); on("btn-open-settings", "click", () => app.openSettings()); on("btn-open-tuning", "click", () => app.openTuning()); on("btn-logout-settings", "click", () => app.logout());
on("btn-select-elizabeth", "click", () => app.selectMachine("elizabeth")); on("btn-select-bianca", "click", () => app.selectMachine("bianca"));
on("btn-open-maintenance", "click", () => app.openMaintenance()); on("btn-save-maintenance", "click", () => app.saveMaintenance());
on("btn-toggle-beans", "click", () => app.toggleBeans());
on("finished-search", "input", event => app.setFinishedSearch(event.target.value));
on("btn-clear-finished-search", "click", () => { app.setFinishedSearch(''); document.getElementById('finished-search').focus(); });
on("btn-current-beans", "click", () => app.setCollectionScope('current')); on("btn-finished-beans", "click", () => app.setCollectionScope('finished'));
on("input-sort-beans", "change", (e) => app.setSort(e.target.value)); on("fab-add-bean", "click", () => { app.resetBeanForm(); app.router("edit-bean"); }); on("fab-log-shot", "click", () => app.openLogShot());
on("input-bean-image", "change", (e) => app.handleImageUpload(e)); on("btn-remove-image", "click", () => app.removeImage()); on("btn-add-tag", "click", () => app.addTag());
on("btn-reuse-bean", "click", () => app.reuseBeanDetails());
on("btn-detail-new-bag", "click", () => app.newBagFromBean(currentActiveBean?.id));
on("input-name", "input", () => app.updateBeanMatchHint()); on("input-roaster", "input", () => app.updateBeanMatchHint());
on("input-new-tag", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); app.addTag(); } });
document.querySelectorAll(".impression-button").forEach(button => button.onclick = () => app.setBeanImpression(button.dataset.impression, true));
on("btn-save-bean", "click", () => app.saveBean()); on("btn-cancel-bean", "click", () => app.router("list")); on("btn-delete-bean", "click", () => app.deleteBean());
on("btn-edit-active-bean", "click", () => app.editActiveBean()); on("btn-update-roast-date", "click", () => app.promptNewDate());
on("btn-open-detail-tuning", "click", () => app.openTuning());
on("btn-new-starting-point", "click", () => app.openStartingPoint());
on("btn-detail-starting-point", "click", () => app.openStartingPoint());
on("btn-starting-back", "click", () => app.router(startingReturnView === 'detail' && currentActiveBean ? 'detail' : 'list'));
on("btn-starting-settings", "click", () => { app.openSettings(); document.getElementById('gear-form').scrollIntoView({ block: 'start' }); });
on("starting-bean", "change", () => app.selectStartingBean());
const revealInvalidField = event => {
    let details = event.target.closest('details');
    while (details) {
        details.open = true;
        details = details.parentElement.closest('details');
    }
};
document.getElementById('starting-form').addEventListener('invalid', revealInvalidField, true);
document.getElementById('gear-form').addEventListener('invalid', revealInvalidField, true);
on("gear-form", "submit", event => { event.preventDefault(); app.saveProfile(); });
on("starting-form", "submit", event => { event.preventDefault(); app.renderStartingPoint(); });
on("starting-form", "change", () => app.renderStartingPoint());
on("starting-save-measurement", "click", () => app.saveStartingMeasurement());
on("starting-log-shot", "click", () => app.logStartingShot());
on("btn-open-detail-analytics", "click", () => app.openAnalytics("current", "detail"));
on("btn-analytics-current", "click", () => app.openAnalytics("current"));
on("btn-analytics-all", "click", () => app.openAnalytics("all"));
on("btn-back-analytics", "click", () => app.router(analyticsReturnView === "detail" && currentActiveBean ? "detail" : "list"));
document.querySelectorAll("[data-route]").forEach(b => b.onclick = () => app.router(b.dataset.route));
on("btn-time-1", "click", () => app.setTimeFromProfile(1)); on("btn-time-2", "click", () => app.setTimeFromProfile(2));
document.querySelectorAll(".shot-preview-input").forEach(input => input.addEventListener("input", () => app.renderExtractionPreview()));
on("input-shot-taste", "change", () => app.renderExtractionPreview()); on("input-shot-pressure", "input", () => app.renderExtractionPreview()); on("input-shot-channeling", "change", () => app.renderExtractionPreview());
document.querySelectorAll("#view-settings input[type='number']").forEach(input => input.addEventListener("input", () => app.updateSettingsDisplay()));
on("profile-temperature-unit", "change", event => app.updateTemperatureSettings(event.target.value));
on("profile-bianca-temperature-unit", "change", event => app.updateBiancaTemperatureSettings(event.target.value));
on("profile-machine-id", "change", event => app.switchSettingsMachine(event.target.value));
on("tuning-roast", "change", () => app.renderTuningPlan()); on("tuning-symptom", "change", () => app.renderTuningPlan()); on("tuning-pressure", "input", () => app.renderTuningPlan());
on("bianca-tuning-roast", "change", () => app.renderBiancaTuningPlan()); on("bianca-tuning-symptom", "change", () => app.renderBiancaTuningPlan()); on("bianca-tuning-pressure", "input", () => app.renderBiancaTuningPlan());
on("tuning-bean", "change", () => app.selectTuningBean('tuning', 'elizabeth'));
on("bianca-tuning-bean", "change", () => app.selectTuningBean('bianca-tuning', 'bianca'));
on("tuning-log-shot", "click", () => app.logTuningShot('tuning'));
on("bianca-tuning-log-shot", "click", () => app.logTuningShot('bianca-tuning'));
on("btn-save-shot", "click", () => app.saveShot()); on("btn-cancel-shot", "click", () => app.router("detail")); on("btn-cancel-shot-top", "click", () => app.router("detail")); on("btn-delete-shot", "click", () => app.deleteShot());
on("btn-save-profile", "click", () => app.saveProfile()); on("btn-export-data", "click", () => app.exportData()); on("btn-open-analytics", "click", () => app.openAnalytics("all", "list"));
on("btn-tuning-open-settings", "click", () => app.openSettings());
on("btn-bianca-tuning-open-settings", "click", () => app.openSettings());
on("btn-refresh-app", "click", () => window.location.reload());
window.visualViewport?.addEventListener("resize", syncKeyboardInset);
window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser) app.renderCareHome();
});
syncKeyboardInset();
window.addEventListener('popstate', (e) => { if (e.state?.view) app.router(e.state.view, false); });
