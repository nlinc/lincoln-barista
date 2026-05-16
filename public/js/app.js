/**
 * Lincoln Barista "Platinum Roast" - Main Application Logic
 * Modularized and Optimized for Mobile. v1.3.4 - Fixed Syntax Edition.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAIAdvice } from "./brew-advice.js";

const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);
const functions = getFunctions(appInstance, 'us-central1');
const provider = new GoogleAuthProvider();

let currentUser = null;
let beans = [];
let activeFilters = new Set();
let currentSort = 'newest';
let currentActiveBean = null;
let logsCache = [];
let chartTrend = null;
let chartDist = null;
let userProfile = { machineName: 'Lelit Elizabeth', aiEnabled: true, defaultDose: 18, b1: { infusion: 3, bloom: 7, brew: 20 }, b2: { infusion: 0, bloom: 0, brew: 30 } };
let aiCache = {};
let currentEditingTags = [];
let currentEditingImage = null;
let currentRecipeShot = null;

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

const renderTip = (target, text) => { target.innerHTML = '💡 <b>Daily Tip:</b> ' + text; };
const renderEmpty = (target, text) => { target.replaceChildren(el("div", "empty-state", text)); };
const renderEmptyAction = (target, title, body, actionText, action) => {
    const empty = el("div", "empty-panel");
    empty.append(el("div", "empty-panel-title", title), el("div", "empty-panel-copy", body));
    if (actionText && action) {
        const button = el("button", "btn empty-panel-action", actionText);
        button.type = "button"; button.addEventListener("click", action);
        empty.appendChild(button);
    }
    target.replaceChildren(empty);
};

const ratioFor = (shot) => {
    const dose = parseFloat(shot?.dose); const yieldVal = parseFloat(shot?.yield);
    if (!dose || isNaN(dose) || isNaN(yieldVal)) return null;
    return yieldVal / dose;
};

const chooseCurrentRecipe = (logs, roastLevel) => {
    if (!logs.length) return null;
    const latestGood = logs.find(log => getAIAdvice(log, roastLevel).status === "good");
    return { shot: latestGood || logs[0], status: latestGood ? "Dialed" : "Resume" };
};

const on = (id, eventName, handler) => { const node = document.getElementById(id); if (node) node.addEventListener(eventName, handler); };

const app = {
    router: (viewName, addToHistory = true) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        const targetView = document.getElementById('view-' + viewName);
        if (targetView) targetView.classList.add('active');
        const topBar = document.getElementById('top-bar');
        if (topBar) topBar.style.display = (viewName === 'login') ? 'none' : 'flex';
        if (addToHistory) {
            const state = { view: viewName }; const url = "#" + viewName;
            if (viewName === 'list' && !history.state) history.replaceState(state, "", url);
            else history.pushState(state, "", url);
        }
        window.scrollTo(0, 0);
    },

    login: async () => { haptic('medium'); try { await signInWithPopup(auth, provider); } catch(e) { alert(e.message); } },
    logout: () => { if(confirm("Logout?")) { haptic('heavy'); signOut(auth).then(() => location.reload()); } },

    fetchBeans: async () => {
        const container = document.getElementById('bean-list-container');
        if (container) renderEmpty(container, "Syncing collection...");
        try {
            const q = query(collection(db, "beans"), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            beans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            app.renderBeanList(); app.renderGlobalStats(); app.renderDailyTip();
        } catch(e) { console.error("Bean fetch error:", e); }
    },

    renderDailyTip: async () => {
        const tipEl = document.getElementById('daily-tip-text');
        if(!tipEl || !userProfile.aiEnabled) return;
        try {
            const getTipFn = httpsCallable(functions, 'getDailyTip');
            const result = await getTipFn({});
            renderTip(tipEl, result.data.text || "Grind finer for light roasts!");
        } catch(e) { renderTip(tipEl, "Keep your coffee station clean!"); }
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

        if(visibleBeans.length === 0) { renderEmptyAction(container, "No coffee found", "Start a new profile.", "Add Bean", () => { app.resetBeanForm(); app.router("edit-bean"); }); return; }
        visibleBeans.forEach((b, idx) => {
            const card = document.createElement('div'); card.className = 'bean-card';
            card.style.setProperty('--roast-color', app.getRoastColor(b.roastLevel));
            card.style.setProperty('--roast-glow', app.getRoastGlow(b.roastLevel));
            let thumbHtml = b.image ? '<div class="bean-card-thumb" style="background-image: url(\'' + b.image + '\')"></div>' : '<div class="bean-card-thumb thumb-placeholder">☕</div>';
            card.innerHTML = '<div class="roast-bar"></div>' + thumbHtml + '<div class="bean-card-body"><div class="roaster-name">' + (b.roaster || "Unknown") + (b.rating ? ' ★' + b.rating : '') + '</div><div class="bean-card-name">' + (b.name || "Untitled") + '</div><div class="bean-card-tags">' + (b.tags || []).slice(0, 2).map(t => '<span class="tag-pill">#' + t + '</span>').join('') + '</div></div>';
            card.onclick = () => app.loadBeanDetail(b.id);
            container.appendChild(card);
        });
    },

    setSort: (value) => { currentSort = value; app.renderBeanList(); },

    saveBean: async () => {
        haptic('medium'); const btn = document.getElementById('btn-save-bean'); const originalText = btn.innerText; btn.innerText = "Processing...";
        try {
            const id = document.getElementById('input-bean-id').value;
            const data = {
                uid: currentUser.uid, roaster: document.getElementById('input-roaster').value, roasterLocation: document.getElementById('input-roaster-location').value,
                name: document.getElementById('input-name').value, origin: document.getElementById('input-origin').value, roastLevel: document.getElementById('input-roast-level').value,
                tenBeanWeight: document.getElementById('input-ten-bean-weight').value.trim(), tags: currentEditingTags, rating: parseInt(document.getElementById('input-bean-rating').value) || 0,
                image: currentEditingImage, updatedAt: new Date()
            };
            const manualRoastDate = document.getElementById('input-roast-date').value;
            if(!data.name) throw new Error("Bean name is required.");
            if(id) await updateDoc(doc(db, "beans", id), { ...data, currentRoastDate: manualRoastDate });
            else await addDoc(collection(db, "beans"), { ...data, currentRoastDate: manualRoastDate || new Date().toISOString().split('T')[0], createdAt: new Date() });
            await app.fetchBeans(); app.router('list');
        } catch(e) { alert(e.message); btn.innerText = originalText; }
    },

    deleteBean: async () => { if(confirm("Archive this bean?")) { await deleteDoc(doc(db, "beans", document.getElementById('input-bean-id').value)); await app.fetchBeans(); app.router('list'); } },

    editActiveBean: () => {
        const b = currentActiveBean; haptic('light');
        document.getElementById('bean-form-header').innerText = "Edit Coffee Profile";
        document.getElementById('input-bean-id').value = b.id;
        document.getElementById('input-roaster').value = b.roaster;
        document.getElementById('input-roaster-location').value = b.roasterLocation || '';
        document.getElementById('input-name').value = b.name;
        document.getElementById('input-origin').value = b.origin || '';
        document.getElementById('input-roast-level').value = b.roastLevel || 'Medium';
        document.getElementById('input-ten-bean-weight').value = b.tenBeanWeight || '';
        document.getElementById('input-roast-date').value = b.currentRoastDate || '';
        currentEditingTags = b.tags ? [...b.tags] : []; app.renderEditingTags();
        if(b.image) { currentEditingImage = b.image; const preview = document.getElementById('edit-image-preview'); preview.src = b.image; preview.classList.remove('hidden'); document.getElementById('btn-remove-image').classList.remove('hidden'); }
        else app.removeImage();
        app.setBeanRating(b.rating || 0); document.getElementById('btn-delete-bean').classList.remove('hidden'); document.getElementById('btn-save-bean').innerText = "Update Profile"; app.router('edit-bean');
    },

    loadBeanDetail: async (id) => {
        try {
            currentActiveBean = beans.find(b => b.id === id); if(!currentActiveBean) return app.router('list');
            const imgEl = document.getElementById('detail-image');
            if(currentActiveBean.image) { imgEl.src = currentActiveBean.image; imgEl.classList.remove('hidden'); } else imgEl.classList.add('hidden');
            document.getElementById('detail-roaster').innerText = currentActiveBean.roaster;
            document.getElementById('detail-name').innerText = currentActiveBean.name;
            document.getElementById('detail-rating').innerText = '★'.repeat(currentActiveBean.rating || 0);
            const roastDate = currentActiveBean.currentRoastDate || "Unknown";
            document.getElementById('detail-date').innerText = roastDate;
            const q = query(collection(db, "brew_logs"), where("beanId", "==", id), where("uid", "==", currentUser.uid));
            const snapshot = await getDocs(q); logsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logsCache.sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
            if(roastDate !== "Unknown") {
                const days = Math.floor((new Date() - new Date(roastDate)) / (86400000));
                const msg = (days >= 7 && days <= 21) ? "✨ Peak Flavor Window" : (days < 7 ? "⏳ Resting..." : "🫘 Aging");
                document.getElementById('detail-age').innerText = days + " days since roast • " + msg;
            } else document.getElementById('detail-age').innerText = "";
            app.renderHistory(); app.renderDialInSummary(); app.renderCurrentRecipe();
            const b1Offset = (parseInt(userProfile.b1?.infusion)||0) + (parseInt(userProfile.b1?.bloom)||0);
            document.getElementById('machine-badge').innerText = (userProfile.machineName || 'Generic') + " • " + b1Offset + "s Offset (P1)";
            const memoryBlock = document.getElementById('memory-block');
            if(logsCache.length > 0 && userProfile.aiEnabled) { app.getGeminiAnalysis(logsCache[0], currentActiveBean).catch(console.error); memoryBlock.classList.remove('hidden'); }
            else memoryBlock.classList.add('hidden');
            app.router('detail');
        } catch(e) { console.error("Detail error:", e); app.router('list'); }
    },

    getGeminiAnalysis: async (shot, bean) => {
        const butlerText = document.getElementById('butler-detail-text'); if (!butlerText) return;
        const cacheKey = shot.id + "_" + shot.yield; if(aiCache[cacheKey]) { butlerText.textContent = '"' + aiCache[cacheKey] + '"'; return; }
        butlerText.textContent = "\"Summarizing where this bean left off...\"";
        try {
            const analyzeFn = httpsCallable(functions, 'analyzeShot');
            const result = await analyzeFn({ shot, bean: { name: bean.name, roastLevel: bean.roastLevel, origin: bean.origin }, machine: { name: userProfile.machineName, infusion: userProfile.b1?.infusion || 3, bloom: userProfile.b1?.bloom || 7 } });
            aiCache[cacheKey] = result.data.text.trim().replace(/^"|"$/g, ''); butlerText.textContent = '"' + aiCache[cacheKey] + '"';
        } catch(e) { butlerText.textContent = "\"Shot memory is momentarily unavailable.\""; }
    },

    renderCurrentRecipe: () => {
        const consoleEl = document.getElementById("dial-in-console");
        const recipe = chooseCurrentRecipe(logsCache, currentActiveBean?.roastLevel); currentRecipeShot = recipe?.shot || null;
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
        const container = document.getElementById('history-container'); container.replaceChildren();
        if(logsCache.length === 0) { renderEmptyAction(container, "No logs", "Log your first extraction.", "Log Shot", () => app.openLogShot()); return; }
        const groups = {}; logsCache.forEach(log => { const k = log.roastDate || "Original Batch"; if(!groups[k]) groups[k] = []; groups[k].push(log); });
        Object.keys(groups).sort().reverse().forEach(batch => {
            container.appendChild(el("div", "field-kicker", "Batch: " + batch));
            groups[batch].forEach(log => {
                const advice = getAIAdvice(log, currentActiveBean?.roastLevel); const ratio = (parseFloat(log.yield) / parseFloat(log.dose)).toFixed(1);
                const row = el("div", "log-row ext-" + advice.status);
                row.innerHTML = '<div class="log-row-metrics"><div class="metric-value">' + log.time + 's</div><div style="text-align:center"><div class="recipe-label">Grind</div><div class="metric-value">' + log.grind + '</div></div><div style="text-align:right"><div class="metric-value">1:' + ratio + '</div><div class="recipe-label">' + log.dose + 'g → ' + log.yield + 'g</div></div></div><div class="advice-text">' + advice.text + '</div>';
                row.onclick = () => app.openEditShot(log.id); container.appendChild(row);
            });
        });
    },

    renderDialInSummary: () => {
        const tbody = document.getElementById('dial-in-table-body'); if (!tbody) return; tbody.replaceChildren();
        const grouped = {};
        logsCache.forEach(l => { if (!l.grind) return; const g = l.grind; if(!grouped[g]) grouped[g] = { ratioSum: 0, timeSum: 0, count: 0 }; const r = parseFloat(l.yield) / parseFloat(l.dose); if(!isNaN(r)) { grouped[g].ratioSum += r; grouped[g].count++; } if(!isNaN(parseFloat(l.time))) grouped[g].timeSum += parseFloat(l.time); });
        const rows = Object.keys(grouped).map(g => { const data = grouped[g]; return { grind: g, avgRatio: data.count > 0 ? data.ratioSum / data.count : 0, avgTime: data.count > 0 ? Math.round(data.timeSum / data.count) : 0, count: data.count }; }).sort((a,b) => Math.abs(a.avgRatio - 2.0) - Math.abs(b.avgRatio - 2.0));
        if(rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="summary-empty">Log some shots to see metrics.</td></tr>'; return; }
        rows.forEach((row, i) => { const tr = document.createElement('tr'); if(i === 0) tr.className = "summary-best-row"; tr.innerHTML = '<td class="summary-primary">' + row.grind + '</td><td>1:' + row.avgRatio.toFixed(1) + '</td><td>' + row.avgTime + 's</td><td style="opacity:0.6">' + row.count + 'x</td>'; tbody.appendChild(tr); });
    },

    renderGlobalStats: async () => {
        const statsContent = document.getElementById('global-stats-content');
        try {
            const q = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid)); const snap = await getDocs(q);
            let total = 0; const grinds = {}; snap.forEach(d => { total++; const g = d.data().grind; if(g) grinds[g] = (grinds[g] || 0) + 1; });
            if(total === 0) { document.getElementById('global-stats-card').classList.add('hidden'); return; }
            document.getElementById('global-stats-card').classList.remove('hidden');
            const top = Object.entries(grinds).sort((a,b) => b[1]-a[1]).slice(0,2);
            statsContent.innerHTML = '<div class="stat-item"><strong>' + total + '</strong><span>Total Logs</span></div><div class="stat-item"><strong>' + (top.map(t => t[0]).join(", ") || "None") + '</strong><span>Legacy Grinds</span></div>';
        } catch(e) {}
    },

    handleImageUpload: (event) => {
        const file = event.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (e) => {
            const img = new Image(); img.onload = () => {
                const canvas = document.createElement('canvas'); const MAX_W = 600; const scale = MAX_W / img.width; canvas.width = MAX_W; canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); currentEditingImage = canvas.toDataURL('image/jpeg', 0.8);
                const preview = document.getElementById('edit-image-preview'); preview.src = currentEditingImage; preview.classList.remove('hidden'); document.getElementById('btn-remove-image').classList.remove('hidden');
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    },
    removeImage: () => { currentEditingImage = null; document.getElementById('edit-image-preview').classList.add('hidden'); document.getElementById('btn-remove-image').classList.add('hidden'); },
    resetBeanForm: () => { ['input-bean-id', 'input-roaster', 'input-roaster-location', 'input-name', 'input-origin', 'input-ten-bean-weight'].forEach(id => { document.getElementById(id).value = ''; }); document.getElementById('input-roast-date').value = new Date().toISOString().split('T')[0]; document.getElementById('input-roast-level').value = 'Medium'; currentEditingTags = []; app.renderEditingTags(); app.removeImage(); app.setBeanRating(0); },
    setBeanRating: (n) => { haptic('light'); document.getElementById('input-bean-rating').value = n; document.querySelectorAll('.bean-star').forEach((el, i) => el.classList.toggle('selected', i < n)); },
    renderEditingTags: () => { const container = document.getElementById('editing-tags-container'); container.replaceChildren(); currentEditingTags.forEach((t, i) => { const pill = document.createElement('span'); pill.className = 'tag-pill active'; pill.append(t, " "); const rm = el("button", "tag-remove", "✕"); rm.onclick = () => app.removeTag(i); pill.appendChild(rm); container.appendChild(pill); }); },
    addTag: () => { const input = document.getElementById('input-new-tag'); const tag = input.value.trim(); if(tag && !currentEditingTags.includes(tag)) { currentEditingTags.push(tag); input.value = ''; app.renderEditingTags(); } },
    removeTag: (i) => { currentEditingTags.splice(i, 1); app.renderEditingTags(); },
    openLogShot: () => { haptic('light'); document.getElementById('log-shot-title').innerText = currentRecipeShot ? "Repeat Recipe" : "Log Extraction"; document.getElementById('input-log-bean-id').value = currentActiveBean?.id || ''; document.getElementById('input-log-shot-id').value = ''; document.getElementById('log-display-date').innerText = currentActiveBean?.currentRoastDate || "N/A"; const defDose = userProfile.defaultDose || 18; document.getElementById('input-shot-dose').value = currentRecipeShot?.dose || defDose; document.getElementById('input-shot-yield').value = currentRecipeShot?.yield || defDose * 2; document.getElementById('input-shot-grind').value = currentRecipeShot?.grind || logsCache[0]?.grind || ''; document.getElementById('input-shot-time').value = currentRecipeShot?.time || ''; const b1T = userProfile.b1 ? (parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0) : 30; const b2T = userProfile.b2 ? (parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0) : 30; document.getElementById('btn-time-1').innerText = "P1 (" + b1T + "s)"; document.getElementById('btn-time-2').innerText = "P2 (" + b2T + "s)"; document.getElementById('btn-save-shot').innerText = "Log Extraction"; app.liveButlerPreview(); app.router('log-shot'); },
    setTimeFromProfile: (n) => { let t = 30; if(n === 1 && userProfile.b1) t = (parseInt(userProfile.b1.infusion)||0) + (parseInt(userProfile.b1.bloom)||0) + (parseInt(userProfile.b1.brew)||0); else if(n === 2 && userProfile.b2) t = (parseInt(userProfile.b2.infusion)||0) + (parseInt(userProfile.b2.bloom)||0) + (parseInt(userProfile.b2.brew)||0); document.getElementById('input-shot-time').value = t; app.liveButlerPreview(); },
    liveButlerPreview: () => { const t = document.getElementById('input-shot-time').value; const d = document.getElementById('input-shot-dose').value; const y = document.getElementById('input-shot-yield').value; if(t && d && y) { const mock = { time: t, dose: d, yield: y }; const adv = getAIAdvice(mock, currentActiveBean?.roastLevel); const r = ratioFor(mock); document.getElementById('log-butler-preview-text').innerText = "1:" + (r ? r.toFixed(1) : '?') + ". " + adv.text; document.getElementById('log-butler-preview').classList.remove('hidden'); } else document.getElementById('log-butler-preview').classList.add('hidden'); },
    saveShot: async () => { haptic('medium'); try { const bId = document.getElementById('input-log-bean-id').value; const sId = document.getElementById('input-log-shot-id').value; const data = { beanId: bId, uid: currentUser.uid, grind: document.getElementById('input-shot-grind').value.trim(), time: document.getElementById('input-shot-time').value.trim(), dose: document.getElementById('input-shot-dose').value.trim(), yield: document.getElementById('input-shot-yield').value.trim(), date: new Date() }; if(!data.grind) throw new Error("Grind is required."); if(sId) await updateDoc(doc(db, "brew_logs", sId), data); else { data.roastDate = currentActiveBean?.currentRoastDate || "Unknown"; await addDoc(collection(db, "brew_logs"), data); } await app.loadBeanDetail(bId); } catch(e) { alert(e.message); } },
    openEditShot: (sId) => { const log = logsCache.find(l => l.id === sId); if(!log) return; document.getElementById('log-shot-title').innerText = "Edit Log"; document.getElementById('input-log-bean-id').value = currentActiveBean?.id || log.beanId; document.getElementById('input-log-shot-id').value = sId; document.getElementById('log-display-date').innerText = log.roastDate; document.getElementById('input-shot-grind').value = log.grind; document.getElementById('input-shot-time').value = log.time; document.getElementById('input-shot-dose').value = log.dose; document.getElementById('input-shot-yield').value = log.yield; document.getElementById('btn-save-shot').innerText = "Update Log"; document.getElementById('btn-delete-shot').classList.remove('hidden'); app.router('log-shot'); },
    deleteShot: async () => { if(confirm("Delete log?")) { const sId = document.getElementById('input-log-shot-id').value; const bId = document.getElementById('input-log-bean-id').value; await deleteDoc(doc(db, "brew_logs", sId)); await app.loadBeanDetail(bId); } },
    fetchProfile: async () => { try { const snap = await getDoc(doc(db, "user_profiles", currentUser.uid)); if (snap.exists()) { const d = snap.data(); userProfile = { machineName: d.machineName || 'Lelit Elizabeth', aiEnabled: d.aiEnabled !== false, defaultDose: parseFloat(d.defaultDose) || 18, b1: d.b1 || { infusion: d.infusion || 3, bloom: d.bloom || 7, brew: 20 }, b2: d.b2 || { infusion: 0, bloom: 0, brew: 30 } }; } else await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile); } catch(e) {} },
    updateSettingsDisplay: () => { const b1 = (parseInt(document.getElementById('profile-b1-infusion').value)||0) + (parseInt(document.getElementById('profile-b1-bloom').value)||0) + (parseInt(document.getElementById('profile-b1-brew').value)||0); const b2 = (parseInt(document.getElementById('profile-b2-infusion').value)||0) + (parseInt(document.getElementById('profile-b2-bloom').value)||0) + (parseInt(document.getElementById('profile-b2-brew').value)||0); document.getElementById('profile-b1-total-display').innerText = b1; document.getElementById('profile-b2-total-display').innerText = b2; },
    openSettings: () => { document.getElementById('profile-machine-name').value = userProfile.machineName; document.getElementById('profile-ai-enabled').checked = userProfile.aiEnabled; document.getElementById('profile-default-dose').value = userProfile.defaultDose; if(userProfile.b1) { document.getElementById('profile-b1-infusion').value = userProfile.b1.infusion; document.getElementById('profile-b1-bloom').value = userProfile.b1.bloom; document.getElementById('profile-b1-brew').value = userProfile.b1.brew; } if(userProfile.b2) { document.getElementById('profile-b2-infusion').value = userProfile.b2.infusion; document.getElementById('profile-b2-bloom').value = userProfile.b2.bloom; document.getElementById('profile-b2-brew').value = userProfile.b2.brew; } app.updateSettingsDisplay(); app.router('settings'); },
    saveProfile: async () => { const b1 = { infusion: parseInt(document.getElementById('profile-b1-infusion').value) || 0, bloom: parseInt(document.getElementById('profile-b1-bloom').value) || 0, brew: parseInt(document.getElementById('profile-b1-brew').value) || 0 }; const b2 = { infusion: parseInt(document.getElementById('profile-b2-infusion').value) || 0, bloom: parseInt(document.getElementById('profile-b2-bloom').value) || 0, brew: parseInt(document.getElementById('profile-b2-brew').value) || 0 }; userProfile = { machineName: document.getElementById('profile-machine-name').value, aiEnabled: document.getElementById('profile-ai-enabled').checked, defaultDose: parseFloat(document.getElementById('profile-default-dose').value) || 18, b1, b2 }; await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile); app.router('list'); },
    openAnalytics: async () => { app.router('analytics'); },
    repeatCurrentRecipe: async () => { if (!currentRecipeShot || !currentActiveBean) return app.openLogShot(); if(confirm("Repeat recipe?")) { await addDoc(collection(db, "brew_logs"), { beanId: currentActiveBean.id, uid: currentUser.uid, grind: currentRecipeShot.grind, time: currentRecipeShot.time, dose: currentRecipeShot.dose, yield: currentRecipeShot.yield, roastDate: currentActiveBean.currentRoastDate || "Unknown", date: new Date() }); await app.loadBeanDetail(currentActiveBean.id); } },
    promptNewDate: async () => app.editActiveBean()
};

window.app = app;
onAuthStateChanged(auth, u => { if(u) { currentUser = u; app.fetchProfile().then(() => { app.fetchBeans(); app.router(window.location.hash.substring(1) || 'list'); }); } else app.router('login'); });
on("btn-login", "click", () => app.login()); on("btn-open-settings", "click", () => app.openSettings()); on("btn-logout", "click", () => app.logout());
on("input-sort-beans", "change", (e) => app.setSort(e.target.value)); on("fab-add-bean", "click", () => { app.resetBeanForm(); app.router("edit-bean"); }); on("fab-log-shot", "click", () => app.openLogShot());
on("input-bean-image", "change", (e) => app.handleImageUpload(e)); on("btn-remove-image", "click", () => app.removeImage()); on("btn-add-tag", "click", () => app.addTag());
document.querySelectorAll(".bean-star").forEach(s => s.onclick = () => app.setBeanRating(parseInt(s.dataset.rating)));
on("btn-save-bean", "click", () => app.saveBean()); on("btn-cancel-bean", "click", () => app.router("list")); on("btn-delete-bean", "click", () => app.deleteBean());
on("btn-edit-active-bean", "click", () => app.editActiveBean()); on("btn-update-roast-date", "click", () => app.promptNewDate()); on("btn-repeat-recipe", "click", () => app.repeatCurrentRecipe());
on("btn-adjust-recipe", "click", () => app.openLogShot());
document.querySelectorAll("[data-route]").forEach(b => b.onclick = () => app.router(b.dataset.route));
on("btn-time-1", "click", () => app.setTimeFromProfile(1)); on("btn-time-2", "click", () => app.setTimeFromProfile(2));
on("btn-save-shot", "click", () => app.saveShot()); on("btn-cancel-shot", "click", () => app.router("detail")); on("btn-delete-shot", "click", () => app.deleteShot());
on("btn-save-profile", "click", () => app.saveProfile()); on("btn-export-data", "click", () => app.exportData());
window.addEventListener('popstate', (e) => { if (e.state?.view) app.router(e.state.view, false); });
