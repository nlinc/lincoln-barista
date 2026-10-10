import { normalizeBeanRecord, recordTime, resolveBeanImpression } from "./bean-record.js?v=1.15.1";
export { resolveBeanImpression } from "./bean-record.js?v=1.15.1";

import { el, renderEmptyAction } from "./dom.js?v=1.15.1";

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
    const recentTime = bean => recordTime(bean.archived === true ? bean.archivedAt : null) || recordTime(bean.createdAt);
    return recentTime(b) - recentTime(a);
});

export const selectVisibleBeans = (beans, activeFilters = new Set(), currentSort = "newest") => {
    return sortBeans(filterBeans(beans.map(normalizeBeanRecord), activeFilters), currentSort);
};

export const collectionPreview = (beans, activeFilters, currentSort, expanded = false) => {
    const matching = selectVisibleBeans(beans, activeFilters, currentSort);
    return { beans: expanded ? matching : matching.slice(0, 3), total: matching.length };
};

export const beansForScope = (beans, scope = 'current') => beans.filter(bean => (bean.archived === true) === (scope === 'finished'));

export const swipeAction = (deltaX, deltaY) => {
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return null;
    return deltaX < 0 ? 'open' : 'close';
};

export const renderBeanCollection = ({ beans, activeFilters, currentSort, expanded = false, scope = 'current', pending = new Set(), notice, onUndo, onAdd, onShowFinished, onOpen, onEdit, onFinish, onRestore, onReuse }) => {
    const container = document.getElementById("bean-list-container");
    if (!container) return;
    const preview = collectionPreview(beansForScope(beans, scope), activeFilters, currentSort, expanded);
    const visibleBeans = preview.beans;
    const toggle = document.getElementById("btn-toggle-beans");
    toggle.hidden = preview.total <= 3;
    toggle.textContent = expanded ? "Show fewer beans" : `Show all ${preview.total} beans`;
    toggle.setAttribute("aria-expanded", String(expanded));
    document.getElementById("collection-count").textContent = preview.total > 1 ? `${visibleBeans.length} of ${preview.total}` : "";
    document.getElementById('input-sort-beans').hidden = preview.total <= 1;
    container.classList.toggle("collection-preview", !expanded);
    if (document.body.dataset.view === 'list') document.getElementById('fab-add-bean').classList.remove('hidden');
    for (const value of ['current', 'finished']) {
        const button = document.getElementById(`btn-${value}-beans`);
        button.textContent = `${value === 'current' ? 'Current' : 'Finished'} (${beansForScope(beans, value).length})`;
        button.setAttribute('aria-pressed', String(scope === value));
        button.classList.toggle('active', scope === value);
    }
    document.getElementById('collection-help').textContent = scope === 'finished'
        ? 'Your shot history stays here. New bag copies the coffee details for next time.'
        : 'Swipe left or tap ⋯ for bag actions.';
    const feedback = document.getElementById('collection-feedback');
    feedback.hidden = !notice;
    feedback.replaceChildren();
    if (notice) {
        feedback.append(el('span', '', notice.text));
        if (notice.undoId) {
            const undo = el('button', 'btn-secondary small-btn', 'Undo');
            undo.type = 'button';
            undo.disabled = pending.has(notice.undoId);
            undo.addEventListener('click', () => onUndo(notice.undoId));
            feedback.append(undo);
        }
    }

    if (!visibleBeans.length) {
        const hasCurrent = beansForScope(beans).length > 0;
        const hasFinished = beansForScope(beans, 'finished').length > 0;
        if (scope === 'finished') {
            renderEmptyAction(container, 'No finished bags yet', 'Finish a bag when you’re done. Its coffee details and shots stay here.');
        } else if (!hasCurrent && hasFinished) {
            renderEmptyAction(container, 'No current bags', 'Your finished coffees and shot history are saved. Choose a coffee to start a new bag.', 'Choose a past coffee', onShowFinished);
        } else {
            renderEmptyAction(container, hasCurrent ? 'No coffee found' : 'No current bags', hasCurrent ? 'Try another filter or add a bag.' : 'Add a bag to start logging shots.', 'Add Bean', onAdd);
        }
        return;
    }

    let closeOpenTile;
    container.replaceChildren(...visibleBeans.map(bean => {
        const tile = el('div', 'bean-tile');
        tile.dataset.beanId = bean.id;
        const card = el("div", "bean-card");
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `Open ${bean.name || "untitled bean"} from ${bean.roaster || "unknown roaster"}`);
        card.setAttribute('aria-busy', String(pending.has(bean.id)));
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

        const actions = el('div', 'bean-quick-actions');
        actions.id = `bag-actions-${bean.id}`;
        actions.hidden = true;
        const more = el('button', 'bean-actions-toggle', pending.has(bean.id) ? '…' : '⋯');
        more.type = 'button';
        more.setAttribute('aria-label', `Actions for ${bean.name || 'this bag'}`);
        more.setAttribute('aria-expanded', 'false');
        more.setAttribute('aria-controls', actions.id);
        more.disabled = pending.has(bean.id);
        const setOpen = (open) => {
            if (!open && actions.hidden) return;
            if (open && closeOpenTile) closeOpenTile();
            actions.hidden = !open;
            more.setAttribute('aria-expanded', String(open));
            tile.classList.toggle('actions-open', open);
            closeOpenTile = open ? () => setOpen(false) : null;
            if (document.body.dataset.view === 'list') document.getElementById('fab-add-bean').classList.toggle('hidden', open);
        };
        more.addEventListener('click', () => setOpen(actions.hidden));
        const buttons = bean.archived === true
            ? [['New bag', onReuse], ['Put back', onRestore]]
            : [['Edit', onEdit], ['Finish bag', onFinish]];
        buttons.forEach(([label, action]) => {
            const button = el('button', 'btn-secondary small-btn', label);
            button.type = 'button';
            button.disabled = pending.has(bean.id);
            button.setAttribute('aria-label', `${label}: ${bean.name || 'this bag'}`);
            button.addEventListener('click', () => { setOpen(false); action(bean.id); });
            actions.append(button);
        });
        let gesture;
        let suppressClickUntil = 0;
        card.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0 || pending.has(bean.id)) return;
            gesture = { x: event.clientX, y: event.clientY };
            if (event.isTrusted) card.setPointerCapture(event.pointerId);
        });
        card.addEventListener('pointerup', event => {
            if (!gesture) return;
            const action = swipeAction(event.clientX - gesture.x, event.clientY - gesture.y);
            gesture = null;
            if (!action) return;
            suppressClickUntil = performance.now() + 400;
            setOpen(action === 'open');
        });
        card.addEventListener('pointercancel', () => { gesture = null; });
        const open = () => {
            if (performance.now() < suppressClickUntil || pending.has(bean.id)) return;
            if (closeOpenTile) closeOpenTile();
            onOpen(bean.id);
        };
        card.addEventListener("click", open);
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
            }
        });
        tile.addEventListener('keydown', event => {
            if (event.key === 'Escape') { setOpen(false); more.focus(); }
        });
        tile.append(card, more, actions);
        return tile;
    }));
};
