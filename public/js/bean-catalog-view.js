import { el } from "./dom.js?v=1.17.0";

import { cleanBeanText, normalizeBeanTags, recordTime } from "./bean-record.js?v=1.17.0";

export const cleanCatalogText = cleanBeanText;
const catalogKey = (value) => cleanCatalogText(value).toLocaleLowerCase();
const beanKey = (bean) => `${catalogKey(bean.roaster)}\u0000${catalogKey(bean.name)}`;
const beanTime = (bean) => recordTime(bean.updatedAt) || recordTime(bean.createdAt);

export const catalogEntries = (beans) => {
    const seen = new Set();
    return [...beans].sort((a, b) => beanTime(b) - beanTime(a)).filter(bean => {
        if (!catalogKey(bean.name)) return false;
        const key = beanKey(bean);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const catalogSuggestions = (beans, field) => {
    const seen = new Set();
    return [...beans].sort((a, b) => beanTime(b) - beanTime(a)).map(bean => cleanCatalogText(bean[field])).filter(value => {
        const key = catalogKey(value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => a.localeCompare(b));
};

export const findActiveCatalogMatch = (beans, roaster, name) => {
    const key = beanKey({ roaster, name });
    return catalogKey(name) ? beans.find(bean => bean.archived !== true && beanKey(bean) === key) || null : null;
};

export const reusableBeanDetails = (bean) => ({
    name: cleanCatalogText(bean.name),
    roaster: cleanCatalogText(bean.roaster),
    roasterLocation: cleanCatalogText(bean.roasterLocation),
    origin: cleanCatalogText(bean.origin),
    roastLevel: bean.roastLevel || "Medium",
    tenBeanWeight: bean.tenBeanWeight || "",
    tags: normalizeBeanTags(bean.tags)
});

const replaceOptions = (id, values) => {
    document.getElementById(id).replaceChildren(...values.map(value => {
        const option = document.createElement("option");
        option.value = value;
        return option;
    }));
};

export const renderBeanCatalog = (beans) => {
    replaceOptions("roaster-suggestions", catalogSuggestions(beans, "roaster"));
    replaceOptions("roaster-location-suggestions", catalogSuggestions(beans, "roasterLocation"));
    const select = document.getElementById("input-repeat-bean");
    select.replaceChildren(el("option", "", "Choose a past coffee…"), ...catalogEntries(beans).map(bean => {
        const option = el("option", "", [bean.roaster, bean.name].map(cleanCatalogText).filter(Boolean).join(" · "));
        option.value = bean.id;
        return option;
    }));
    select.firstElementChild.value = "";
    select.value = "";
    document.getElementById("bean-repeat").hidden = Boolean(document.getElementById("input-bean-id").value) || select.options.length < 2;
};

export const renderBeanMatchHint = (beans, roaster, name, editingId) => {
    const hint = document.getElementById("bean-match-hint");
    const match = findActiveCatalogMatch(beans, roaster, name);
    hint.textContent = match && match.id !== editingId
        ? "This coffee is already in your collection. Edit that profile to keep one history, or save a new profile for a separate bag."
        : "";
    hint.hidden = !hint.textContent;
};
