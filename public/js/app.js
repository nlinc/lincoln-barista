/**
 * Lincoln Barista "Platinum Roast" - Main Application Logic
 * Modularized and Optimized for Mobile.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const appInstance = initializeApp(firebaseConfig);
const auth = getAuth(appInstance);
const db = getFirestore(appInstance);
const provider = new GoogleAuthProvider();

// AI Config
const GEMINI_API_KEY = 'AIzaSyDtfGUcL45kTAQUXK4BI62fgUHuonjbVEM';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
    infusion: 3,
    bloom: 7,
    aiEnabled: true
};
let aiCache = {};

// --- UTILS ---
const haptic = (type = 'light') => {
    if (!window.navigator.vibrate) return;
    if (type === 'light') window.navigator.vibrate(10);
    else if (type === 'medium') window.navigator.vibrate(30);
    else if (type === 'heavy') window.navigator.vibrate([50, 30, 50]);
};

// AI Brew Butler Logic
const getAIAdvice = (shot, roastLevel = 'Medium') => {
    const ratio = parseFloat(shot.yield) / parseFloat(shot.dose);
    const time = parseFloat(shot.time);
    const roast = (roastLevel || 'Medium').toLowerCase();

    // Ideal targets based on roast
    const targets = {
        light: { ratio: [2.0, 2.5], time: [30, 40], name: 'Light' },
        medium: { ratio: [1.8, 2.2], time: [27, 33], name: 'Medium' },
        dark: { ratio: [1.5, 2.0], time: [22, 28], name: 'Dark' },
        espresso: { ratio: [1.8, 2.2], time: [25, 32], name: 'Espresso' }
    };

    // SPECIAL: Machine Profile Scaling
    // Now dynamic based on user profile logic
    const totalOffset = (userProfile.infusion || 0) + (userProfile.bloom || 0);
    const targetBase = targets[roast] || targets.medium;
    
    // Scale the time target by adding the machine offset
    const timeTarget = [targetBase.time[0] + totalOffset, targetBase.time[1] + totalOffset];

    if (ratio > targetBase.ratio[1]) advice.push("Yield too high (Grind Finer)");
    else if (ratio < targetBase.ratio[0]) advice.push("Yield too low (Grind Coarser)");

    if (time > timeTarget[1]) advice.push("Slow flow (Grind Coarser)");
    else if (time < timeTarget[0]) advice.push("Fast flow (Grind Finer)");

    if (advice.length > 0) {
        status = (ratio > targetBase.ratio[1] || time < timeTarget[0]) ? 'fast' : 'slow';
    }

    return {
        text: advice.length > 0 ? advice.join(" • ") : "Golden Range Identified",
        status: status
    };
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
        const q = query(collection(db, "beans"), where("uid", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        beans = [];
        snapshot.forEach((doc) => beans.push({ id: doc.id, ...doc.data() }));
        app.renderBeanList();
        app.renderGlobalStats();
        app.renderDailyTip();
    },

    renderDailyTip: async () => {
        const tipEl = document.getElementById('daily-tip-text');
        if(!tipEl || !userProfile.aiEnabled) return;
        
        try {
            const prompt = "You are a world-class barista. Give a 1-sentence interesting scientific tip about coffee beans, roasting, or espresso machine maintenance (like the Lelit Elizabeth). Keep it brief and professional.";
            const res = await fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Grind finer for light roasts!";
            tipEl.innerHTML = `💡 <b>Daily Tip:</b> ${text}`;
        } catch(e) { console.error("Tip error:", e); }
    },

    renderBeanList: () => {
        const container = document.getElementById('bean-list-container');
        const filterBar = document.getElementById('filter-bar');
        container.innerHTML = '';
        filterBar.innerHTML = '';

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
            const clearBtn = document.createElement('div');
            clearBtn.className = 'tag-pill active';
            clearBtn.style.background = 'var(--error-text)';
            clearBtn.innerText = '✕ Clear All';
            clearBtn.onclick = () => { activeFilters.clear(); app.renderBeanList(); };
            filterBar.appendChild(clearBtn);
            activeFilters.forEach(f => {
                const chip = document.createElement('div');
                chip.className = 'tag-pill active';
                chip.innerText = f;
                chip.onclick = () => { activeFilters.delete(f); app.renderBeanList(); };
                filterBar.appendChild(chip);
            });
        } else { filterBar.classList.add('hidden'); }

        if(visibleBeans.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 3rem; color: var(--text-muted);">No beans found. Start by adding a new bag.</div>`;
            return;
        }

        visibleBeans.forEach(b => {
            const card = document.createElement('div');
            card.className = `card bean-card roast-${b.roastLevel || 'Medium'}`;
            const ratingStars = b.rating > 0 ? `<span style="color:#fbbf24;">${'★'.repeat(b.rating)}</span>` : '';
            const img = b.image ? `<img src="${b.image}" class="bean-card-thumb">` : `<div class="bean-card-thumb" style="display:flex; align-items:center; justify-content:center; font-size:1.5rem;">☕</div>`;
            
            card.innerHTML = `
                ${img}
                <div style="flex:1;">
                    <div style="font-size:0.65rem; color:var(--primary); font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">
                        ${b.roaster} • ${b.roastLevel || ''} ${ratingStars}
                    </div>
                    <div style="font-weight:700; font-size:1.1rem; color:var(--text-main);">${b.name}</div>
                    <div style="margin-top:4px;">
                        ${b.origin ? `<span class="tag-pill">📍 ${b.origin}</span>` : ''}
                        ${(b.tags || []).slice(0, 2).map(t => `<span class="tag-pill">#${t}</span>`).join('')}
                    </div>
                </div>
            `;
            card.onclick = () => { haptic('light'); app.loadBeanDetail(b.id); };
            container.appendChild(card);
        });
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

            if(!data.name) throw new Error("Bean name is required.");
            
            if(id) await updateDoc(doc(db, "beans", id), data);
            else await addDoc(collection(db, "beans"), { ...data, currentRoastDate: new Date().toISOString().split('T')[0], createdAt: new Date() });
            
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
        const newDate = prompt("Enter roast date for the NEW bag (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
        if (newDate && currentActiveBean) {
            haptic('medium');
            await updateDoc(doc(db, "beans", currentActiveBean.id), { currentRoastDate: newDate });
            await app.fetchBeans(); 
            await app.loadBeanDetail(currentActiveBean.id);
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
        document.getElementById('detail-date').innerText = roastDate;
        if(roastDate !== "Unknown") {
            const days = Math.floor((new Date() - new Date(roastDate)) / (1000 * 60 * 60 * 24));
            document.getElementById('detail-age').innerText = `${days} days since roast`;
            
            // Peak Flavor Hint
            const msg = (days >= 7 && days <= 21) ? "✨ Peak Flavor Window" : (days < 7 ? "⏳ Resting..." : "🫘 Aging");
            document.getElementById('detail-age').innerText += ` • ${msg}`;
        }

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

        app.renderHistory();
        app.renderDialInSummary();

        // Reveal the Butler
        const butlerCard = document.getElementById('butler-advice-card');
        const butlerText = document.getElementById('butler-detail-text');
        const machineBadge = document.getElementById('machine-badge');

        machineBadge.innerText = `${userProfile.machineName || 'Generic'} • ${(userProfile.infusion||0)+(userProfile.bloom||0)}s Offset`;

        if(logsCache.length > 0) {
            const lastLog = logsCache[0];
            const heuristicAdvice = getAIAdvice(lastLog, userProfile.machineName);
            butlerText.innerHTML = `"${heuristicAdvice.text}"`;
            butlerCard.classList.remove('hidden');

            // Trigger True AI if enabled and not cached
            if(userProfile.aiEnabled) {
                app.getGeminiAnalysis(lastLog, currentActiveBean);
            }
        } else {
            butlerCard.classList.add('hidden');
        }

        app.router('detail');
    },

    renderHistory: () => {
        const container = document.getElementById('history-container');
        container.innerHTML = '';
        
        if(logsCache.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">No shots logged yet. Press ☕ to start.</div>`;
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
            const header = document.createElement('div');
            header.style = "font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--primary); margin: 1.5rem 0 0.5rem 0.5rem;";
            header.innerText = `Batch: ${batch}`;
            container.appendChild(header);

            groups[batch].forEach(log => {
                const advice = getAIAdvice(log, currentActiveBean?.roastLevel);
                const row = document.createElement('div');
                row.className = `log-row ext-${advice.status}`;
                const ratio = (parseFloat(log.yield) / parseFloat(log.dose)).toFixed(1);
                
                row.innerHTML = `
                    <div style="text-align:center;">
                        <div style="font-weight:700; font-size:1.1rem;">${log.time || '--'}s</div>
                        <div class="advice-text" style="color: var(--text-muted);">${advice.text}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">GRIND</div>
                        <div style="font-weight:700;">${log.grind}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:600; color:var(--primary);">1:${ratio}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${log.dose}g → ${log.yield}g</div>
                    </div>
                `;
                row.onclick = () => { haptic('light'); app.openEditShot(log.id); };
                container.appendChild(row);
            });
        });
    },

    renderDialInSummary: () => {
        const tbody = document.getElementById('dial-in-table-body');
        tbody.innerHTML = '';
        
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
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1rem; opacity:0.5;">Awaiting data...</td></tr>`;
            return;
        }

        rows.forEach((row, i) => {
            const isBest = i === 0;
            const tr = document.createElement('tr');
            tr.style = isBest ? "background: var(--success-bg); font-weight: 600;" : "border-bottom: 1px solid #efefef;";
            tr.innerHTML = `
                <td style="padding:0.75rem 0.5rem; color:var(--primary);">${row.grind}</td>
                <td style="padding:0.75rem 0.5rem;">1:${row.avgRatio.toFixed(1)}</td>
                <td style="padding:0.75rem 0.5rem;">${row.avgTime}s</td>
                <td style="padding:0.75rem 0.5rem; opacity:0.6;">${row.count}x</td>
            `;
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
        statsContent.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <div style="font-size:1.5rem; font-weight:800; color:var(--primary); line-height:1;">${total}</div>
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Total Extractions</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.9rem; font-weight:700;">${top.map(t => t[0]).join(', ')}</div>
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Legacy Grinds</div>
                </div>
            </div>
        `;
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
        container.innerHTML = '';
        currentEditingTags.forEach((t, i) => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill active';
            pill.innerHTML = `${t} <span style="margin-left:5px; opacity:0.6;" onclick="app.removeTag(${i})">✕</span>`;
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
        document.getElementById('input-shot-dose').value = '18';
        document.getElementById('input-shot-yield').value = '36';
        document.getElementById('input-shot-grind').value = logsCache[0]?.grind || '';
        
        document.getElementById('btn-delete-shot').classList.add('hidden');
        
        // Butler Preview Reset
        document.getElementById('log-butler-preview').classList.add('hidden');
        document.getElementById('log-butler-preview-text').innerText = "Input data to see extraction advice.";

        app.router('log-shot');
    },

    liveButlerPreview: () => {
        const time = document.getElementById('input-shot-time').value;
        const dose = document.getElementById('input-shot-dose').value;
        const yieldVal = document.getElementById('input-shot-yield').value;
        const previewEl = document.getElementById('log-butler-preview');
        const previewText = document.getElementById('log-butler-preview-text');

        if(time && dose && yieldVal) {
            const mockShot = { time, dose, yield: yieldVal };
            const advice = getAIAdvice(mockShot, userProfile.machineName);
            previewText.innerText = `Butler predicts: ${advice.text}`;
            previewEl.classList.remove('hidden');
            previewEl.style.backgroundColor = advice.status === 'good' ? 'var(--success-bg)' : 'var(--warning-bg)';
            previewEl.style.color = advice.status === 'good' ? 'var(--success-text)' : 'var(--warning-text)';
        } else {
            previewEl.classList.add('hidden');
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
            // v10 style
            const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                userProfile = snap.data();
            } else {
                userProfile = { machineName: 'Lelit Elizabeth', infusion: 3, bloom: 7, aiEnabled: true };
                const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                await setDoc(docRef, userProfile);
            }
        } catch(e) { console.error("Profile fetch error:", e); }
    },

    updateSettingsDisplay: () => {
        const infusion = parseInt(document.getElementById('profile-infusion').value) || 0;
        const bloom = parseInt(document.getElementById('profile-bloom').value) || 0;
        document.getElementById('profile-offset-display').innerText = infusion + bloom;
    },

    openSettings: () => {
        haptic('light');
        document.getElementById('profile-machine-name').value = userProfile.machineName || '';
        document.getElementById('profile-infusion').value = userProfile.infusion || 0;
        document.getElementById('profile-bloom').value = userProfile.bloom || 0;
        document.getElementById('profile-ai-enabled').checked = userProfile.aiEnabled !== false;
        
        const offset = (parseInt(userProfile.infusion)||0) + (parseInt(userProfile.bloom)||0);
        document.getElementById('profile-offset-display').innerText = offset;

        app.router('settings');
    },

    saveProfile: async () => {
        haptic('medium');
        const name = document.getElementById('profile-machine-name').value;
        const infusion = parseInt(document.getElementById('profile-infusion').value) || 0;
        const bloom = parseInt(document.getElementById('profile-bloom').value) || 0;
        const aiEnabled = document.getElementById('profile-ai-enabled').checked;

        userProfile = { machineName: name, infusion, bloom, aiEnabled };
        
        try {
            const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await setDoc(doc(db, "user_profiles", currentUser.uid), userProfile);
            app.renderDailyTip();
            app.router('list');
        } catch(e) { alert(e.message); }
    },

    getGeminiAnalysis: async (shot, bean) => {
        const butlerText = document.getElementById('butler-detail-text');
        const cacheKey = `${shot.id}_${shot.yield}`;
        if(aiCache[cacheKey]) {
            butlerText.innerHTML = `🤵🏻‍♂️ <i>${aiCache[cacheKey]}</i>`;
            return;
        }

        butlerText.innerHTML = "🤵🏻‍♂️ <i>Butler is analyzing the flavor profile...</i>";
        
        try {
            const prompt = `You are an expert Barista. Analyze this espresso shot:
            Bean: ${bean.name} (${bean.roastLevel} roast from ${bean.origin})
            Shot: ${shot.dose}g in, ${shot.yield}g out in ${shot.time}s.
            Machine Settings: ${userProfile.machineName} with ${userProfile.infusion}s infusion and ${userProfile.bloom}s rest.
            
            Give a 1-sentence scientific explanation of the flavor (e.g. over-extracted, bright acidity) and one specific suggestion for improvement. Keep it concise.`;

            const res = await fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Shot quality identified.";
            aiCache[cacheKey] = text.trim();
            butlerText.innerHTML = `🤵🏻‍♂️ <i>${aiCache[cacheKey]}</i>`;
        } catch(e) { 
            console.error("AI Analysis error:", e);
        }
    },

    renderAnalytics: async () => {
        haptic('light');
        app.router('analytics');

        const q = query(collection(db, "brew_logs"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const allLogs = [];
        snap.forEach(d => allLogs.push(d.data()));

        if (allLogs.length === 0) return;

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
        const insightEl = document.getElementById('analytics-insight-text');
        const avgYield = allLogs.reduce((acc, l) => acc + (parseFloat(l.yield) || 0), 0) / allLogs.length;
        const topGrind = distLabels[distValues.indexOf(Math.max(...distValues))];
        
        let insight = `Your most consistent grind is **${topGrind}**. `;
        if (trendData.length > 5) {
            const firstHalf = trendData.slice(0, Math.floor(trendData.length/2));
            const secondHalf = trendData.slice(Math.floor(trendData.length/2));
            const avg1 = firstHalf.reduce((a,b) => a + parseFloat(b.grind), 0) / firstHalf.length;
            const avg2 = secondHalf.reduce((a,b) => a + parseFloat(b.grind), 0) / secondHalf.length;
            
            if (avg2 > avg1 + 0.5) insight += "You've been grinding **coarser** recently—likely enjoying darker roasts.";
            else if (avg2 < avg1 - 0.5) insight += "You've been grinding **finer** recently—hitting those high-extraction light roasts.";
            else insight += "You have incredible grind stability across roasters.";
        }
        insightEl.innerHTML = insight;
    }
};

// Bind to window for HTML access
window.app = app;

// --- LISTENERS ---
onAuthStateChanged(auth, u => {
    if(u) {
        currentUser = u;
        app.fetchProfile().then(() => {
            app.fetchBeans();
            const hash = window.location.hash.substring(1);
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
