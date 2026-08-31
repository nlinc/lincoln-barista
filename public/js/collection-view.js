import { el, renderEmptyAction } from "./dom.js?v=1.10.0";

const roastColor = (level = "Medium") => ({
    Light: "#f59e0b",
    Medium: "#d97706",
    Dark: "#78350f",
    Espresso: "#1c1917"
}[level] || "#d97706");

const roastGlow = (level = "Medium") => ({
    Light: "rgba(245, 158, 11, 0.15)",
    Medium: "rgba(217, 119, 6, 0.15)",
    Dark: "rgba(120, 53, 15, 0.15)"
}[level] || "rgba(217, 119, 6, 0.15)");

const imageSource = (bean) => bean?.imageUrl || bean?.image || null;

const IMPRESSION_META = {
    enjoyed: { label: "😊 Enjoyed", rank: 3 },
    meh: { label: "😐 Meh", rank: 2 },
    "not-for-me": { label: "🙅 Not for me", rank: 1 }
};

export const resolveBeanImpression = (bean = {}) => {
    if (IMPRESSION_META[bean.impression]) return bean.impression;
    const legacyRating = Number(bean.rating) || 0;
    if (legacyRating >= 4) return "enjoyed";
    if (legacyRating === 3) return "meh";
    if (legacyRating > 0) return "not-for-me";
    return "";
};

export const beanImpressionLabel = (bean = {}) => IMPRESSION_META[resolveBeanImpression(bean)]?.label || "";

const filterBeans = (beans, activeFilters) => beans.filter(bean => {
    if (activeFilters.size === 0) return true;
    const searchable = [bean.roastLevel, bean.origin, bean.roaster, beanImpressionLabel(bean), ...(bean.tags || [])]
        .map(value => (value || "").toLowerCase());
    return [...activeFilters].every(filter => searchable.includes(filter.toLowerCase()));
});

const sortBeans = (beans, currentSort) => beans.sort((a, b) => {
    if (currentSort === "name") return (a.name || "").localeCompare(b.name || "");
    if (currentSort === "impression") {
        return (IMPRESSION_META[resolveBeanImpression(b)]?.rank || 0) - (IMPRESSION_META[resolveBeanImpression(a)]?.rank || 0);
    }
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
});

export const selectVisibleBeans = (beans, activeFilters = new Set(), currentSort = "newest") => {
    return sortBeans(filterBeans(beans, activeFilters), currentSort);
};

export const renderBeanCollection = ({ beans, activeFilters, currentSort, onAdd, onOpen }) => {
    const container = document.getElementById("bean-list-container");
    if (!container) return;
    const visibleBeans = selectVisibleBeans(beans, activeFilters, currentSort);

    if (!visibleBeans.length) {
        renderEmptyAction(container, "No coffee found", "Start a new profile.", "Add Bean", onAdd);
        return;
    }

    container.replaceChildren(...visibleBeans.map(bean => {
        const card = el("div", "bean-card");
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Open ${bean.name || "untitled bean"} from ${bean.roaster || "unknown roaster"}`);
        card.style.setProperty("--roast-color", roastColor(bean.roastLevel));
        card.style.setProperty("--roast-glow", roastGlow(bean.roastLevel));
        card.appendChild(el("div", "roast-bar"));

        const source = imageSource(bean);
        const thumb = source ? el("img", "bean-card-thumb") : el("div", "bean-card-thumb thumb-placeholder", "☕");
        if (source) {
            thumb.src = source;
            thumb.alt = "";
            thumb.loading = "lazy";
            thumb.decoding = "async";
        }
        card.appendChild(thumb);

        const body = el("div", "bean-card-body");
        body.append(el("div", "roaster-name", bean.roaster || "Unknown roaster"));
        body.append(el("div", "bean-card-name", bean.name || "Untitled"));
        const impression = resolveBeanImpression(bean);
        if (impression) body.append(el("div", `bean-impression impression-${impression}`, beanImpressionLabel(bean)));
        const tags = el("div", "bean-card-tags");
        (bean.tags || []).slice(0, 2).forEach(tag => tags.appendChild(el("span", "tag-pill", "#" + tag)));
        body.appendChild(tags);
        card.appendChild(body);

        const open = () => onOpen(bean.id);
        card.addEventListener("click", open);
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
        return card;
    }));
};
