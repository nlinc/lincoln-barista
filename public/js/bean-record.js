const IMPRESSIONS = new Set(['enjoyed', 'meh', 'not-for-me']);
const ROAST_LEVELS = ['Light', 'Medium', 'Dark', 'Espresso'];
const LEGACY_FIELDS = ['rating', 'roastDate', 'fiveBeanWeight', 'flavor'];

export const cleanBeanText = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export const recordTime = value => {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.seconds === 'number') return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
    if (typeof value === 'string') return Date.parse(value) || 0;
    return 0;
};

export const normalizeRoastDate = value => {
    const text = cleanBeanText(value);
    let parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)?.slice(1).map(Number);
    if (!parts) {
        const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
        if (!legacy) return '';
        const year = Number(legacy[3]);
        parts = [legacy[3].length === 2 ? 2000 + year : year, Number(legacy[1]), Number(legacy[2])];
    }
    const [year, month, day] = parts;
    if (year < 1900 || year > 2199) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const normalizeBeanTags = value => {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).filter(tag => typeof tag === 'string').map(cleanBeanText).filter(tag => {
        const key = tag.toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const resolveBeanImpression = (bean = {}) => {
    if (Object.hasOwn(bean, 'impression')) return IMPRESSIONS.has(bean.impression) ? bean.impression : '';
    const rating = Number(bean.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return '';
    return rating >= 4 ? 'enjoyed' : rating === 3 ? 'meh' : 'not-for-me';
};

const roastLevel = value => ROAST_LEVELS.find(level => level.toLowerCase() === cleanBeanText(value).toLowerCase());

export const normalizeBeanRecord = (value = {}) => ({
    ...value,
    name: cleanBeanText(value.name),
    roaster: cleanBeanText(value.roaster),
    roasterLocation: cleanBeanText(value.roasterLocation),
    origin: cleanBeanText(value.origin),
    roastLevel: roastLevel(value.roastLevel) || 'Medium',
    currentRoastDate: Object.hasOwn(value, 'currentRoastDate') ? normalizeRoastDate(value.currentRoastDate) : normalizeRoastDate(value.roastDate),
    tenBeanWeight: typeof value.tenBeanWeight === 'string' ? value.tenBeanWeight.trim() : '',
    tags: normalizeBeanTags(value.tags),
    impression: resolveBeanImpression(value) || null
});

export const beanNormalizationPatch = (value) => {
    const fields = {};
    const remove = [];
    const issues = [];
    const legacy = { ...value.legacy };
    for (const field of ['name', 'roaster', 'roasterLocation', 'origin']) {
        if (typeof value[field] === 'string' && cleanBeanText(value[field]) !== value[field]) fields[field] = cleanBeanText(value[field]);
    }
    const roast = roastLevel(value.roastLevel);
    if (roast && roast !== value.roastLevel) fields.roastLevel = roast;
    if (Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string')) {
        const tags = normalizeBeanTags(value.tags);
        if (JSON.stringify(tags) !== JSON.stringify(value.tags)) fields.tags = tags;
    }
    const originalDate = Object.hasOwn(value, 'currentRoastDate') ? value.currentRoastDate : value.roastDate;
    const date = normalizeRoastDate(originalDate);
    if (date && date !== value.currentRoastDate) {
        if (Object.hasOwn(value, 'currentRoastDate') && Object.hasOwn(legacy, 'currentRoastDate') && legacy.currentRoastDate !== value.currentRoastDate) {
            issues.push('Conflicting legacy current roast date; retained for review.');
        } else {
            fields.currentRoastDate = date;
            if (Object.hasOwn(value, 'currentRoastDate')) legacy.currentRoastDate = value.currentRoastDate;
        }
    } else if (originalDate && !date && !/^(unknown|n\/a)$/i.test(cleanBeanText(originalDate))) issues.push('Unrecognized roast date; retained for review.');
    for (const field of LEGACY_FIELDS) {
        if (!Object.hasOwn(value, field)) continue;
        if (Object.hasOwn(legacy, field) && JSON.stringify(legacy[field]) !== JSON.stringify(value[field])) {
            issues.push(`Conflicting legacy ${field}; retained for review.`);
            continue;
        }
        legacy[field] = value[field];
        remove.push(field);
    }
    if (Object.hasOwn(value, 'rating') && !Object.hasOwn(value, 'impression')) fields.impression = resolveBeanImpression(value) || null;
    if (JSON.stringify(legacy) !== JSON.stringify(value.legacy || {})) fields.legacy = legacy;
    return { fields, remove, issues };
};
