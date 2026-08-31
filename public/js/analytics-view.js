import { el } from "./dom.js?v=1.10.0";

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
