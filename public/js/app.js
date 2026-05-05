/**
 * Lincoln Barista "Platinum Roast" - Main Application Logic
 * Modularized and Optimized for Mobile. v1.1 - Secure Backend Edition.
 * Build Version: 1.1.0-VERIFY
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAIAdvice } from "./brew-advice.js";

// Initialize Firebase
const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);
const functions = getFunctions(appInstance);
const provider = new GoogleAuthProvider();

// AI Config
// Moved to secure Cloud Functions backend.

// App State
let currentUser = null;
let beans = [];
let activeFilters = new Set();
let currentSort = 'newest';
let currentActiveBean = null;
let logsCache = [];
let chartTrend = null;
let chartDist = null;
let userProfile = {
    machineName: 'Lelit Elizabeth',
    aiEnabled: true,
    defaultDose: 18,
    b1: { infusion: 3, bloom: 7, brew: 20 },
    b2: { infusion: 0, bloom: 0, brew: 30 }
};
let aiCache = {};
let currentEditingTags = [];
let currentEditingImage = null;

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

const renderTip = (target, text) => {
    target.replaceChildren();
    target.append("💡 ");
    target.appendChild(el("strong", "", "Daily Tip:"));
    target.append(` ${text}`);
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

const setStatus = (text, tone = "neutral") => {
    const status = document.getElementById("collection-status");
    if (!status) return;
    status.textContent = text || "";
    status.className = `status-strip ${tone}`;
    status.classList.toggle("hidden", !text);
};

const on = (id, eventName, handler) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener(eventName, handler);
};

const app = {
    // --- ROUTING ---
    router: (viewName, addToHistory = true) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) targetView.classList.add('active');
        
        document.getElementById('top-bar').style.display = (viewName === 'login') ? 'none' : 'flex';
        
        if (addToHistory) {
            const state = { view: viewName };
            const url = "#" + viewName;
            if (viewName === 'list' && !history.state) {
                history.replaceState(state, "", url);
            } else {
                history.pushState(state, "", url);
            }
        }
        window.scrollTo(0, 0);
    },

    // --- AUTH ---
    login: async () => { 
        haptic('medium');
        try { await signInWithPopup(auth, provider); } catch(e) { alert(e.message); } 
    },
    logout: () => { 
        if(confirm("Logout?")) {
            haptic('heavy');
            signOut(auth).then(() => location.reload()); 
        }
    },

    // --- BEAN MANAGEMENT ---
    fetchBeans: async () => {
        const container = document.getElementById('bean-list-container');
        if (container) renderEmpty(container, "Loading your coffee collection...");
        setStatus("Syncing collection...", "neutral");

        try {
            const q = query(collection(db, "beans"), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            beans = [];
            snapshot.forEach((doc) => beans.push({ id: doc.id, ...doc.data() }));
            setStatus("");
            app.renderBeanList();
            app.renderGlobalStats();
            app.renderDailyTip();
        } catch(e) {
            console.error("Bean fetch error:", e);
            setStatus("Could not sync the collection. Check your connection and try again.", "error");
            renderEmptyAction(container, "Collection unavailable", "Your saved beans could not be loaded right now.", "Try Again", () => app.fetchBeans());
        }
    },

    renderDailyTip: async () => {
        const tipEl = document.getElementById('daily-tip-text');
        if(!tipEl || !userProfile.aiEnabled) return;
        
        try {
            const getTipFn = httpsCallable(functions, 'getDailyTip');
            const result = await getTipFn({});
            renderTip(tipEl, result.data.text || "Grind finer for light roasts!");
        } catch(e) { console.error("Tip error:", e); renderTip(tipEl, "Grind finer for light roasts!"); }
    },

    renderBeanList: () => {
        const container = document.getElementById('bean-list-container');
        const filterBar = document.getElementById('filter-bar');
        container.replaceChildren();
        filterBar.replaceChildren();

        let visibleBeans = beans.filter(b => {
            if(activeFilters.size === 0) return true;
            const searchable = [b.roastLevel, b.origin, b.roaster, ...(b.tags || [])].map(t => (t||'').toLowerCase());
            for(let f of activeFilters) { if(!searchable.includes(f.toLowerCase())) return false; }
            return true;
        });

        // Sorting
        if(currentSort === 'name') visibleBeans.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        else if (currentSort === 'rating') visibleBeans.sort((a,b) => (b.rating || 0) - (a.rating || 0));
        else visibleBeans.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        // Filter Bar UI
        if(activeFilters.size > 0) {
            filterBar.classList.remove('hidden');
            const clearBtn = document.createElement('button');
            clearBtn.className = 'tag-pill active';
            clearBtn.type = "button";
            clearBtn.classList.add("clear-filter");
            clearBtn.innerText = '✕ Clear All';
            clearBtn.onclick = () => { activeFilters.clear(); app.renderBeanList(); };
            filterBar.appendChild(clearBtn);
            activeFilters.forEach(f => {
                const chip = document.createElement('button');
                chip.className = 'tag-pill active';
                chip.type = "button";
                chip.innerText = f;
                chip.onclick = () => { activeFilters.delete(f); app.renderBeanList(); };
                filterBar.appendChild(chip);
            });
        } else { filterBar.classList.add('hidden'); }

        if(visibleBeans.length === 0) {
            const hasFilters = activeFilters.size > 0;
            renderEmptyAction(
                container,
                hasFilters ? "No beans match those filters" : "Start your first coffee profile",
                hasFilters ? "Clear filters or adjust the collection sort to get back to your bags." : "Add a bag once, then log shots against each roast batch as you dial it in.",
                hasFilters ? "Clear Filters" : "Add Bean",
                hasFilters ? () => { activeFilters.clear(); app.renderBeanList(); } : () => { app.resetBeanForm(); app.router("edit-bean"); }
            );
            return;
        }

        visibleBeans.forEach(b => {
            const card = document.createElement('div');
            card.className = `card bean-card roast-${b.roastLevel || 'Medium'}`;

            let thumb;
            if (b.image) {
                thumb = document.createElement('img');
                thumb.src = b.image;
                thumb.alt = `${b.name || "Coffee"} bag`;
                thumb.className = "bean-card-thumb";
            } else {
                thumb = el("div", "bean-card-thumb", "☕");
                thumb.classList.add("thumb-placeholder");
            }

            const body = el("div", "bean-card-body");
            const meta = el("div", "bean-card-meta");
            meta.textContent = `${b.roaster || "Unknown roaster"} • ${b.roastLevel || ""}`;
            if (b.rating > 0) {
                const stars = el("span", "rating-stars", ` ${"★".repeat(b.rating)}`);
                meta.appendChild(stars);
            }
            body.appendChild(meta);
            body.appendChild(el("div", "bean-card-name", b.name || "Untitled coffee"));

            const tags = el("div", "bean-card-tags");
            if (b.origin) tags.appendChild(el("span", "tag-pill", `📍 ${b.origin}`));
            (b.tags || []).slice(0, 2).forEach(t => tags.appendChild(el("span", "tag-pill", `#${t}`)));
            body.appendChild(tags);

            card.append(thumb, body);
            card.onclick = () => { haptic('light'); app.loadBeanDetail(b.id); };
            container.appendChild(card);
        });
    },

    setSort: (value) => {
        currentSort = value;
        app.renderBeanList();
    },

    saveBean: async () => {
        haptic('medium');
        const btn = document.getElementById('btn-save-bean');
        const originalText = btn.innerText;
        btn.innerText = "Processing...";
        
        try {
            const id = document.getElementById('input-bean-id').value;
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
                image: currentEditingImage,
                updatedAt: new Date()
            };

            const manualRoastDate = document.getElementById('input-roast-date').value;

            if(!data.name) throw new Error("Bean name is required.");
            
            if(id) {
                await updateDoc(doc(db, "beans", id), { ...data, currentRoastDate: manualRoastDate });
            } else {
                await addDoc(collection(db, "beans"), { ...data, currentRoastDate: manualRoastDate || new Date().toISOString().split('T')[0], createdAt: new Date() });
            }
            
            await app.fetchBeans();
            app.router('list');
        } catch(e) {
            alert(e.message);
            btn.innerText = originalText;
        }
    },

    deleteBean: async () => {
        if(confirm("Archive this bean?")) {
            haptic('heavy');
            await deleteDoc(doc(db, "beans", document.getElementById('input-bean-id').value));
            await app.fetchBeans();
            app.router('list');
        }
    },

    promptNewDate: async () => {
        app.editActiveBean();
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

        if(b.image) {
            currentEditingImage = b.image;
            const preview = document.getElementById('edit-image-preview');
            preview.src = currentEditingImage;
            preview.classList.remove('hidden');
            document.getElementById('btn-remove-image').classList.remove('hidden');
        } else {
            app.removeImage();
        }
        
        app.setBeanRating(b.rating || 0);
        document.getElementById('btn-delete-bean').classList.remove('hidden');
        document.getElementById('btn-save-bean').innerText = "Update Profile";
        app.router('edit-bean');
    },

    openEditShot: (shotId) => {
        const log = logsCache.find(l => l.id === shotId);
        if(!log) return;
        haptic('light');
        document.getElementById('log-shot-title').innerText = "Edit Extraction";
        document.getElementById('input-log-bean-id').value = currentActiveBean ? currentActiveBean.id : log.beanId;
        document.getElementById('input-log-shot-id').value = shotId;
        document.getElementById('log-display-date').innerText = log.roastDate;
        document.getElementById('input-shot-grind').value = log.grind || '';
        document.getElementById('input-shot-time').value = log.time || '';
        document.getElementById('input-shot-dose').value = log.dose || '';
        document.getElementById('input-shot-yield').value = log.yield || '';
        
        document.getElementById('btn-save-shot').innerText = "Update Log";
        document.getElementById('btn-delete-shot').classList.remove('hidden');
        app.router('log-shot');
    },

    deleteShot: async () => {
        if(confirm("Delete this shot log?")) {
            haptic('heavy');
            const shotId = document.getElementById('input-log-shot-id').value;
            const beanId = document.getElementById('input-log-bean-id').value;
            await deleteDoc(doc(db, "brew_logs", shotId));
            await app.loadBeanDetail(beanId);
        }
    },

    exportData: async () => {
        if(!confirm("Download all data as CSV?")) return;
        haptic('medium');
        const qLogs = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid));
        const snapLogs = await getDocs(qLogs);
        let csvContent = "data:text/csv;charset=utf-8,Type,Date,Roaster,Bean,Grind,Time,Dose,Yield\n";
        const beanMap = {};
        beans.forEach(b => beanMap[b.id] = { name: b.name, roaster: b.roaster });
        snapLogs.forEach(doc => {
            const l = doc.data();
            const b = beanMap[l.beanId] || { name: "Unknown", roaster: "Unknown" };
            const cleanName = `"${b.name.replace(/"/g, '""')}"`;
            const cleanRoaster = `"${b.roaster.replace(/"/g, '""')}"`;
            const dateStr = l.date ? new Date(l.date.seconds * 1000).toISOString().split('T')[0] : "Unknown";
            csvContent += `Shot,${dateStr},${cleanRoaster},${cleanName},${l.grind},${l.time},${l.dose},${l.yield}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "lincoln_barista_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    loadBeanDetail: async (id) => {
        try {
            currentActiveBean = beans.find(b => b.id === id);
            if(!currentActiveBean) return app.router('list');

        // Dynamic Header
        const imgEl = document.getElementById('detail-image');
        if(currentActiveBean.image) {
            imgEl.src = currentActiveBean.image;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
        }

        document.getElementById('detail-roaster').innerText = currentActiveBean.roaster;
        document.getElementById('detail-name').innerText = currentActiveBean.name;
        document.getElementById('detail-rating').innerText = '★'.repeat(currentActiveBean.rating || 0);
        
        const roastDate = currentActiveBean.currentRoastDate || "Unknown";
        
        // Fetch Logs (Local sorting to avoid missing index errors)
        try {
            const q = query(collection(db, "brew_logs"), where("beanId", "==", id), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            logsCache = [];
            snapshot.forEach(doc => logsCache.push({ id: doc.id, ...doc.data() }));
            logsCache.sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
        } catch(e) {
            console.error("Error fetching logs:", e);
            logsCache = [];
        }

        // Stale Roast Date Alert Check
        const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const staleWarningContainer = document.getElementById('stale-warning-container');
        staleWarningContainer.replaceChildren();
        if (roastDate !== "Unknown") {
            const rd = new Date(roastDate).getTime();
            const now = Date.now();
            const lastLogTime = logsCache.length > 0 ? (logsCache[0].date?.seconds * 1000 || 0) : 0;
            
            // If the roast date is older than 2 weeks AND we haven't logged a shot in over a week, remind user.
            if ((now - rd > 2 * ONE_WEEK_MS) && (!lastLogTime || (now - lastLogTime > ONE_WEEK_MS))) {
                const warning = el("button", "stale-warning", "⚠️ Is this a new bag? Tap here to Edit Profile & update Roast Date!");
                warning.type = "button";
                warning.onclick = () => app.editActiveBean();
                staleWarningContainer.appendChild(warning);
            }
        }
        document.getElementById('detail-date').innerText = roastDate;
        document.getElementById('detail-age').innerText = "";
        if(roastDate !== "Unknown") {
            const days = Math.floor((new Date() - new Date(roastDate)) / (1000 * 60 * 60 * 24));
            document.getElementById('detail-age').innerText = `${days} days since roast`;
            
            // Peak Flavor Hint
            const msg = (days >= 7 && days <= 21) ? "✨ Peak Flavor Window" : (days < 7 ? "⏳ Resting..." : "🫘 Aging");
            document.getElementById('detail-age').innerText += ` • ${msg}`;
        }

        app.renderHistory();
        app.renderDialInSummary();

        // Reveal the Butler
        const butlerCard = document.getElementById('butler-advice-card');
        const butlerText = document.getElementById('butler-detail-text');
        const machineBadge = document.getElementById('machine-badge');

        const b1Offset = (parseInt(userProfile.b1?.infusion)||0) + (parseInt(userProfile.b1?.bloom)||0);
        machineBadge.innerText = `${userProfile.machineName || 'Generic'} • ${b1Offset}s Offset (P1)`;

        if(logsCache.length > 0) {
            const lastLog = logsCache[0];
            const heuristicAdvice = getAIAdvice(lastLog, currentActiveBean?.roastLevel);
            butlerText.textContent = `"${heuristicAdvice.text}"`;
            butlerCard.classList.remove('hidden');

            // Trigger True AI if enabled and not cached
            if(userProfile.aiEnabled) {
                app.getGeminiAnalysis(lastLog, currentActiveBean).catch(console.error);
            }
        } else {
            butlerCard.classList.add('hidden');
        }

        app.router('detail');
        } catch(e) {
            console.error("Critical error in loadBeanDetail:", e);
            app.router('list');
        }
    },

    renderHistory: () => {
        const container = document.getElementById('history-container');
        container.replaceChildren();
        
        if(logsCache.length === 0) {
            renderEmptyAction(
                container,
                "No extractions yet",
                "Log the first shot for this batch to start seeing dial-in guidance.",
                "Log Shot",
                () => app.openLogShot()
            );
            return;
        }

        // Group by roast date (batch)
        const groups = {};
        logsCache.forEach(log => {
            const k = log.roastDate || "Original Batch";
            if(!groups[k]) groups[k] = [];
            groups[k].push(log);
        });

        Object.keys(groups).sort().reverse().forEach(batch => {
            const header = el("div", "batch-header", `Batch: ${batch}`);
            container.appendChild(header);

            groups[batch].forEach(log => {
                const advice = getAIAdvice(log, currentActiveBean?.roastLevel);
                const row = document.createElement('div');
                row.className = `log-row ext-${advice.status}`;
                const ratio = (parseFloat(log.yield) / parseFloat(log.dose)).toFixed(1);

                const metrics = el("div", "log-row-metrics");
                const timeBox = document.createElement("div");
                timeBox.className = "metric-center";
                timeBox.appendChild(el("div", "metric-value metric-time", `${log.time || "--"}s`));

                const grindBox = document.createElement("div");
                grindBox.append(el("div", "metric-label", "GRIND"), el("div", "metric-value", log.grind || "--"));

                const ratioBox = document.createElement("div");
                ratioBox.className = "metric-right";
                ratioBox.append(el("div", "metric-ratio", `1:${ratio}`), el("div", "metric-subtext", `${log.dose || "--"}g → ${log.yield || "--"}g`));

                metrics.append(timeBox, grindBox, ratioBox);
                row.append(metrics, el("div", "advice-text", advice.text));
                row.onclick = () => { haptic('light'); app.openEditShot(log.id); };
                container.appendChild(row);
            });
        });
    },

    renderDialInSummary: () => {
        const tbody = document.getElementById('dial-in-table-body');
        tbody.replaceChildren();
        
        const grouped = {};
        logsCache.forEach(l => {
            const g = l.grind;
            if(!grouped[g]) grouped[g] = { ratioSum: 0, timeSum: 0, count: 0 };
            const r = parseFloat(l.yield) / parseFloat(l.dose);
            if(!isNaN(r)) { grouped[g].ratioSum += r; grouped[g].count++; }
            if(!isNaN(parseFloat(l.time))) grouped[g].timeSum += parseFloat(l.time);
        });

        const rows = Object.keys(grouped).map(g => ({
            grind: g,
            avgRatio: grouped[g].ratioSum / grouped[g].count,
            avgTime: Math.round(grouped[g].timeSum / grouped[g].count),
            count: grouped[g].count
        })).sort((a,b) => Math.abs(a.avgRatio - 2.0) - Math.abs(b.avgRatio - 2.0));

        if(rows.length === 0) {
            const tr = document.createElement('tr');
            const td = el("td", "summary-empty", "Awaiting extraction data...");
            td.colSpan = 4;
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        rows.forEach((row, i) => {
            const isBest = i === 0;
            const tr = document.createElement('tr');
            tr.className = isBest ? "summary-best-row" : "summary-row";
            [
                { text: row.grind, className: "summary-primary" },
                { text: `1:${row.avgRatio.toFixed(1)}` },
                { text: `${row.avgTime}s` },
                { text: `${row.count}x`, className: "summary-muted" }
            ].forEach(cell => {
                const td = el("td", cell.className || "", cell.text);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    },

    renderGlobalStats: async () => {
        const statsCard = document.getElementById('global-stats-card');
        const statsContent = document.getElementById('global-stats-content');
        
        const q = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        
        let total = 0;
        const grinds = {};
        snap.forEach(d => {
            total++;
            const g = d.data().grind;
            if(g) grinds[g] = (grinds[g] || 0) + 1;
        });

        if(total === 0) { statsCard.classList.add('hidden'); return; }
        statsCard.classList.remove('hidden');

        const top = Object.entries(grinds).sort((a,b) => b[1]-a[1]).slice(0,2);
        const stats = el("div", "stats-grid");
        const totalBox = document.createElement("div");
        totalBox.append(el("div", "stats-number", total), el("div", "stats-label", "Total Extractions"));

        const grindBox = document.createElement("div");
        grindBox.className = "stats-right";
        grindBox.append(el("div", "stats-top", top.map(t => t[0]).join(", ") || "None"), el("div", "stats-label", "Legacy Grinds"));

        stats.append(totalBox, grindBox);
        statsContent.replaceChildren(stats);
    },

    // --- PHOTO HANDLING ---
    handleImageUpload: (event) => {
        const file = event.target.files[0];
        if(!file) return;
        haptic('light');

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_W = 600;
                const scale = MAX_W / img.width;
                canvas.width = MAX_W;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                currentEditingImage = canvas.toDataURL('image/jpeg', 0.8);
                const preview = document.getElementById('edit-image-preview');
                preview.src = currentEditingImage;
                preview.classList.remove('hidden');
                document.getElementById('btn-remove-image').classList.remove('hidden');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    removeImage: () => {
        currentEditingImage = null;
        document.getElementById('edit-image-preview').classList.add('hidden');
        document.getElementById('btn-remove-image').classList.add('hidden');
    },

    // --- FORM HELPERS ---
    resetBeanForm: () => {
        ['input-bean-id', 'input-roaster', 'input-roaster-location', 'input-name', 'input-origin', 'input-ten-bean-weight'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('input-roast-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('input-roast-level').value = 'Medium';
        currentEditingTags = [];
        app.renderEditingTags();
        app.removeImage();
        app.setBeanRating(0);
        document.getElementById('bean-form-header').innerText = "New Coffee Profile";
        document.getElementById('btn-delete-bean').classList.add('hidden');
        document.getElementById('btn-save-bean').innerText = "Begin Profile";
    },

    setBeanRating: (n) => {
        haptic('light');
        document.getElementById('input-bean-rating').value = n;
        document.querySelectorAll('.bean-star').forEach((el, i) => { el.classList.toggle('selected', i < n); });
    },

    renderEditingTags: () => {
        const container = document.getElementById('editing-tags-container');
        container.replaceChildren();
        currentEditingTags.forEach((t, i) => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill active';
            pill.append(t, " ");
            const remove = el("button", "", "✕");
            remove.type = "button";
            remove.className = "tag-remove";
            remove.setAttribute("aria-label", `Remove ${t}`);
            remove.onclick = () => app.removeTag(i);
            pill.appendChild(remove);
            container.appendChild(pill);
        });
    },

    addTag: () => {
        const input = document.getElementById('input-new-tag');
        const tag = input.value.trim();
        if(tag && !currentEditingTags.includes(tag)) {
            currentEditingTags.push(tag);
            input.value = '';
            app.renderEditingTags();
        }
    },

    removeTag: (i) => { currentEditingTags.splice(i, 1); app.renderEditingTags(); },

    // --- SHOT LOGGING ---
    openLogShot: () => {
        haptic('light');
        document.getElementById('log-shot-title').innerText = "Modern Extraction Log";
        document.getElementById('input-log-bean-id').value = currentActiveBean?.id || '';
        document.getElementById('input-log-shot-id').value = '';
        document.getElementById('log-display-date').innerText = currentActiveBean?.currentRoastDate || "N/A";
        
        // Smarter defaults
        const defaultDose = userProfile.defaultDose || 18;
        document.getElementById('input-shot-dose').value = defaultDose;
        document.getElementById('input-shot-yield').value = defaultDose * 2;
        document.getElementById('input-shot-grind').value = logsCache[0]?.grind || '';
        document.getElementById('input-shot-time').value = '';
        
        const b1Total = userProfile.b1 ? ((parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0)) : 30;
        const b2Total = userProfile.b2 ? ((parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0)) : 30;
        
        document.getElementById('btn-time-1').innerText = `P1 (${b1Total}s)`;
        document.getElementById('btn-time-2').innerText = `P2 (${b2Total}s)`;
        
        document.getElementById('btn-delete-shot').classList.add('hidden');
        
        // Butler Preview Reset
        document.getElementById('log-butler-preview').classList.add('hidden');
        document.getElementById('log-butler-preview-text').innerText = "Input data to see extraction advice.";

        app.router('log-shot');
    },

    setTimeFromProfile: (btnNum) => {
        let total = 30;
        if(btnNum === 1 && userProfile.b1) {
            total = (parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0);
        } else if(btnNum === 2 && userProfile.b2) {
            total = (parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0);
        }
        document.getElementById('input-shot-time').value = total;
        app.liveButlerPreview();
        haptic('light');
    },

    liveButlerPreview: () => {
        const time = document.getElementById('input-shot-time').value;
        const dose = document.getElementById('input-shot-dose').value;
        const yieldVal = document.getElementById('input-shot-yield').value;
        const previewEl = document.getElementById('log-butler-preview');
        const previewText = document.getElementById('log-butler-preview-text');

        if(time && dose && yieldVal) {
            const mockShot = { time, dose, yield: yieldVal };
            const advice = getAIAdvice(mockShot, currentActiveBean?.roastLevel);
            previewText.innerText = `Butler predicts: ${advice.text}`;
            previewEl.classList.remove('hidden');
            previewEl.classList.toggle("good-preview", advice.status === "good");
            previewEl.classList.toggle("warning-preview", advice.status !== "good");
        } else {
            previewEl.classList.add('hidden');
            previewEl.classList.remove("good-preview", "warning-preview");
        }
    },

    saveShot: async () => {
        haptic('medium');
        const btn = document.getElementById('btn-save-shot');
        btn.innerText = "Syncing...";
        
        try {
            const beanId = document.getElementById('input-log-bean-id').value;
            const shotId = document.getElementById('input-log-shot-id').value;
            
            const data = {
                beanId, uid: currentUser.uid,
                grind: document.getElementById('input-shot-grind').value.trim(),
                time: document.getElementById('input-shot-time').value.trim(),
                dose: document.getElementById('input-shot-dose').value.trim(),
                yield: document.getElementById('input-shot-yield').value.trim(),
                date: new Date()
            };
            
            if(!data.grind) throw new Error("Grind setting is mandatory.");
            
            if(shotId) await updateDoc(doc(db, "brew_logs", shotId), data);
            else {
                data.roastDate = currentActiveBean?.currentRoastDate || "Unknown";
                await addDoc(collection(db, "brew_logs"), data);
            }
            
            await app.loadBeanDetail(beanId);
        } catch(e) { alert(e.message); btn.innerText = "Retry"; }
    },

    // --- USER PROFILE ---
    fetchProfile: async () => {
        try {
            const docRef = doc(db, "user_profiles", currentUser.uid);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                const data = snap.data();
                userProfile = {
                    machineName: data.machineName || 'Lelit Elizabeth',
                    aiEnabled: data.aiEnabled !== false,
                    defaultDose: parseFloat(data.defaultDose) || 18,
                    b1: data.b1 || { infusion: data.infusion || 3, bloom: data.bloom || 7, brew: 20 },
                    b2: data.b2 || { infusion: 0, bloom: 0, brew: 30 }
                };
            } else {
                userProfile = {
                    machineName: 'Lelit Elizabeth',
                    aiEnabled: true,
                    defaultDose: 18,
                    b1: { infusion: 3, bloom: 7, brew: 20 },
                    b2: { infusion: 0, bloom: 0, brew: 30 }
                };
                await setDoc(docRef, userProfile);
            }
        } catch(e) { console.error("Profile fetch error:", e); }
    },

    updateSettingsDisplay: () => {
        const b1Total = (parseInt(document.getElementById('profile-b1-infusion').value)||0) + 
                        (parseInt(document.getElementById('profile-b1-bloom').value)||0) + 
                        (parseInt(document.getElementById('profile-b1-brew').value)||0);
        
        const b2Total = (parseInt(document.getElementById('profile-b2-infusion').value)||0) + 
                        (parseInt(document.getElementById('profile-b2-bloom').value)||0) + 
                        (parseInt(document.getElementById('profile-b2-brew').value)||0);

        document.getElementById('profile-b1-total-display').innerText = b1Total;
        document.getElementById('profile-b2-total-display').innerText = b2Total;
    },

    openSettings: () => {
        haptic('light');
        document.getElementById('profile-machine-name').value = userProfile.machineName || '';
        document.getElementById('profile-ai-enabled').checked = userProfile.aiEnabled !== false;
        document.getElementById('profile-default-dose').value = userProfile.defaultDose || 18;
        
        if(userProfile.b1) {
            document.getElementById('profile-b1-infusion').value = userProfile.b1.infusion || 0;
            document.getElementById('profile-b1-bloom').value = userProfile.b1.bloom || 0;
            document.getElementById('profile-b1-brew').value = userProfile.b1.brew || 0;
        }
        
        if(userProfile.b2) {
            document.getElementById('profile-b2-infusion').value = userProfile.b2.infusion || 0;
            document.getElementById('profile-b2-bloom').value = userProfile.b2.bloom || 0;
            document.getElementById('profile-b2-brew').value = userProfile.b2.brew || 0;
        }

        app.updateSettingsDisplay();
        app.router('settings');
    },

    saveProfile: async () => {
        haptic('medium');
        const name = document.getElementById('profile-machine-name').value;
        const aiEnabled = document.getElementById('profile-ai-enabled').checked;
        const defaultDose = parseFloat(document.getElementById('profile-default-dose').value) || 18;
        
        const b1 = {
            infusion: parseInt(document.getElementById('profile-b1-infusion').value) || 0,
            bloom: parseInt(document.getElementById('profile-b1-bloom').value) || 0,
            brew: parseInt(document.getElementById('profile-b1-brew').value) || 0
        };

        const b2 = {
            infusion: parseInt(document.getElementById('profile-b2-infusion').value) || 0,
            bloom: parseInt(document.getElementById('profile-b2-bloom').value) || 0,
            brew: parseInt(document.getElementById('profile-b2-brew').value) || 0
        };

        userProfile = { machineName: name, aiEnabled, defaultDose, b1, b2 };
        
        try {
            await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile);
            app.renderDailyTip();
            app.router('list');
        } catch(e) { alert(e.message); }
    },

    getGeminiAnalysis: async (shot, bean) => {
        const butlerText = document.getElementById('butler-detail-text');
        const cacheKey = `${shot.id}_${shot.yield}`;
        if(aiCache[cacheKey]) {
            butlerText.textContent = `🤵🏻‍♂️ ${aiCache[cacheKey]}`;
            return;
        }

        butlerText.textContent = "🤵🏻‍♂️ Butler is analyzing the flavor profile...";
        
        try {
            const analyzeFn = httpsCallable(functions, 'analyzeShot');
            const result = await analyzeFn({ 
                shot, 
                bean: { name: bean.name, roastLevel: bean.roastLevel, origin: bean.origin },
                machine: { name: userProfile.machineName, infusion: userProfile.b1?.infusion || 3, bloom: userProfile.b1?.bloom || 7 }
            });
            
            aiCache[cacheKey] = result.data.text.trim();
            butlerText.textContent = `🤵🏻‍♂️ ${aiCache[cacheKey]}`;
        } catch(e) { 
            console.error("AI Analysis error:", e);
            butlerText.textContent = "🤵🏻‍♂️ Butler is momentarily unavailable. Check your grind manually!";
        }
    },

    renderAnalytics: async () => {
        haptic('light');
        app.router('analytics');
        const trendEmpty = document.getElementById("trend-empty-state");
        const distEmpty = document.getElementById("dist-empty-state");
        const insightEl = document.getElementById('analytics-insight-text');
        const trendCanvas = document.getElementById("trendChart");
        const distCanvas = document.getElementById("distChart");

        trendEmpty?.classList.add("hidden");
        distEmpty?.classList.add("hidden");
        trendCanvas?.classList.remove("hidden");
        distCanvas?.classList.remove("hidden");
        insightEl.textContent = "Analyzing your data for patterns...";

        const q = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const allLogs = [];
        snap.forEach(d => allLogs.push(d.data()));

        if (allLogs.length === 0) {
            if (chartTrend) chartTrend.destroy();
            if (chartDist) chartDist.destroy();
            trendCanvas?.classList.add("hidden");
            distCanvas?.classList.add("hidden");
            trendEmpty?.classList.remove("hidden");
            distEmpty?.classList.remove("hidden");
            insightEl.textContent = "Log a few extractions to unlock trends, grind frequency, and pattern insights.";
            return;
        }

        // Group by Date for Trend
        const last30 = new Date();
        last30.setDate(last30.getDate() - 30);
        
        const trendData = allLogs
            .filter(l => l.date && l.date.toDate() > last30)
            .sort((a,b) => a.date.toDate() - b.date.toDate());

        // Process Grind Distribution
        const grindCounts = {};
        allLogs.forEach(l => {
            if(l.grind) {
                const g = parseFloat(l.grind).toFixed(1);
                grindCounts[g] = (grindCounts[g] || 0) + 1;
            }
        });
        const distLabels = Object.keys(grindCounts).sort((a,b) => parseFloat(a) - parseFloat(b));
        const distValues = distLabels.map(l => grindCounts[l]);

        // Cleanup existing charts
        if (chartTrend) chartTrend.destroy();
        if (chartDist) chartDist.destroy();

        // 1. Trend Chart (Grind & Yield over time)
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        chartTrend = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: trendData.map(l => l.date.toDate().toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                datasets: [
                    {
                        label: 'Grind Setting',
                        data: trendData.map(l => parseFloat(l.grind)),
                        borderColor: '#6f4e37',
                        backgroundColor: 'rgba(111, 78, 55, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Yield (g)',
                        data: trendData.map(l => parseFloat(l.yield)),
                        borderColor: '#d2b48c',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { position: 'left', title: { display: true, text: 'Grind' } },
                    y1: { position: 'right', display: false, grid: { drawOnChartArea: false } }
                },
                plugins: { legend: { display: false } }
            }
        });

        // 2. Distribution Chart
        const ctxDist = document.getElementById('distChart').getContext('2d');
        chartDist = new Chart(ctxDist, {
            type: 'bar',
            data: {
                labels: distLabels,
                datasets: [{
                    data: distValues,
                    backgroundColor: 'rgba(111, 78, 55, 0.6)',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display : false } }
                }
            }
        });

        // AI Insight Generation
        const avgYield = allLogs.reduce((acc, l) => acc + (parseFloat(l.yield) || 0), 0) / allLogs.length;
        const topGrind = distLabels[distValues.indexOf(Math.max(...distValues))];
        
        let insight = `Your most consistent grind is ${topGrind}. `;
        if (trendData.length > 5) {
            const firstHalf = trendData.slice(0, Math.floor(trendData.length/2));
            const secondHalf = trendData.slice(Math.floor(trendData.length/2));
            const avg1 = firstHalf.reduce((a,b) => a + parseFloat(b.grind), 0) / firstHalf.length;
            const avg2 = secondHalf.reduce((a,b) => a + parseFloat(b.grind), 0) / secondHalf.length;
            
            if (avg2 > avg1 + 0.5) insight += "You've been grinding coarser recently, likely enjoying darker roasts.";
            else if (avg2 < avg1 - 0.5) insight += "You've been grinding finer recently, hitting those high-extraction light roasts.";
            else insight += "You have incredible grind stability across roasters.";
        }
        insightEl.textContent = insight;
    }
};

// Bind to window for HTML access
window.app = app;

// --- LISTENERS ---
const bindUiEvents = () => {
    on("btn-login", "click", () => app.login());
    on("btn-open-analytics", "click", () => app.renderAnalytics());
    on("btn-open-settings", "click", () => app.openSettings());
    on("btn-logout", "click", () => app.logout());
    on("input-sort-beans", "change", (event) => app.setSort(event.target.value));

    on("fab-add-bean", "click", () => {
        app.resetBeanForm();
        app.router("edit-bean");
    });
    on("fab-log-shot", "click", () => app.openLogShot());

    on("input-bean-image", "change", (event) => app.handleImageUpload(event));
    on("btn-remove-image", "click", () => app.removeImage());
    on("btn-add-tag", "click", () => app.addTag());
    on("input-new-tag", "keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            app.addTag();
        }
    });

    document.querySelectorAll(".bean-star").forEach(star => {
        star.addEventListener("click", () => app.setBeanRating(parseInt(star.dataset.rating, 10)));
    });

    on("btn-save-bean", "click", () => app.saveBean());
    on("btn-cancel-bean", "click", () => app.router("list"));
    on("btn-delete-bean", "click", () => app.deleteBean());
    on("btn-edit-active-bean", "click", () => app.editActiveBean());
    on("btn-update-roast-date", "click", () => app.promptNewDate());

    document.querySelectorAll("[data-route]").forEach(button => {
        button.addEventListener("click", () => app.router(button.dataset.route));
    });

    document.querySelectorAll(".shot-preview-input").forEach(input => {
        input.addEventListener("input", () => app.liveButlerPreview());
    });
    document.querySelectorAll(".time-profile-btn").forEach(button => {
        button.addEventListener("click", () => app.setTimeFromProfile(parseInt(button.dataset.profile, 10)));
    });
    on("btn-save-shot", "click", () => app.saveShot());
    on("btn-cancel-shot", "click", () => app.router("detail"));
    on("btn-delete-shot", "click", () => app.deleteShot());

    document.querySelectorAll(".settings-total-input").forEach(input => {
        input.addEventListener("input", () => app.updateSettingsDisplay());
    });
    on("profile-ai-enabled", "change", () => app.saveProfile());
    on("btn-save-profile", "click", () => app.saveProfile());
    on("btn-export-data", "click", () => app.exportData());
};

bindUiEvents();

onAuthStateChanged(auth, u => {
    if(u) {
        currentUser = u;
        app.fetchProfile().then(() => {
            app.fetchBeans();
            let hash = window.location.hash.substring(1);
            if (hash === 'login') hash = 'list'; // Prevent authenticated users from getting stuck on the login view
            app.router(hash || 'list');
        });
    } else {
        app.router('login');
    }
});

window.addEventListener('popstate', (e) => {
    if (e.state?.view) app.router(e.state.view, false);
});

console.log("Lincoln Barista Platinum v1.0 Initialized");
