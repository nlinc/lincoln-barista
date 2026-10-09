import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { beanNormalizationPatch } from '../public/js/bean-record.js';
import { shotNormalizationPatch } from '../public/js/shot-record.js';
import { validateShot } from '../public/js/shot-analytics.js';

const [input, destination] = process.argv.slice(2);
if (!input || !destination) throw new Error('Usage: node scripts/audit-data.mjs <Firestore snapshot.json> <private output directory>');
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
if (!snapshot.uid || !snapshot.project) throw new Error('A project and owner-scoped snapshot are required.');

const decode = value => {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return new Date(value.timestampValue);
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, decode(field)]));
    throw new Error('Unsupported Firestore value type.');
};

const encode = value => {
    if (value === null) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, field]) => [key, encode(field)])) } };
};

const collections = Object.fromEntries(['beans', 'brew_logs', 'maintenance_records'].map(collection => [collection,
    (snapshot.collections[collection] || []).filter(row => row.document).map(({ document }) => {
        const prefix = `projects/${snapshot.project}/databases/(default)/documents/${collection}/`;
        if (!document.name?.startsWith(prefix) || document.name.slice(prefix.length).includes('/')) throw new Error('Snapshot document path does not match its project and collection.');
        const fields = Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)]));
        if (fields.uid !== snapshot.uid) throw new Error('Snapshot contains a record from another owner.');
        return { document, data: { ...fields, id: document.name.split('/').pop() } };
    })
]));

const writes = [];
const changes = [];
const findings = [];
const addPatch = (collection, record, fields, remove = []) => {
    const keys = [...new Set([...Object.keys(fields), ...remove])];
    if (!keys.length) return;
    if (!record.document.updateTime) throw new Error('Record is missing its concurrency precondition.');
    writes.push({ update: { name: record.document.name, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])) }, updateMask: { fieldPaths: keys }, currentDocument: { updateTime: record.document.updateTime } });
    changes.push({ collection, id: record.data.id, fields: Object.keys(fields), remove });
};

const beanIds = new Set(collections.beans.map(record => record.data.id));
const coffeeKeys = new Map();
for (const record of collections.beans) {
    const bean = record.data;
    const patch = beanNormalizationPatch(bean);
    patch.issues.forEach(message => findings.push({ collection: 'beans', id: bean.id, message }));
    addPatch('beans', record, patch.fields, patch.remove);
    const key = `${String(bean.roaster || '').trim().toLocaleLowerCase()}\0${String(bean.name || '').trim().toLocaleLowerCase()}`;
    coffeeKeys.set(key, [...(coffeeKeys.get(key) || []), bean.id]);
}

for (const record of collections.brew_logs) {
    const shot = record.data;
    const patch = shotNormalizationPatch(shot);
    patch.issues.forEach(message => findings.push({ collection: 'brew_logs', id: shot.id, message }));
    if (!beanIds.has(shot.beanId)) findings.push({ collection: 'brew_logs', id: shot.id, message: 'Shot references a missing bean.' });
    const validation = validateShot(shot);
    if (!validation.valid) findings.push({ collection: 'brew_logs', id: shot.id, message: validation.errors.join(' ') });
    addPatch('brew_logs', record, patch.fields, patch.remove);
}

for (const record of collections.maintenance_records) {
    if (!record.data.machineId) addPatch('maintenance_records', record, { machineId: 'elizabeth' });
    else if (!['elizabeth', 'bianca'].includes(record.data.machineId)) findings.push({ collection: 'maintenance_records', id: record.data.id, message: 'Unknown maintenance machine label.' });
}

const summary = {
    source: { project: snapshot.project, owner: snapshot.uid, snapshot: resolve(input), readTime: snapshot.collections.beans?.at(-1)?.readTime },
    counts: Object.fromEntries(Object.entries(collections).map(([key, rows]) => [key, rows.length])),
    legacyRatings: collections.beans.filter(({ data }) => Object.hasOwn(data, 'rating')).length,
    legacyShotRatings: collections.brew_logs.filter(({ data }) => Object.hasOwn(data, 'rating')).length,
    duplicateCoffeeGroups: [...coffeeKeys.values()].filter(ids => ids.length > 1),
    note: 'Coffee-name matches are review candidates, never automatic bag merges. No measured shot values, IDs, photos, or recorded timestamps are changed.',
    changes: { beans: changes.filter(change => change.collection === 'beans').length, shots: changes.filter(change => change.collection === 'brew_logs').length, care: changes.filter(change => change.collection === 'maintenance_records').length },
    findings,
    patches: changes
};
mkdirSync(destination, { recursive: true });
writeFileSync(join(destination, 'audit-report.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
writeFileSync(join(destination, 'cleanup-plan.json'), JSON.stringify({ project: snapshot.project, uid: snapshot.uid, source: resolve(input), writes }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ counts: summary.counts, changes: summary.changes, legacyRatings: summary.legacyRatings, duplicateCoffeeGroups: summary.duplicateCoffeeGroups, findings: summary.findings, report: resolve(destination, 'audit-report.json') }, null, 2));
