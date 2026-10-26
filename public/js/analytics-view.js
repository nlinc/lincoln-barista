import { el } from "./dom.js?v=1.18.5";
import { STARTING_BASKETS } from "./starting-point.js?v=1.18.5";
import { basketFor } from "./brew-setup.js?v=1.18.5";

export const renderAnalyticsFilters = ({ logs, machineId, ownedIds, basketId, roast }) => {
    const picker = document.getElementById('analytics-basket');
    const available = STARTING_BASKETS.filter(basket => (!basket.machineId || basket.machineId === machineId) &&
        (ownedIds.includes(basket.id) || logs.some(log => log.basketId === basket.id)));
    const choices = [{ id: 'all', name: 'All baskets' }, ...available, { id: 'unknown', name: 'Not recorded' }];
    picker.replaceChildren(...choices.map(choice => {
        const option = el('option', '', choice.name);
        option.value = choice.id;
        return option;
    }));
    picker.value = choices.some(choice => choice.id === basketId) ? basketId : 'all';
    document.getElementById('analytics-roast').value = roast;
    return picker.value;
};

export const renderBasketComparison = (rows, machineId, ownedIds, selectedId) => {
    const body = document.getElementById('basket-comparison-body');
    const results = [...rows];
    for (const id of ownedIds) {
        const basket = basketFor(id, machineId);
        if (basket && !results.some(row => row.id === id)) results.push({ id, label: basket.name, count: 0 });
    }
    body.replaceChildren(...results.map(result => {
        const row = el('tr', result.id === selectedId ? 'summary-best-row' : '');
        const label = el('th', '', result.label);
        label.scope = 'row';
        const value = (key, suffix = '') => result.count ? Number(result[key].toFixed(2)) + suffix : '—';
        row.append(label, el('td', '', result.count), el('td', '', value('grind')), el('td', '', value('dose', 'g')),
            el('td', '', value('yield', 'g')), el('td', '', value('time', 's')), el('td', '', result.count ? '1:' + Number(result.ratio.toFixed(2)) : '—'),
            el('td', '', result.count ? `${result.balanced}/${result.count}` : '—'));
        return row;
    }));
};

export const chartOptions = (xTitle, yTitle, { showLegend = false } = {}) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: showLegend, labels: { color: "#cbd5e1", usePointStyle: true } } },
    scales: {
        x: { title: { display: true, text: xTitle, color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { title: { display: true, text: yTitle, color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,0.06)" } }
    }
});

export const renderAnalyticsMetrics = (metrics) => {
    const items = [
        [metrics.shots, "Complete shots"],
        [metrics.dialedPercent + "%", "In target"],
        [metrics.medianRatio ? "1:" + metrics.medianRatio.toFixed(2) : "—", "Median ratio"],
        [metrics.ageSpan ? metrics.ageSpan + "d" : "—", "Age range"]
    ];
    document.getElementById("analytics-metrics").replaceChildren(...items.map(([value, label]) => {
        const card = el("div", "analytics-metric");
        card.append(el("span", "analytics-metric-value", value), el("span", "analytics-metric-label", label));
        return card;
    }));
};

export const renderPatternList = (insights) => {
    document.getElementById("analytics-pattern-list").replaceChildren(...insights.map(insight => {
        const item = el("div", "pattern-item tone-" + insight.tone);
        item.append(el("div", "pattern-title", insight.title), el("div", "pattern-copy", insight.text));
        return item;
    }));
};
