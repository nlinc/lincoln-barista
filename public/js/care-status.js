import { localDateKey, maintenancePresetsFor, parseDateKey, presetDueDate } from "./machine-config.js?v=1.14.0";
import { recordTime } from "./bean-record.js?v=1.14.0";

const createdTime = (record) => {
    return recordTime(record.createdAt);
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

export const homeCareSummary = (machineId, records, today = localDateKey()) => {
    const tasks = careChecklist(machineId, records, today);
    const due = tasks.filter(task => task.state === 'due').sort((a, b) => {
        if (a.nextDueDate && b.nextDueDate) return a.nextDueDate.localeCompare(b.nextDueDate);
        return a.nextDueDate ? -1 : b.nextDueDate ? 1 : 0;
    });
    const untracked = tasks.filter(task => task.state === 'untracked');
    const upcoming = tasks.filter(task => task.state === 'upcoming').sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
    return { due, untracked, visible: [...due, ...untracked].slice(0, 3), next: upcoming[0] || null, done: tasks.filter(task => task.state === 'done').length };
};
