import { diagnoseBiancaShot } from "./bianca-tuning.js?v=1.9.4";
import { getBrewAdvice } from "./brew-advice.js?v=1.9.4";
import { el, renderEmptyAction } from "./dom.js?v=1.9.4";
import { diagnoseElizabethShot } from "./elizabeth-tuning.js?v=1.9.4";
import { validateShot } from "./shot-analytics.js?v=1.9.4";

const ratioFor = (shot) => {
    const dose = parseFloat(shot?.dose);
    const yieldValue = parseFloat(shot?.yield);
    return dose && Number.isFinite(yieldValue) ? yieldValue / dose : null;
};

export const chooseCurrentRecipe = (logs, roastLevel) => {
    if (!logs.length) return null;
    const latestGood = logs.find(log => getBrewAdvice(log, roastLevel).status === "good" && (!log.taste || log.taste === "balanced"));
    return { shot: latestGood || logs[0], status: latestGood ? "Dialed" : "Resume" };
};

export const summarizeDialIn = (logs) => {
    const grouped = {};
    logs.forEach(log => {
        if (!validateShot(log).valid) return;
        const grind = log.grind;
        if (!grouped[grind]) grouped[grind] = { ratioSum: 0, timeSum: 0, ratioCount: 0, timeCount: 0, count: 0 };
        const ratio = parseFloat(log.yield) / parseFloat(log.dose);
        if (Number.isFinite(ratio)) { grouped[grind].ratioSum += ratio; grouped[grind].ratioCount++; }
        if (Number.isFinite(parseFloat(log.time))) { grouped[grind].timeSum += parseFloat(log.time); grouped[grind].timeCount++; }
        grouped[grind].count++;
    });
    return Object.keys(grouped).map(grind => ({
        grind,
        avgRatio: grouped[grind].ratioCount ? grouped[grind].ratioSum / grouped[grind].ratioCount : 0,
        avgTime: grouped[grind].timeCount ? Math.round(grouped[grind].timeSum / grouped[grind].timeCount) : 0,
        count: grouped[grind].count
    })).sort((a, b) => Math.abs(a.avgRatio - 2) - Math.abs(b.avgRatio - 2));
};

export const renderBeanIdentity = (bean) => {
    const image = document.getElementById("detail-image");
    const source = bean?.imageUrl || bean?.image;
    if (source) { image.src = source; image.classList.remove("hidden"); }
    else image.classList.add("hidden");
    document.getElementById("detail-roaster").textContent = bean.roaster;
    document.getElementById("detail-name").textContent = bean.name;
    document.getElementById("detail-rating").textContent = "★".repeat(bean.rating || 0);
    document.getElementById("detail-date").textContent = bean.currentRoastDate || "Unknown";
};

export const renderBeanAge = (roastDate) => {
    const age = document.getElementById("detail-age");
    const warning = document.getElementById("stale-warning-container");
    if (!roastDate || roastDate === "Unknown") {
        age.textContent = "";
        warning.classList.add("hidden");
        return;
    }
    const days = Math.floor((new Date() - new Date(roastDate)) / 86400000);
    const message = days >= 7 && days <= 21 ? "✨ Peak Flavor Window" : days < 7 ? "⏳ Resting..." : "🫘 Aging";
    age.textContent = `${days} days since roast • ${message}`;
    if (days > 30) {
        warning.textContent = "This batch is over 30 days off roast. Expect faster flow and be ready to adjust.";
        warning.className = "status-strip batch-warning";
    } else warning.classList.add("hidden");
};

export const renderCurrentRecipe = (recipe) => {
    const consoleElement = document.getElementById("dial-in-console");
    if (!recipe?.shot) { consoleElement.classList.add("hidden"); return; }
    const shot = recipe.shot;
    document.getElementById("recipe-status").textContent = recipe.status;
    document.getElementById("recipe-status").className = "console-status status-" + recipe.status.toLowerCase();
    document.getElementById("recipe-grind").textContent = shot.grind || "--";
    document.getElementById("recipe-dose").textContent = shot.dose ? shot.dose + "g" : "--";
    document.getElementById("recipe-yield").textContent = shot.yield ? shot.yield + "g" : "--";
    document.getElementById("recipe-time").textContent = shot.time ? shot.time + "s" : "--";
    consoleElement.classList.remove("hidden");
};

export const renderShotHistory = ({ activeProfile, bean, expanded, logs, machineId, onEdit, onLog, onToggle }) => {
    const container = document.getElementById("history-container");
    if (!logs.length) {
        renderEmptyAction(container, "No logs", "Log your first extraction.", "Log Shot", onLog);
        return;
    }
    const groups = {};
    logs.forEach(log => {
        const key = log.roastDate || "Original Batch";
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
    });
    const orderedLogs = Object.keys(groups).sort().reverse().flatMap(batch => groups[batch].map(log => ({ batch, log })));
    const visibleLogs = expanded ? orderedLogs : orderedLogs.slice(0, 8);
    const nodes = [];
    let renderedBatch = null;
    visibleLogs.forEach(({ batch, log }) => {
        if (batch !== renderedBatch) {
            renderedBatch = batch;
            nodes.push(el("div", "field-kicker", "Batch: " + batch));
        }
        const validation = validateShot(log);
        const advice = validation.valid ? getBrewAdvice(log, bean?.roastLevel) : { status: "slow", text: "Incomplete legacy shot data" };
        const observedSymptom = log.channelingObserved ? "channeling" : log.taste;
        const tuningContext = {
            roast: bean?.roastLevel,
            symptom: observedSymptom,
            dose: log.dose,
            yield: log.yield,
            time: log.time,
            pressure: log.pressureObserved,
            machineVersion: activeProfile.machineVersion,
            temperatureUnit: activeProfile.temperatureUnit
        };
        const tuningAdvice = observedSymptom ? (machineId === "bianca" ? diagnoseBiancaShot(tuningContext) : diagnoseElizabethShot(tuningContext)) : null;
        const ratio = ratioFor(log)?.toFixed(1) || "—";
        const row = el("div", "log-row ext-" + advice.status);
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Edit shot at grind ${log.grind}, ${log.time} seconds`);
        const metrics = el("div", "log-row-metrics");
        const time = el("div", "metric-col");
        time.append(el("div", "metric-value", log.time + "s"), el("div", "recipe-label", "Time"));
        const grind = el("div", "metric-col center");
        grind.append(el("div", "metric-value", log.grind), el("div", "recipe-label", "Grind"));
        const ratioColumn = el("div", "metric-col right");
        ratioColumn.append(el("div", "metric-value", "1:" + ratio), el("div", "recipe-label", log.dose + "g -> " + log.yield + "g"));
        metrics.append(time, grind, ratioColumn);
        const adviceText = tuningAdvice?.actions[0] ? advice.text + " • Next: " + tuningAdvice.actions[0] : advice.text;
        row.append(metrics, el("div", "advice-text", adviceText));
        const edit = () => onEdit(log.id);
        row.addEventListener("click", edit);
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); edit(); }
        });
        nodes.push(row);
    });
    if (orderedLogs.length > 8) {
        const more = el("div", "history-more");
        const button = el("button", "btn-secondary small-btn", expanded ? "Show recent shots only" : `Show ${orderedLogs.length - 8} older shots`);
        button.type = "button";
        button.addEventListener("click", onToggle);
        more.appendChild(button);
        nodes.push(more);
    }
    container.replaceChildren(...nodes);
};

export const renderDialInSummary = (logs) => {
    const body = document.getElementById("dial-in-table-body");
    const rows = summarizeDialIn(logs);
    if (!rows.length) {
        const row = document.createElement("tr");
        const cell = el("td", "summary-empty", "Log some shots to see your dial-in metrics.");
        cell.colSpan = 4;
        row.appendChild(cell);
        body.replaceChildren(row);
        return;
    }
    body.replaceChildren(...rows.map((summary, index) => {
        const row = document.createElement("tr");
        if (!index) row.className = "summary-best-row";
        row.append(el("td", "summary-primary", summary.grind), el("td", "", "1:" + summary.avgRatio.toFixed(1)), el("td", "", summary.avgTime + "s"));
        const count = el("td", "", summary.count + "x");
        count.style.opacity = "0.6";
        row.appendChild(count);
        return row;
    }));
};

export const renderGlobalStats = (logs) => {
    const card = document.getElementById("global-stats-card");
    if (!logs.length) { card.classList.add("hidden"); return; }
    const grinds = {};
    logs.forEach(log => { if (log.grind) grinds[log.grind] = (grinds[log.grind] || 0) + 1; });
    const top = Object.entries(grinds).sort((a, b) => b[1] - a[1]).slice(0, 2);
    const total = el("div", "stat-item");
    total.append(el("strong", "", logs.length), el("span", "", "Total Logs"));
    const common = el("div", "stat-item");
    common.append(el("strong", "", top.map(item => item[0]).join(", ") || "None"), el("span", "", "Common Grinds"));
    document.getElementById("global-stats-content").replaceChildren(total, common);
    card.classList.remove("hidden");
};

export const renderMachineBadge = ({ b1, machineId, machineName, machineVersion }) => {
    const context = machineId === "bianca"
        ? `${machineVersion.toUpperCase()} • paddle flow`
        : `${(parseInt(b1?.infusion) || 0) + (parseInt(b1?.bloom) || 0)}s P1 pre-infusion`;
    document.getElementById("machine-badge").textContent = (machineName || "Espresso machine") + " • " + context;
};
