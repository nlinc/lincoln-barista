/**
 * Lincoln Barista "Platinum Roast" - Main Application Logic
 * Modularized and Optimized for Mobile. v1.3.5 - UI Logic Refinement.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js?v=1.9.4";
import { getBrewAdvice } from "./brew-advice.js?v=1.9.4";
import { summarizeGrindFrequency, summarizeShotPatterns, validateShot } from "./shot-analytics.js?v=1.9.4";
import {
    ELIZABETH_ADVANCED_PARAMETERS,
    ELIZABETH_SOURCES,
    convertTemperature,
    diagnoseElizabethShot,
    explainPreinfusionMode
} from "./elizabeth-tuning.js?v=1.9.4";
import {
    BIANCA_ADVANCED_PARAMETERS,
    BIANCA_SOURCES,
    diagnoseBiancaShot,
    explainBiancaFlow
} from "./bianca-tuning.js?v=1.9.4";

// Initialize Firebase
const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);
const storage = getStorage(appInstance, 'gs://espresso-4298d.firebasestorage.app');
const provider = new GoogleAuthProvider();

// App State
let currentUser = null;
let beans = [];
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
let userProfile = {
    machineId: 'elizabeth',
    machineName: 'Lelit Elizabeth',
    defaultDose: 18,
    finerDirection: 'lower',
    b1: { infusion: 3, bloom: 2, brew: 25 },
    b2: { infusion: 5, bloom: 7, brew: 28 },
    elizabeth: {
        machineVersion: 'classic-v3',
        firmware: '',
        temperatureUnit: 'F',
        brewTemperature: 200,
        steamTemperature: 275,
        observedPressure: '',
        preinfusionMode: 'auto'
    },
    bianca: {
        machineVersion: 'v3',
        firmware: '',
        temperatureUnit: 'F',
        brewTemperature: 200,
        steamTemperature: 257,
        observedPressure: '',
        brewOffset: 0,
        preinfusionOn: 0,
        preinfusionOff: 0,
        lowFlowStart: 0,
        lowFlowFinal: 0
    }
};
let currentEditingTags = [];
let currentEditingImage = null;
let currentEditingImagePath = null;
let currentRecipeShot = null;
let analyticsScope = 'all';
let analyticsReturnView = 'list';
let legacyMigrationStarted = false;
let historyExpanded = false;
let beanFetchSequence = 0;
let maintenanceRecords = [];
let settingsTemperatureUnit = 'F';
let machineSelectionRequired = true;

// --- UTILS ---
const haptic = (type = 'light') => {
    if (!window.navigator.vibrate) return;
    if (type === 'light') window.navigator.vibrate(10);
    else if (type === 'medium') window.navigator.vibrate(30);
    else if (type === 'heavy') window.navigator.vibrate([50, 30, 50]);
};

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

const renderEmpty = (target, text) => {
    target.replaceChildren(el("div", "empty-state", text));
};

const renderEmptyAction = (target, title, body, actionText, action) => {
    const empty = el("div", "empty-panel");
    empty.append(el("div", "empty-panel-title", title), el("div", "empty-panel-copy", body));
    if (actionText && action) {
        const button = el("button", "btn empty-panel-action", actionText);
        button.type = "button";
        button.addEventListener("click", action);
        empty.appendChild(button);
    }
    target.replaceChildren(empty);
};

const ratioFor = (shot) => {
    const dose = parseFloat(shot?.dose);
    const yieldVal = parseFloat(shot?.yield);
    if (!dose || isNaN(dose) || isNaN(yieldVal)) return null;
    return yieldVal / dose;
};

const normalizeElizabethProfile = (value = {}) => {
    const temperatureUnit = value.temperatureUnit === "C" ? "C" : "F";
    return {
        machineVersion: ["classic-v3", "classic-early", "elizabeth3", "unknown"].includes(value.machineVersion) ? value.machineVersion : "classic-v3",
        firmware: typeof value.firmware === "string" ? value.firmware : "",
        temperatureUnit,
        brewTemperature: Number.isFinite(parseFloat(value.brewTemperature)) ? parseFloat(value.brewTemperature) : (temperatureUnit === "F" ? 200 : 93),
        steamTemperature: Number.isFinite(parseFloat(value.steamTemperature)) ? parseFloat(value.steamTemperature) : (temperatureUnit === "F" ? 275 : 135),
        observedPressure: Number.isFinite(parseFloat(value.observedPressure)) ? parseFloat(value.observedPressure) : "",
        preinfusionMode: ["auto", "steam", "bloom", "none"].includes(value.preinfusionMode) ? value.preinfusionMode : "auto"
    };
};

const normalizeBiancaProfile = (value = {}) => {
    const temperatureUnit = value.temperatureUnit === "C" ? "C" : "F";
    const numberOr = (field, fallback) => Number.isFinite(parseFloat(value[field])) ? parseFloat(value[field]) : fallback;
    return {
        machineVersion: ["v3", "v2", "v1", "unknown"].includes(value.machineVersion) ? value.machineVersion : "v3",
        firmware: typeof value.firmware === "string" ? value.firmware : "",
        temperatureUnit,
        brewTemperature: numberOr("brewTemperature", temperatureUnit === "F" ? 200 : 93),
        steamTemperature: numberOr("steamTemperature", temperatureUnit === "F" ? 257 : 125),
        observedPressure: Number.isFinite(parseFloat(value.observedPressure)) ? parseFloat(value.observedPressure) : "",
        brewOffset: numberOr("brewOffset", 0),
        preinfusionOn: numberOr("preinfusionOn", 0),
        preinfusionOff: numberOr("preinfusionOff", 0),
        lowFlowStart: numberOr("lowFlowStart", 0),
        lowFlowFinal: numberOr("lowFlowFinal", 0)
    };
};

const normalizeUserProfile = (data = {}) => ({
    machineId: data.machineId === "bianca" ? "bianca" : "elizabeth",
    machineName: data.machineName || (data.machineId === "bianca" ? "Lelit Bianca" : "Lelit Elizabeth"),
    defaultDose: parseFloat(data.defaultDose) || 18,
    finerDirection: data.finerDirection === "higher" ? "higher" : "lower",
    b1: data.b1 || { infusion: data.infusion || 3, bloom: 2, brew: 25 },
    b2: data.b2 || { infusion: 5, bloom: 7, brew: 28 },
    elizabeth: normalizeElizabethProfile(data.elizabeth),
    bianca: normalizeBiancaProfile(data.bianca)
});

const activeMachineId = () => userProfile.machineId === "bianca" ? "bianca" : "elizabeth";
const activeMachineProfile = () => activeMachineId() === "bianca" ? normalizeBiancaProfile(userProfile.bianca) : normalizeElizabethProfile(userProfile.elizabeth);
const recordMachineId = (record) => record?.machineId === "bianca" ? "bianca" : "elizabeth";
const activeMaintenanceRecords = () => maintenanceRecords.filter(record => recordMachineId(record) === activeMachineId());

const updateTemperatureUnitLabels = (unit) => {
    document.querySelectorAll("[data-temperature-unit]").forEach(label => { label.textContent = unit; });
};

const formatDate = (dateLike) => {
    if (!dateLike) return "";
    const date = dateLike.toDate ? dateLike.toDate() : new Date(dateLike.seconds ? dateLike.seconds * 1000 : dateLike);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const parseDateKey = (value) => value ? new Date(`${value}T00:00:00`) : null;

const localDateKey = (date = new Date()) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
].join("-");

const maintenanceTime = (record) => parseDateKey(record?.completedDate)?.getTime() || 0;

const elizabethMaintenancePresets = [
    { type: "Steam wand clean", icon: "💨", title: "Steam wand", action: "Wand cleaned", cadence: "After every use", detail: "Wipe with a damp cloth and purge briefly." },
    { type: "Filterholder clean", icon: "☕", title: "Filterholder", action: "Filterholder cleaned", cadence: "After every use", detail: "Remove oily coffee residue after brewing." },
    { type: "Machine clean", icon: "✨", title: "Machine wipe-down", action: "Machine cleaned", cadence: "Weekly", detail: "Soft cloth and plain water.", daysUntilDue: 7 },
    { type: "Backflush", icon: "💧", title: "Backflush", action: "Backflush done", cadence: "Monthly", detail: "Blind filter and 3–5 g detergent.", monthsUntilDue: 1 },
    { type: "Water filter", icon: "🚰", title: "Resin filter", action: "Filter changed", cadence: "By water usage", detail: "Follow the liter capacity on the filter pack." }
];

const biancaMaintenancePresets = [
    { type: "Daily group and tray care", icon: "☕", title: "Group, basket & tray", action: "Daily care done", cadence: "After shots / daily", detail: "Wash basket and portafilter, brush the gasket, and hand-wash the tray." },
    { type: "Steam wand clean", icon: "💨", title: "Steam wand", action: "Wand cleaned", cadence: "After every milk drink", detail: "Wipe immediately and purge briefly." },
    { type: "Detergent backflush", icon: "💧", title: "Detergent backflush", action: "Backflush done", cadence: "Weekly", detail: "10s on / 10s off ×10; rinse, then water-only ×5.", daysUntilDue: 7 },
    { type: "Portafilter and basket soak", icon: "🧼", title: "Metal parts soak", action: "Parts cleaned", cadence: "Weekly", detail: "15 minutes; keep the wooden handle out of solution.", daysUntilDue: 7 },
    { type: "Steam wand deep clean", icon: "✨", title: "Wand deep clean", action: "Deep clean done", cadence: "Weekly", detail: "Use milk-system detergent and the manual's 5s on/off cycle.", daysUntilDue: 7 },
    { type: "Water filter", icon: "🚰", title: "Water filter", action: "Filter changed", cadence: "70 L or 4 months", detail: "Replace earlier after one month unused.", monthsUntilDue: 4 },
    { type: "Professional annual service", icon: "🛠️", title: "Professional service", action: "Annual service done", cadence: "Annual", detail: "Technician inspection and hydraulic descaling.", monthsUntilDue: 12 }
];

const maintenancePresetsForActiveMachine = () => activeMachineId() === "bianca" ? biancaMaintenancePresets : elizabethMaintenancePresets;

const presetDueDate = (preset, completedDate) => {
    const date = parseDateKey(completedDate);
    if (!date) return "";
    if (preset.daysUntilDue) date.setDate(date.getDate() + preset.daysUntilDue);
    else if (preset.monthsUntilDue) {
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + preset.monthsUntilDue);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(day, lastDay));
    } else return "";
    return localDateKey(date);
};

const maintenanceDueState = (dueDate) => {
    const due = parseDateKey(dueDate);
    if (!due || Number.isNaN(due.getTime())) return { tone: "none", label: "No reminder" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { tone: "overdue", label: `${Math.abs(days)}d overdue` };
    if (days === 0) return { tone: "due", label: "Due today" };
    if (days <= 30) return { tone: "due", label: `Due in ${days}d` };
    return { tone: "scheduled", label: `Due ${due.toLocaleDateString()}` };
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

const logTime = (log) => log?.date?.seconds || (log?.date instanceof Date ? log.date.getTime() / 1000 : 0);

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

const chooseCurrentRecipe = (logs, roastLevel) => {
    if (!logs.length) return null;
    const latestGood = logs.find(log => getBrewAdvice(log, roastLevel).status === "good" && (!log.taste || log.taste === "balanced"));
    return {
        shot: latestGood || logs[0],
        status: latestGood ? "Dialed" : "Resume"
    };
};

const on = (id, eventName, handler) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener(eventName, handler);
};

const syncKeyboardInset = () => {
    const viewport = window.visualViewport;
    const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
};

const app = {
    // --- ROUTING ---
    router: (viewName, addToHistory = true) => {
        document.body.dataset.view = viewName;
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const targetView = document.getElementById('view-' + viewName);
        if (targetView) targetView.classList.add('active');
        
        const topBar = document.getElementById('top-bar');
        if (topBar) topBar.style.display = (viewName === 'login' || viewName === 'machine-select') ? 'none' : 'flex';
        
        // FAB Visibility
        const fabAdd = document.getElementById('fab-add-bean');
        const fabLog = document.getElementById('fab-log-shot');
        if (fabAdd) fabAdd.classList.toggle('hidden', viewName !== 'list');
        if (fabLog) fabLog.classList.toggle('hidden', viewName !== 'detail');

        if (addToHistory) {
            const state = { view: viewName };
            const url = "#" + viewName;
            if (viewName === 'list' && !history.state) history.replaceState(state, "", url);
            else history.pushState(state, "", url);
        }
        window.scrollTo(0, 0);
    },

    // --- AUTH ---
    login: async () => { haptic('medium'); try { await signInWithPopup(auth, provider); } catch(e) { alert(e.message); } },
    logout: () => { if(confirm("Logout?")) { haptic('heavy'); signOut(auth).then(() => location.reload()); } },
    selectMachine: async (machineId) => {
        const nextId = machineId === "bianca" ? "bianca" : "elizabeth";
        const oldId = activeMachineId();
        userProfile.machineId = nextId;
        if (!userProfile.machineName || userProfile.machineName === "Lelit Elizabeth" || userProfile.machineName === "Lelit Bianca") {
            userProfile.machineName = nextId === "bianca" ? "Lelit Bianca" : "Lelit Elizabeth";
        }
        await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile);
        machineSelectionRequired = false;
        if (oldId !== nextId) {
            currentRecipeShot = null;
            logsCache = currentActiveBean ? app.logsForBean(currentActiveBean.id) : [];
        }
        app.applyMachineUi();
        app.router('list');
        app.renderBeanList();
        app.renderGlobalStats();
    },
    applyMachineUi: () => {
        const isBianca = activeMachineId() === "bianca";
        document.getElementById('btn-open-detail-tuning').textContent = isBianca ? "Tune Bianca" : "Tune Elizabeth";
        document.getElementById('btn-open-tuning').setAttribute("aria-label", isBianca ? "Open Bianca tuning lab" : "Open Elizabeth tuning lab");
        document.querySelectorAll('[data-machine-option="elizabeth"]').forEach(option => { option.hidden = isBianca; });
        document.querySelectorAll('[data-machine-option="bianca"]').forEach(option => { option.hidden = !isBianca; });
        updateTemperatureUnitLabels(activeMachineProfile().temperatureUnit);
    },

    // --- BEAN MANAGEMENT ---
    fetchAllLogs: (force = false) => {
        if (allLogsLoaded && !force) return Promise.resolve(allLogsCache);
        if (logsLoadPromise && !force) return logsLoadPromise;
        const q = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid));
        logsLoadPromise = getDocs(q).then(snapshot => {
            allLogsCache = newestFirst(snapshot.docs.map(logDoc => ({ id: logDoc.id, ...logDoc.data() })));
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
    fetchMaintenance: async () => {
        const q = query(collection(db, "maintenance_records"), where("uid", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        maintenanceRecords = snapshot.docs
            .map(recordDoc => ({ id: recordDoc.id, ...recordDoc.data() }))
            .sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
        return maintenanceRecords;
    },
    fetchBeans: async () => {
        const container = document.getElementById('bean-list-container');
        const fetchSequence = ++beanFetchSequence;
        if (container) renderEmpty(container, "Syncing collection...");
        const slowTimer = window.setTimeout(() => {
            if (fetchSequence === beanFetchSequence && container) {
                renderEmpty(container, "Still syncing… The first load can take a few seconds.");
            }
        }, 4500);
        try {
            const q = query(collection(db, "beans"), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            beans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(bean => bean.archived !== true);
            hideStatus();
            app.renderBeanList();
            app.renderGlobalStats();
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

    getRoastColor: (level = 'Medium') => {
        const colors = { 'Light': '#f59e0b', 'Medium': '#d97706', 'Dark': '#78350f', 'Espresso': '#1c1917' };
        return colors[level] || '#d97706';
    },
    getRoastGlow: (level = 'Medium') => {
        const glows = { 'Light': 'rgba(245, 158, 11, 0.15)', 'Medium': 'rgba(217, 119, 6, 0.15)', 'Dark': 'rgba(120, 53, 15, 0.15)' };
        return glows[level] || 'rgba(217, 119, 6, 0.15)';
    },

    renderBeanList: () => {
        const container = document.getElementById('bean-list-container');
        if (!container) return;
        container.replaceChildren();

        let visibleBeans = beans.filter(b => {
            if(activeFilters.size === 0) return true;
            const searchable = [b.roastLevel, b.origin, b.roaster, ...(b.tags || [])].map(t => (t||'').toLowerCase());
            for(let f of activeFilters) { if(!searchable.includes(f.toLowerCase())) return false; }
            return true;
        });

        if(currentSort === 'name') visibleBeans.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        else if (currentSort === 'rating') visibleBeans.sort((a,b) => (b.rating || 0) - (a.rating || 0));
        else visibleBeans.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        if(visibleBeans.length === 0) {
            renderEmptyAction(container, "No coffee found", "Start a new profile.", "Add Bean", () => { app.resetBeanForm(); app.router("edit-bean"); });
            return;
        }

        visibleBeans.forEach((b, idx) => {
            const card = document.createElement('div');
            card.className = 'bean-card';
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Open ${b.name || "untitled bean"} from ${b.roaster || "unknown roaster"}`);
            card.style.setProperty('--roast-color', app.getRoastColor(b.roastLevel));
            card.style.setProperty('--roast-glow', app.getRoastGlow(b.roastLevel));

            card.appendChild(el("div", "roast-bar"));
            const imageSrc = beanImageSource(b);
            const thumb = imageSrc ? el("img", "bean-card-thumb") : el("div", "bean-card-thumb thumb-placeholder", "☕");
            if (imageSrc) {
                thumb.src = imageSrc;
                thumb.alt = "";
                thumb.loading = "lazy";
                thumb.decoding = "async";
            }
            card.appendChild(thumb);

            const body = el("div", "bean-card-body");
            body.appendChild(el("div", "roaster-name", (b.roaster || "Unknown") + (b.rating ? " ★" + b.rating : "")));
            body.appendChild(el("div", "bean-card-name", b.name || "Untitled"));
            const tags = el("div", "bean-card-tags");
            (b.tags || []).slice(0, 2).forEach(t => tags.appendChild(el("span", "tag-pill", "#" + t)));
            body.appendChild(tags);
            card.appendChild(body);
            card.onclick = () => app.loadBeanDetail(b.id);
            card.onkeydown = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    app.loadBeanDetail(b.id);
                }
            };
            container.appendChild(card);
        });
    },

    setSort: (value) => { currentSort = value; app.renderBeanList(); },

    saveBean: async () => {
        haptic('medium');
        const btn = document.getElementById('btn-save-bean');
        const originalText = btn.innerText;
        btn.innerText = "Processing...";
        try {
            const id = document.getElementById('input-bean-id').value;
            const existingBean = id ? beans.find(bean => bean.id === id) : null;
            const beanRef = id ? doc(db, "beans", id) : doc(collection(db, "beans"));
            const data = {
                uid: currentUser.uid,
                roaster: document.getElementById('input-roaster').value,
                roasterLocation: document.getElementById('input-roaster-location').value,
                name: document.getElementById('input-name').value,
                origin: document.getElementById('input-origin').value,
                roastLevel: document.getElementById('input-roast-level').value,
                tenBeanWeight: document.getElementById('input-ten-bean-weight').value.trim(),
                tags: currentEditingTags,
                rating: parseInt(document.getElementById('input-bean-rating').value) || 0,
                updatedAt: new Date()
            };

            const manualRoastDate = document.getElementById('input-roast-date').value;

            if(!data.name) throw new Error("Bean name is required.");

            const imageFields = await app.prepareBeanImageFields(beanRef.id, existingBean);
            
            if(id) await updateDoc(beanRef, { ...data, ...imageFields, currentRoastDate: manualRoastDate });
            else await setDoc(beanRef, { ...data, ...imageFields, currentRoastDate: manualRoastDate || new Date().toISOString().split('T')[0], createdAt: new Date() });
            
            await app.fetchBeans();
            app.router('list');
        } catch(e) { alert(e.message); btn.innerText = originalText; }
    },

    deleteBean: async () => {
        if(confirm("Archive this bean? Its shot history will stay available for export and records.")) {
            await updateDoc(doc(db, "beans", document.getElementById('input-bean-id').value), { archived: true, archivedAt: new Date(), updatedAt: new Date() });
            await app.fetchBeans();
            app.router('list');
        }
    },

    editActiveBean: () => {
        haptic('light');
        const b = currentActiveBean;
        document.getElementById('bean-form-header').innerText = "Edit Coffee Profile";
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
        app.setBeanRating(b.rating || 0);
        document.getElementById('btn-delete-bean').classList.remove('hidden');
        document.getElementById('btn-save-bean').innerText = "Update Profile";
        app.router('edit-bean');
    },

    loadBeanDetail: async (id) => {
        try {
            currentActiveBean = beans.find(b => b.id === id);
            if(!currentActiveBean) return app.router('list');

            const imgEl = document.getElementById('detail-image');
            const imageSrc = beanImageSource(currentActiveBean);
            if(imageSrc) { imgEl.src = imageSrc; imgEl.classList.remove('hidden'); }
            else { imgEl.classList.add('hidden'); }

            document.getElementById('detail-roaster').innerText = currentActiveBean.roaster;
            document.getElementById('detail-name').innerText = currentActiveBean.name;
            document.getElementById('detail-rating').innerText = '★'.repeat(currentActiveBean.rating || 0);
            
            const roastDate = currentActiveBean.currentRoastDate || "Unknown";
            document.getElementById('detail-date').innerText = roastDate;

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

            if(roastDate !== "Unknown") {
                const days = Math.floor((new Date() - new Date(roastDate)) / (86400000));
                const msg = (days >= 7 && days <= 21) ? "✨ Peak Flavor Window" : (days < 7 ? "⏳ Resting..." : "🫘 Aging");
                document.getElementById('detail-age').innerText = days + " days since roast • " + msg;
                const staleWarning = document.getElementById("stale-warning-container");
                if (days > 30) {
                    staleWarning.textContent = "This batch is over 30 days off roast. Expect faster flow and be ready to adjust.";
                    staleWarning.className = "status-strip batch-warning";
                } else {
                    staleWarning.classList.add("hidden");
                }
            } else {
                document.getElementById('detail-age').innerText = "";
                document.getElementById("stale-warning-container").classList.add("hidden");
            }

            app.renderHistory();
            app.renderDialInSummary();
            app.renderCurrentRecipe();

            const machineContext = activeMachineId() === "bianca"
                ? `${normalizeBiancaProfile(userProfile.bianca).machineVersion.toUpperCase()} • paddle flow`
                : `${(parseInt(userProfile.b1?.infusion)||0) + (parseInt(userProfile.b1?.bloom)||0)}s P1 pre-infusion`;
            document.getElementById('machine-badge').innerText = (userProfile.machineName || 'Espresso machine') + " • " + machineContext;

        } catch(e) {
            console.error("Detail error:", e);
            if (currentActiveBean?.id === id) renderEmptyAction(document.getElementById("history-container"), "History unavailable", "Your saved recipe could not be loaded right now.", "Retry", () => app.loadBeanDetail(id));
        }
    },

    renderCurrentRecipe: () => {
        const consoleEl = document.getElementById("dial-in-console");
        const recipe = chooseCurrentRecipe(logsCache, currentActiveBean?.roastLevel);
        currentRecipeShot = recipe?.shot || null;
        if (!currentRecipeShot) { consoleEl.classList.add("hidden"); return; }

        document.getElementById("recipe-status").textContent = recipe.status;
        document.getElementById("recipe-status").className = "console-status status-" + recipe.status.toLowerCase();
        document.getElementById("recipe-grind").textContent = currentRecipeShot.grind || "--";
        document.getElementById("recipe-dose").textContent = currentRecipeShot.dose ? currentRecipeShot.dose + "g" : "--";
        document.getElementById("recipe-yield").textContent = currentRecipeShot.yield ? currentRecipeShot.yield + "g" : "--";
        document.getElementById("recipe-time").textContent = currentRecipeShot.time ? currentRecipeShot.time + "s" : "--";
        consoleEl.classList.remove("hidden");
    },

    renderHistory: () => {
        const container = document.getElementById('history-container');
        container.replaceChildren();
        if(logsCache.length === 0) { renderEmptyAction(container, "No logs", "Log your first extraction.", "Log Shot", () => app.openLogShot()); return; }
        const groups = {};
        logsCache.forEach(log => { const k = log.roastDate || "Original Batch"; if(!groups[k]) groups[k] = []; groups[k].push(log); });
        const orderedLogs = Object.keys(groups).sort().reverse().flatMap(batch => groups[batch].map(log => ({ batch, log })));
        const visibleLogs = historyExpanded ? orderedLogs : orderedLogs.slice(0, 8);
        let renderedBatch = null;
        visibleLogs.forEach(({ batch, log }) => {
            if (batch !== renderedBatch) {
                renderedBatch = batch;
                container.appendChild(el("div", "field-kicker", "Batch: " + batch));
            }
                const validation = validateShot(log);
                const advice = validation.valid
                    ? getBrewAdvice(log, currentActiveBean?.roastLevel)
                    : { status: "slow", text: "Incomplete legacy shot data" };
                const observedSymptom = log.channelingObserved ? "channeling" : log.taste;
                const historyTuningContext = {
                    roast: currentActiveBean?.roastLevel,
                    symptom: observedSymptom,
                    dose: log.dose,
                    yield: log.yield,
                    time: log.time,
                    pressure: log.pressureObserved,
                    machineVersion: activeMachineProfile().machineVersion,
                    temperatureUnit: activeMachineProfile().temperatureUnit
                };
                const tuningAdvice = observedSymptom ? (activeMachineId() === "bianca" ? diagnoseBiancaShot(historyTuningContext) : diagnoseElizabethShot(historyTuningContext)) : null;
                const ratioValue = ratioFor(log);
                const ratio = ratioValue ? ratioValue.toFixed(1) : "—";
                const row = el("div", "log-row ext-" + advice.status);
                row.tabIndex = 0;
                row.setAttribute("role", "button");
                row.setAttribute("aria-label", `Edit shot at grind ${log.grind}, ${log.time} seconds`);
                const metrics = el("div", "log-row-metrics");
                const timeCol = el("div", "metric-col");
                timeCol.append(el("div", "metric-value", log.time + "s"), el("div", "recipe-label", "Time"));
                const grindCol = el("div", "metric-col center");
                grindCol.append(el("div", "metric-value", log.grind), el("div", "recipe-label", "Grind"));
                const ratioCol = el("div", "metric-col right");
                ratioCol.append(el("div", "metric-value", "1:" + ratio), el("div", "recipe-label", log.dose + "g -> " + log.yield + "g"));
                metrics.append(timeCol, grindCol, ratioCol);
                const adviceText = tuningAdvice?.actions[0] ? advice.text + " • Next: " + tuningAdvice.actions[0] : advice.text;
                row.append(metrics, el("div", "advice-text", adviceText));
                row.onclick = () => app.openEditShot(log.id);
                row.onkeydown = (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        app.openEditShot(log.id);
                    }
                };
                container.appendChild(row);
        });
        if (orderedLogs.length > 8) {
            const more = el("div", "history-more");
            const button = el("button", "btn-secondary small-btn", historyExpanded ? "Show recent shots only" : `Show ${orderedLogs.length - 8} older shots`);
            button.type = "button";
            button.addEventListener("click", () => {
                historyExpanded = !historyExpanded;
                app.renderHistory();
            });
            more.appendChild(button);
            container.appendChild(more);
        }
    },

    renderDialInSummary: () => {
        const tbody = document.getElementById('dial-in-table-body');
        if (!tbody) return;
        tbody.replaceChildren();

        const grouped = {};
        logsCache.forEach(l => {
            if (!validateShot(l).valid) return;
            const g = l.grind;
            if(!grouped[g]) grouped[g] = { ratioSum: 0, timeSum: 0, ratioCount: 0, timeCount: 0, count: 0 };
            const r = parseFloat(l.yield) / parseFloat(l.dose);
            if(Number.isFinite(r)) { grouped[g].ratioSum += r; grouped[g].ratioCount++; }
            if(Number.isFinite(parseFloat(l.time))) { grouped[g].timeSum += parseFloat(l.time); grouped[g].timeCount++; }
            grouped[g].count++;
        });

        const rows = Object.keys(grouped).map(g => {
            const data = grouped[g];
            return {
                grind: g,
                avgRatio: data.ratioCount > 0 ? data.ratioSum / data.ratioCount : 0,
                avgTime: data.timeCount > 0 ? Math.round(data.timeSum / data.timeCount) : 0,
                count: data.count
            };
        }).sort((a,b) => Math.abs(a.avgRatio - 2.0) - Math.abs(b.avgRatio - 2.0));

        if(rows.length === 0) {
            const tr = document.createElement("tr");
            const td = el("td", "summary-empty", "Log some shots to see your dial-in metrics.");
            td.colSpan = 4;
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        rows.forEach((row, i) => {
            const tr = document.createElement('tr');
            if(i === 0) tr.className = "summary-best-row";
            tr.append(el("td", "summary-primary", row.grind), el("td", "", "1:" + row.avgRatio.toFixed(1)), el("td", "", row.avgTime + "s"));
            const countCell = el("td", "", row.count + "x");
            countCell.style.opacity = "0.6";
            tr.appendChild(countCell);
            tbody.appendChild(tr);
        });
    },

    renderGlobalStats: async () => {
        const statsContent = document.getElementById('global-stats-content');
        try {
            const logs = (await app.fetchAllLogs()).filter(log => recordMachineId(log) === activeMachineId());
            let total = 0; const grinds = {};
            logs.forEach(log => { total++; const g = log.grind; if(g) grinds[g] = (grinds[g] || 0) + 1; });
            if(total === 0) { document.getElementById('global-stats-card').classList.add('hidden'); return; }
            document.getElementById('global-stats-card').classList.remove('hidden');
            const top = Object.entries(grinds).sort((a,b) => b[1]-a[1]).slice(0,2);
            const totalStat = el("div", "stat-item");
            totalStat.append(el("strong", "", total), el("span", "", "Total Logs"));
            const grindStat = el("div", "stat-item");
            grindStat.append(el("strong", "", top.map(t => t[0]).join(", ") || "None"), el("span", "", "Common Grinds"));
            statsContent.replaceChildren(totalStat, grindStat);
        } catch(e) {
            console.error("Stats error:", e);
            document.getElementById('global-stats-card').classList.add('hidden');
        }
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
        const path = `users/${currentUser.uid}/beans/${beanId}/bag-${Date.now()}.jpg`;
        const ref = storageRef(storage, path);
        await uploadString(ref, dataUrl, "data_url", {
            contentType: "image/jpeg",
            customMetadata: { uid: currentUser.uid, beanId }
        });
        return { image: null, imageUrl: await getDownloadURL(ref), imagePath: path };
    },
    deleteStoredImage: async (path) => {
        if (!path) return;
        try {
            await deleteObject(storageRef(storage, path));
        } catch (e) {
            console.warn("Storage cleanup skipped:", e);
        }
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
                await updateDoc(doc(db, "beans", bean.id), { ...uploaded, updatedAt: new Date() });
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
        document.getElementById('input-roast-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('input-roast-level').value = 'Medium';
        document.getElementById('bean-form-header').innerText = "New Profile";
        document.getElementById('btn-delete-bean').classList.add('hidden');
        document.getElementById('btn-save-bean').innerText = "Save Profile";
        currentEditingTags = []; currentEditingImagePath = null; app.renderEditingTags(); app.removeImage(); app.setBeanRating(0);
    },
    setBeanRating: (n) => { haptic('light'); document.getElementById('input-bean-rating').value = n; document.querySelectorAll('.bean-star').forEach((el, i) => el.classList.toggle('selected', i < n)); },
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
    openLogShot: () => {
        haptic('light');
        const machineProfile = activeMachineProfile();
        const isBianca = activeMachineId() === "bianca";
        const recipeShot = currentRecipeShot;
        updateTemperatureUnitLabels(machineProfile.temperatureUnit);
        app.applyMachineUi();
        document.getElementById('log-shot-title').innerText = recipeShot ? "New Shot from Recipe" : "Log Extraction";
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
            if (!validation.valid) throw new Error(validation.errors[0]);
            if(sId) {
                await updateDoc(doc(db, "brew_logs", sId), data);
                app.upsertCachedLog({ id: sId, ...data });
            } else {
                data.roastDate = currentActiveBean?.currentRoastDate || "Unknown";
                const created = await addDoc(collection(db, "brew_logs"), data);
                app.upsertCachedLog({ id: created.id, ...data });
            }
            await app.loadBeanDetail(bId);
        } catch(e) { alert(e.message); }
        finally { saveButton.disabled = false; saveButton.textContent = saveLabel; }
    },
    openEditShot: (sId) => {
        const log = logsCache.find(l => l.id === sId); if(!log) return;
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
    deleteShot: async () => { if(confirm("Delete log?")) { const sId = document.getElementById('input-log-shot-id').value; const bId = document.getElementById('input-log-bean-id').value; await deleteDoc(doc(db, "brew_logs", sId)); app.removeCachedLog(sId); await app.loadBeanDetail(bId); } },
    fetchProfile: async () => {
        try {
            const snap = await getDoc(doc(db, "user_profiles", currentUser.uid));
            if (snap.exists()) {
                const savedProfile = snap.data();
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
        userProfile = { machineId: document.getElementById('profile-machine-id').value === "bianca" ? "bianca" : "elizabeth", machineName: document.getElementById('profile-machine-name').value, defaultDose: parseFloat(document.getElementById('profile-default-dose').value) || 18, finerDirection: document.getElementById('profile-finer-direction').value, b1, b2, elizabeth, bianca };
        await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile);
        machineSelectionRequired = false;
        app.applyMachineUi();
        app.router('list');
    },
    openTuning: () => {
        if (activeMachineId() === "bianca") return app.openBiancaTuning();
        const roast = String(currentActiveBean?.roastLevel || "medium").toLowerCase();
        document.getElementById('tuning-roast').value = ["light", "medium", "dark"].includes(roast) ? roast : "medium";
        document.getElementById('tuning-symptom').value = "starting";
        document.getElementById('tuning-pressure').value = userProfile.elizabeth?.observedPressure || "";
        app.renderTuningReference();
        app.renderTuningPlan();
        app.router('tuning');
    },
    renderTuningReference: () => {
        const elizabeth = normalizeElizabethProfile(userProfile.elizabeth);
        updateTemperatureUnitLabels(elizabeth.temperatureUnit);
        const versionNames = {
            "classic-v3": "Classic V3",
            "classic-early": "Early classic",
            "elizabeth3": "Elizabeth3 / Pagaia",
            "unknown": "Version unknown"
        };
        document.getElementById('tuning-machine-chip').textContent = versionNames[elizabeth.machineVersion];
        const profileParts = [
            `${elizabeth.brewTemperature}°${elizabeth.temperatureUnit} brew`,
            `${elizabeth.steamTemperature}°${elizabeth.temperatureUnit} steam`,
            elizabeth.preinfusionMode + " pre-infusion"
        ];
        if (elizabeth.firmware) profileParts.push("firmware " + elizabeth.firmware);
        document.getElementById('tuning-profile-context').textContent = "Your saved machine: " + profileParts.join(" • ");
        document.getElementById('tuning-mode-explanation').textContent = explainPreinfusionMode(elizabeth);

        const warning = document.getElementById('tuning-version-warning');
        if (elizabeth.machineVersion === "classic-v3") warning.classList.add("hidden");
        else {
            warning.textContent = elizabeth.machineVersion === "elizabeth3"
                ? "Elizabeth3 is a different Pagaia platform. The classic P1/P2 and BLS/BLP profiles below are reference-only and must not be copied to it."
                : elizabeth.machineVersion === "classic-early"
                    ? "Early PL92T detected. V3 pump-bloom, purge, and OPV instructions may not apply; verify your firmware manual before using advanced controls."
                    : "Choose your Elizabeth generation in Settings before using hidden-menu or hardware guidance.";
            warning.className = "status-strip status-warning";
        }

        const parameters = document.getElementById('tuning-advanced-parameters');
        parameters.replaceChildren(...ELIZABETH_ADVANCED_PARAMETERS.map(parameter => {
            const card = el("div", "advanced-parameter");
            card.append(el("div", "advanced-parameter-name", parameter.name), el("div", "advanced-parameter-copy", parameter.text));
            return card;
        }));

        const sources = document.getElementById('tuning-sources');
        sources.replaceChildren(...ELIZABETH_SOURCES.map(source => {
            const link = el("a", "tuning-source");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.append(el("span", "tuning-source-title", source.title), el("span", "tuning-source-quality", source.quality));
            return link;
        }));
    },
    renderTuningPlan: () => {
        const elizabeth = normalizeElizabethProfile(userProfile.elizabeth);
        const advice = diagnoseElizabethShot({
            roast: document.getElementById('tuning-roast').value,
            symptom: document.getElementById('tuning-symptom').value,
            pressure: document.getElementById('tuning-pressure').value,
            dose: userProfile.defaultDose,
            startingGrind: currentRecipeShot?.grind || logsCache[0]?.grind,
            machineVersion: elizabeth.machineVersion,
            temperatureUnit: elizabeth.temperatureUnit
        });
        const plan = el("div", "card tuning-plan-card");
        const heading = el("div", "tuning-plan-heading");
        const headingText = el("div");
        headingText.append(el("div", "field-kicker", advice.baseline.button + " starting profile"), el("h3", "", advice.summary));
        heading.append(headingText, el("span", "evidence-badge", "Consensus start"));

        const metrics = el("div", "tuning-baseline-grid");
        [
            [`${advice.baseline.dose}g → ${advice.baseline.yield}g`, "Dose → yield"],
            [`${advice.baseline.temperature}°${advice.baseline.temperatureUnit}`, advice.baseline.temperatureRange],
            [advice.baseline.preinfusion, "Total pre-infusion"],
            [advice.baseline.timeRange, "Includes pre-infusion"]
        ].forEach(([value, label]) => {
            const item = el("div", "tuning-baseline-item");
            item.append(el("span", "tuning-baseline-value", value), el("span", "tuning-baseline-label", label));
            metrics.appendChild(item);
        });

        const actions = el("ol", "tuning-actions");
        advice.actions.forEach(action => actions.appendChild(el("li", "", action)));
        plan.append(heading, metrics, actions);
        advice.warnings.forEach(warning => plan.appendChild(el("div", "tuning-warning", warning)));
        document.getElementById('tuning-plan').replaceChildren(plan);
    },
    openBiancaTuning: () => {
        const roast = String(currentActiveBean?.roastLevel || "medium").toLowerCase();
        document.getElementById('bianca-tuning-roast').value = ["light", "medium", "dark"].includes(roast) ? roast : "medium";
        document.getElementById('bianca-tuning-symptom').value = "starting";
        document.getElementById('bianca-tuning-pressure').value = userProfile.bianca?.observedPressure || "";
        app.renderBiancaTuningReference();
        app.renderBiancaTuningPlan();
        app.router('bianca-tuning');
    },
    renderBiancaTuningReference: () => {
        const bianca = normalizeBiancaProfile(userProfile.bianca);
        const names = { v3: "V3 · 120V", v2: "V2 · 120V", v1: "V1 · 120V", unknown: "Version unknown" };
        document.getElementById('bianca-tuning-machine-chip').textContent = names[bianca.machineVersion];
        const parts = [
            `${bianca.brewTemperature}°${bianca.temperatureUnit} brew`,
            `${bianca.steamTemperature}°${bianca.temperatureUnit} steam`,
            `${bianca.observedPressure || "—"} bar group peak`
        ];
        if (bianca.firmware) parts.push("firmware " + bianca.firmware);
        document.getElementById('bianca-tuning-profile-context').textContent = "Your saved machine: " + parts.join(" • ");
        document.getElementById('bianca-tuning-flow-explanation').textContent = explainBiancaFlow(bianca);
        const warning = document.getElementById('bianca-tuning-version-warning');
        if (bianca.machineVersion === "v3") warning.classList.add('hidden');
        else {
            warning.textContent = bianca.machineVersion === "unknown"
                ? "Choose the Bianca generation in Settings before copying programmed low-flow timings. PL162T-120 identifies voltage, not V1/V2/V3."
                : `${bianca.machineVersion.toUpperCase()} selected: manual paddle profiles apply, but factory V3 low-flow and brew-offset controls do not unless an authorized conversion is installed.`;
            warning.className = "status-strip status-warning";
        }
        document.getElementById('bianca-tuning-advanced-parameters').replaceChildren(...BIANCA_ADVANCED_PARAMETERS.map(parameter => {
            const card = el("div", "advanced-parameter");
            card.append(el("div", "advanced-parameter-name", parameter.name), el("div", "advanced-parameter-copy", parameter.text));
            return card;
        }));
        document.getElementById('bianca-tuning-sources').replaceChildren(...BIANCA_SOURCES.map(source => {
            const link = el("a", "tuning-source");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.append(el("span", "tuning-source-title", source.title), el("span", "tuning-source-quality", source.quality));
            return link;
        }));
    },
    renderBiancaTuningPlan: () => {
        const bianca = normalizeBiancaProfile(userProfile.bianca);
        const advice = diagnoseBiancaShot({
            roast: document.getElementById('bianca-tuning-roast').value,
            symptom: document.getElementById('bianca-tuning-symptom').value,
            pressure: document.getElementById('bianca-tuning-pressure').value,
            dose: userProfile.defaultDose,
            machineVersion: bianca.machineVersion,
            temperatureUnit: bianca.temperatureUnit
        });
        const plan = el("div", "card tuning-plan-card");
        const heading = el("div", "tuning-plan-heading");
        const headingText = el("div");
        headingText.append(el("div", "field-kicker", advice.baseline.profile + " starting profile"), el("h3", "", advice.summary));
        heading.append(headingText, el("span", "evidence-badge", "Consensus start"));
        const metrics = el("div", "tuning-baseline-grid");
        [
            [`${advice.baseline.dose}g → ${advice.baseline.yield}g`, advice.baseline.ratioRange],
            [`${advice.baseline.temperature}°${advice.baseline.temperatureUnit}`, advice.baseline.temperatureRange],
            [advice.baseline.flow, advice.baseline.preinfusion],
            [advice.baseline.peakPressure, advice.baseline.timeRange]
        ].forEach(([value, label]) => {
            const item = el("div", "tuning-baseline-item");
            item.append(el("span", "tuning-baseline-value", value), el("span", "tuning-baseline-label", label));
            metrics.appendChild(item);
        });
        const actions = el("ol", "tuning-actions");
        advice.actions.forEach(action => actions.appendChild(el("li", "", action)));
        plan.append(heading, metrics, actions);
        advice.warnings.forEach(warning => plan.appendChild(el("div", "tuning-warning", warning)));
        document.getElementById('bianca-tuning-plan').replaceChildren(plan);
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
        const list = document.getElementById('maintenance-list');
        const summary = document.getElementById('maintenance-summary');
        const quickActions = document.getElementById('maintenance-quick-actions');
        const visibleRecords = activeMaintenanceRecords();
        const latestByType = new Map();
        visibleRecords.forEach(record => {
            if (!latestByType.has(record.type)) latestByType.set(record.type, record);
        });
        const activeReminders = [...latestByType.values()].filter(record => record.nextDueDate);
        const overdue = activeReminders.filter(record => maintenanceDueState(record.nextDueDate).tone === "overdue").length;
        const dueSoon = activeReminders.filter(record => maintenanceDueState(record.nextDueDate).tone === "due").length;
        const newest = visibleRecords[0];
        const summaryItems = [
            [visibleRecords.length, "Services logged"],
            [overdue, "Overdue"],
            [dueSoon, "Due in 30 days"],
            [newest ? parseDateKey(newest.completedDate).toLocaleDateString() : "—", "Last service"]
        ];
        summary.replaceChildren(...summaryItems.map(([value, label]) => {
            const card = el("div", "maintenance-metric");
            card.append(el("span", "maintenance-metric-value", value), el("span", "maintenance-metric-label", label));
            return card;
        }));

        const today = localDateKey();
        quickActions.replaceChildren(...maintenancePresetsForActiveMachine().map(preset => {
            const latest = latestByType.get(preset.type);
            const completedToday = latest?.completedDate === today;
            const card = el("article", "maintenance-quick-card");
            const icon = el("div", "maintenance-quick-icon", preset.icon);
            icon.setAttribute("aria-hidden", "true");
            const copy = el("div", "maintenance-quick-copy");
            copy.append(
                el("div", "maintenance-quick-title", preset.title),
                el("div", "maintenance-quick-cadence", preset.cadence),
                el("div", "maintenance-quick-detail", preset.detail)
            );
            if (latest) {
                const lastDone = completedToday ? "Done today" : `Last ${parseDateKey(latest.completedDate).toLocaleDateString()}`;
                const due = latest.nextDueDate ? ` • ${maintenanceDueState(latest.nextDueDate).label}` : "";
                copy.appendChild(el("div", "maintenance-quick-last", lastDone + due));
            }
            const button = el("button", `btn maintenance-quick-button${completedToday ? " is-done" : ""}`, completedToday ? "Done today ✓" : preset.action);
            button.type = "button";
            button.disabled = completedToday;
            button.addEventListener("click", () => app.saveMaintenancePreset(preset, button));
            card.append(icon, copy, button);
            return card;
        }));

        if (!visibleRecords.length) {
            renderEmpty(list, "Nothing logged yet. Tap a button above when you finish a task.");
            return;
        }
        list.replaceChildren(...visibleRecords.map(record => {
            const isLatest = latestByType.get(record.type)?.id === record.id;
            const state = isLatest ? maintenanceDueState(record.nextDueDate) : { tone: "none", label: "Past record" };
            const row = el("article", `maintenance-row maintenance-${state.tone}`);
            const heading = el("div", "maintenance-row-heading");
            const title = el("div", "maintenance-row-title", record.type);
            const badge = el("span", `maintenance-badge maintenance-badge-${state.tone}`, state.label);
            heading.append(title, badge);
            row.append(heading, el("div", "maintenance-date", `Completed ${parseDateKey(record.completedDate).toLocaleDateString()}`));
            if (record.notes) row.appendChild(el("div", "maintenance-notes", record.notes));
            const remove = el("button", "btn-secondary small-btn maintenance-delete", "Delete");
            remove.type = "button";
            remove.setAttribute("aria-label", `Delete ${record.type} record from ${record.completedDate}`);
            remove.addEventListener("click", () => app.deleteMaintenance(record.id));
            row.appendChild(remove);
            return row;
        }));
    },
    saveMaintenancePreset: async (preset, button) => {
        const completedDate = localDateKey();
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
        button.textContent = "Logging...";
        try {
            const created = await addDoc(collection(db, "maintenance_records"), data);
            maintenanceRecords.push({ id: created.id, ...data });
            maintenanceRecords.sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
            app.renderMaintenance();
            haptic('medium');
        } catch (error) {
            button.disabled = false;
            button.textContent = preset.action;
            alert(error.message);
        }
    },
    saveMaintenance: async () => {
        const button = document.getElementById('btn-save-maintenance');
        const completedDate = document.getElementById('maintenance-completed-date').value;
        const nextDueDate = document.getElementById('maintenance-next-date').value;
        if (!completedDate) return alert("Choose the date this service was completed.");
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
            const created = await addDoc(collection(db, "maintenance_records"), data);
            maintenanceRecords.push({ id: created.id, ...data });
            maintenanceRecords.sort((a, b) => maintenanceTime(b) - maintenanceTime(a));
            document.getElementById('maintenance-next-date').value = '';
            document.getElementById('maintenance-notes').value = '';
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
            await deleteDoc(doc(db, "maintenance_records", recordId));
            maintenanceRecords = maintenanceRecords.filter(record => record.id !== recordId);
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
        const summary = summarizeShotPatterns(logs, beans, { finerDirection: userProfile.finerDirection });
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
        app.renderAnalyticsMetrics(summary.metrics);
        app.renderPatternList(summary.insights);
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
                options: app.chartOptions("Days off roast", summary.isSingleBean ? "Grind setting" : "Finer (+) / coarser (−)", { showLegend: Boolean(summary.ageTrend) })
            });
        } else chartAge = null;
        chartTrend = new window.Chart(document.getElementById("trendChart"), {
            type: "scatter",
            data: { datasets: [{ label: "Yield", data: trendPoints, backgroundColor: "#fbbf24" }] },
            options: app.chartOptions("Grind", "Yield (g)")
        });
        chartDist = new window.Chart(document.getElementById("distChart"), {
            type: "bar",
            data: { labels: grindFrequency.map(item => item.label), datasets: [{ label: "Logs", data: grindFrequency.map(item => item.count), backgroundColor: "#38bdf8" }] },
            options: app.chartOptions("Grind", "Shot count")
        });
    },
    chartOptions: (xTitle, yTitle, { showLegend = false } = {}) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: showLegend, labels: { color: "#cbd5e1", usePointStyle: true } } },
        scales: {
            x: { title: { display: true, text: xTitle, color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } },
            y: { title: { display: true, text: yTitle, color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } }
        }
    }),
    renderAnalyticsMetrics: (metrics) => {
        const target = document.getElementById("analytics-metrics");
        const items = [
            [metrics.shots, "Complete shots"],
            [metrics.dialedPercent + "%", "In target"],
            [metrics.medianRatio ? "1:" + metrics.medianRatio.toFixed(2) : "—", "Median ratio"],
            [metrics.ageSpan ? metrics.ageSpan + "d" : "—", "Age range"]
        ];
        target.replaceChildren(...items.map(([value, label]) => {
            const card = el("div", "analytics-metric");
            card.append(el("span", "analytics-metric-value", value), el("span", "analytics-metric-label", label));
            return card;
        }));
    },
    renderPatternList: (insights) => {
        const target = document.getElementById("analytics-pattern-list");
        target.replaceChildren(...insights.map(insight => {
            const item = el("div", "pattern-item tone-" + insight.tone);
            item.append(el("div", "pattern-title", insight.title), el("div", "pattern-copy", insight.text));
            return item;
        }));
    },
    exportData: async () => {
        const [logs, beanSnap, maintenance] = await Promise.all([
            app.fetchAllLogs(),
            getDocs(query(collection(db, "beans"), where("uid", "==", currentUser.uid))),
            app.fetchMaintenance()
        ]);
        const beanLookup = new Map(beanSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
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
onAuthStateChanged(auth, async u => {
    if (!u) { app.router('login'); return; }
    currentUser = u;
    allLogsCache = [];
    allLogsLoaded = false;
    logsLoadPromise = null;
    await app.fetchProfile();
    app.applyMachineUi();
    app.router(machineSelectionRequired ? 'machine-select' : 'list');
    app.fetchAllLogs().then(() => app.renderGlobalStats()).catch(console.error);
    app.fetchBeans();
});
on("btn-login", "click", () => app.login()); on("btn-open-settings", "click", () => app.openSettings()); on("btn-open-tuning", "click", () => app.openTuning()); on("btn-logout", "click", () => app.logout()); on("btn-logout-settings", "click", () => app.logout());
on("btn-select-elizabeth", "click", () => app.selectMachine("elizabeth")); on("btn-select-bianca", "click", () => app.selectMachine("bianca"));
on("btn-open-maintenance", "click", () => app.openMaintenance()); on("btn-save-maintenance", "click", () => app.saveMaintenance());
on("input-sort-beans", "change", (e) => app.setSort(e.target.value)); on("fab-add-bean", "click", () => { app.resetBeanForm(); app.router("edit-bean"); }); on("fab-log-shot", "click", () => app.openLogShot());
on("input-bean-image", "change", (e) => app.handleImageUpload(e)); on("btn-remove-image", "click", () => app.removeImage()); on("btn-add-tag", "click", () => app.addTag());
on("input-new-tag", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); app.addTag(); } });
document.querySelectorAll(".bean-star").forEach(s => s.onclick = () => app.setBeanRating(parseInt(s.dataset.rating)));
on("btn-save-bean", "click", () => app.saveBean()); on("btn-cancel-bean", "click", () => app.router("list")); on("btn-delete-bean", "click", () => app.deleteBean());
on("btn-edit-active-bean", "click", () => app.editActiveBean()); on("btn-update-roast-date", "click", () => app.promptNewDate());
on("btn-open-detail-tuning", "click", () => app.openTuning());
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
on("profile-machine-id", "change", event => app.updateMachineSettingsFields(event.target.value));
on("tuning-roast", "change", () => app.renderTuningPlan()); on("tuning-symptom", "change", () => app.renderTuningPlan()); on("tuning-pressure", "input", () => app.renderTuningPlan());
on("bianca-tuning-roast", "change", () => app.renderBiancaTuningPlan()); on("bianca-tuning-symptom", "change", () => app.renderBiancaTuningPlan()); on("bianca-tuning-pressure", "input", () => app.renderBiancaTuningPlan());
on("btn-save-shot", "click", () => app.saveShot()); on("btn-cancel-shot", "click", () => app.router("detail")); on("btn-cancel-shot-top", "click", () => app.router("detail")); on("btn-delete-shot", "click", () => app.deleteShot());
on("btn-save-profile", "click", () => app.saveProfile()); on("btn-export-data", "click", () => app.exportData()); on("btn-open-analytics", "click", () => app.openAnalytics("all", "list"));
on("btn-tuning-open-settings", "click", () => app.openSettings());
on("btn-bianca-tuning-open-settings", "click", () => app.openSettings());
on("btn-refresh-app", "click", () => window.location.reload());
window.visualViewport?.addEventListener("resize", syncKeyboardInset);
window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
syncKeyboardInset();
window.addEventListener('popstate', (e) => { if (e.state?.view) app.router(e.state.view, false); });
