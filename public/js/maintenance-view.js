import { el, renderEmpty } from "./dom.js?v=1.17.0";
import { localDateKey, maintenanceDueState, maintenancePresetsFor, parseDateKey } from "./machine-config.js?v=1.17.0";
import { careChecklist, homeCareSummary, latestCareRecords } from "./care-status.js?v=1.17.0";

export const renderCareHome = ({ machineId, records, loaded, error, compact = false, pending = new Set(), onQuickAction, onOpen }) => {
    const card = document.getElementById("care-home-card");
    const summary = document.getElementById("care-home-summary");
    const list = document.getElementById("care-home-list");
    const next = document.getElementById("care-home-next");
    if (!card) return;
    const details = document.getElementById('care-home-details');
    const mode = compact ? 'compact' : 'full';
    if (details.dataset.mode !== mode) {
        details.open = !compact;
        details.dataset.mode = mode;
    }
    document.getElementById("care-home-machine").textContent = machineId === 'bianca' ? 'Bianca' : 'Elizabeth';
    next.textContent = '';
    card.classList.toggle("hidden", !machineId);
    const open = document.getElementById("care-home-open");
    if (open) {
        open.textContent = error ? "Retry care sync" : "All care →";
        open.onclick = onOpen;
    }
    if (error) {
        summary.textContent = "Care history could not sync.";
        list.replaceChildren();
        return;
    }
    if (!loaded) {
        summary.textContent = "Checking your care history…";
        list.replaceChildren();
        return;
    }
    const { due, untracked, done, visible, next: upcoming } = homeCareSummary(machineId, records);
    summary.textContent = [
        due.length ? `${due.length} to do` : "Daily and scheduled care caught up",
        untracked.length ? `${untracked.length} to start tracking` : "",
        `${done} done today`
    ].filter(Boolean).join(" · ");
    if (upcoming) next.textContent = `Next scheduled: ${upcoming.preset.title} · ${upcoming.label}`;
    list.replaceChildren(...visible.map(({ preset, label }) => {
        const row = el("div", "care-home-row");
        const copy = el("div", "care-home-copy");
        copy.append(el("strong", "", preset.title), el("span", "", `${preset.cadence} · ${label}`));
        const button = el("button", "btn-secondary small-btn care-home-button", "Mark done");
        button.type = "button";
        button.setAttribute("aria-label", `Mark ${preset.title} done`);
        button.disabled = pending.has(preset.type);
        if (button.disabled) button.textContent = "Logging…";
        button.addEventListener("click", () => onQuickAction(preset, button));
        row.append(copy, button);
        return row;
    }));
    if (due.length + untracked.length > visible.length) {
        list.append(el("p", "care-home-empty", `See all ${due.length + untracked.length} care tasks in Machine care.`));
    } else if (!visible.length) {
        const note = el("p", "care-home-empty", "Your daily and weekly care is up to date.");
        list.append(note);
    }
};

export const renderMaintenanceView = ({ machineId, records, pending = new Set(), onDelete, onQuickAction }) => {
    const list = document.getElementById("maintenance-list");
    const summary = document.getElementById("maintenance-summary");
    const quickActions = document.getElementById("maintenance-quick-actions");
    const latestByType = latestCareRecords(records);
    const checklist = new Map(careChecklist(machineId, records).map(item => [item.preset.type, item]));

    const activeReminders = [...latestByType.values()].filter(record => record.nextDueDate);
    const overdue = activeReminders.filter(record => maintenanceDueState(record.nextDueDate).tone === "overdue").length;
    const dueSoon = activeReminders.filter(record => maintenanceDueState(record.nextDueDate).tone === "due").length;
    const newest = records[0];
    const summaryItems = [
        [records.length, "Services logged"],
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
    quickActions.replaceChildren(...maintenancePresetsFor(machineId).map(preset => {
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
        const care = checklist.get(preset.type);
        if (care && care.state !== "done") copy.appendChild(el("div", `maintenance-quick-state care-${care.state}`, care.label));
        const saving = pending.has(preset.type);
        const button = el("button", `btn maintenance-quick-button${completedToday ? " is-done" : ""}`, saving ? "Logging…" : completedToday ? "Done today ✓" : preset.action);
        button.type = "button";
        button.disabled = completedToday || saving;
        button.addEventListener("click", () => onQuickAction(preset, button));
        card.append(icon, copy, button);
        return card;
    }));

    if (!records.length) {
        renderEmpty(list, "Nothing logged yet. Tap a button above when you finish a task.");
        return;
    }

    list.replaceChildren(...records.map(record => {
        const isLatest = latestByType.get(record.type)?.id === record.id;
        const state = isLatest ? maintenanceDueState(record.nextDueDate) : { tone: "none", label: "Past record" };
        const row = el("article", `maintenance-row maintenance-${state.tone}`);
        const heading = el("div", "maintenance-row-heading");
        heading.append(el("div", "maintenance-row-title", record.type), el("span", `maintenance-badge maintenance-badge-${state.tone}`, state.label));
        row.append(heading, el("div", "maintenance-date", `Completed ${parseDateKey(record.completedDate).toLocaleDateString()}`));
        if (record.notes) row.appendChild(el("div", "maintenance-notes", record.notes));
        const remove = el("button", "btn-secondary small-btn maintenance-delete", "Delete");
        remove.type = "button";
        remove.setAttribute("aria-label", `Delete ${record.type} record from ${record.completedDate}`);
        remove.addEventListener("click", () => onDelete(record.id));
        row.appendChild(remove);
        return row;
    }));
};
