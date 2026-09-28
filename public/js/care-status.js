import { localDateKey, maintenancePresetsFor, parseDateKey, presetDueDate } from "./machine-config.js?v=1.11.0";

const createdTime = (record) => {
    const value = record.createdAt;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
    return value instanceof Date ? value.getTime() : 0;
};

export const latestCareRecords = (records) => {
    const latest = new Map();
    records.forEach(record => {
        const previous = latest.get(record.type);
        if (!previous || record.completedDate > previous.completedDate ||
            (record.completedDate === previous.completedDate && createdTime(record) > createdTime(previous))) {
            latest.set(record.type, record);
        }
    });
    return latest;
};

export const careChecklist = (machineId, records, today = localDateKey()) => {
    const latest = latestCareRecords(records);
    return maintenancePresetsFor(machineId).map(preset => {
        const record = latest.get(preset.type);
        const weekly = preset.daysUntilDue === 7;
        const daily = /daily|after every use|after every milk drink/i.test(preset.cadence);
        const nextDueDate = record ? record.nextDueDate || presetDueDate(preset, record.completedDate) : "";
        let state;
        let label;
        if (!record) {
            state = daily || weekly ? "due" : "untracked";
            label = daily ? "Ready today" : "Start tracking";
        } else if (record.completedDate === today) {
            state = "done";
            label = "Done today";
        } else if (daily || nextDueDate && nextDueDate <= today) {
            state = "due";
            label = daily ? "Ready today" : "Due now";
        } else if (nextDueDate) {
            state = "upcoming";
            label = `Due ${parseDateKey(nextDueDate).toLocaleDateString()}`;
        } else {
            state = "tracked";
            label = "Track by water usage";
        }
        return { preset, record, state, label, nextDueDate };
    });
};
