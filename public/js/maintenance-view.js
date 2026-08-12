import { el, renderEmpty } from "./dom.js?v=1.9.4";
import { localDateKey, maintenanceDueState, maintenancePresetsFor, parseDateKey } from "./machine-config.js?v=1.9.4";

export const renderMaintenanceView = ({ machineId, records, onDelete, onQuickAction }) => {
    const list = document.getElementById("maintenance-list");
    const summary = document.getElementById("maintenance-summary");
    const quickActions = document.getElementById("maintenance-quick-actions");
    const latestByType = new Map();
    records.forEach(record => {
        if (!latestByType.has(record.type)) latestByType.set(record.type, record);
    });

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
        const button = el("button", `btn maintenance-quick-button${completedToday ? " is-done" : ""}`, completedToday ? "Done today ✓" : preset.action);
        button.type = "button";
        button.disabled = completedToday;
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
