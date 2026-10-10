import { normalizeRoastDate } from "./bean-record.js?v=1.17.0";

export const shotNormalizationPatch = (shot) => {
    const fields = {};
    const remove = [];
    const issues = [];
    const legacy = { ...shot.legacy };
    if (!shot.machineId) fields.machineId = 'elizabeth';
    else if (!['elizabeth', 'bianca'].includes(shot.machineId)) issues.push('Unknown machine label; retained for review.');
    const date = normalizeRoastDate(shot.roastDate);
    if (date && date !== shot.roastDate) {
        if (Object.hasOwn(legacy, 'roastDate') && legacy.roastDate !== shot.roastDate) {
            issues.push('Conflicting legacy roast date; retained for review.');
        } else {
            fields.roastDate = date;
            legacy.roastDate = shot.roastDate;
        }
    } else if (shot.roastDate && !date && !/^(unknown|original batch)$/i.test(shot.roastDate)) issues.push('Unrecognized shot roast date; retained for review.');
    if (Object.hasOwn(shot, 'rating')) {
        if (!Number.isInteger(shot.rating) || shot.rating < 0 || shot.rating > 5 ||
            Object.hasOwn(legacy, 'rating') && legacy.rating !== shot.rating) {
            issues.push('Unrecognized or conflicting legacy shot rating; retained for review.');
        } else {
            legacy.rating = shot.rating;
            remove.push('rating');
        }
    }
    if (JSON.stringify(legacy) !== JSON.stringify(shot.legacy || {})) fields.legacy = legacy;
    return { fields, remove, issues };
};
