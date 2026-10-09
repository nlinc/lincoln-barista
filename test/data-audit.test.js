import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';

const runAudit = (overrides = {}) => {
    const directory = mkdtempSync(join(tmpdir(), 'barista-audit-'));
    try {
        const input = join(directory, 'snapshot.json');
        const document = { name: 'projects/demo/databases/(default)/documents/beans/bag', updateTime: '2026-10-09T12:00:00Z', fields: { uid: { stringValue: 'owner' }, name: { stringValue: ' Coffee ' }, rating: { integerValue: '4' }, ...overrides.fields }, ...overrides.document };
        writeFileSync(input, JSON.stringify({ project: 'demo', uid: 'owner', collections: { beans: [{ document }], brew_logs: [], maintenance_records: [] } }));
        const result = spawnSync(process.execPath, ['scripts/audit-data.mjs', input, directory], { encoding: 'utf8' });
        return { result, plan: result.status === 0 ? JSON.parse(readFileSync(join(directory, 'cleanup-plan.json'), 'utf8')) : null };
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
};

describe('owner-scoped offline data audit', () => {
    it('creates minimal masked writes with update-time preconditions and preserves retired values', () => {
        const { result, plan } = runAudit();
        assert.equal(result.status, 0);
        assert.equal(plan.writes.length, 1);
        const write = plan.writes[0];
        assert.deepEqual(write.currentDocument, { updateTime: '2026-10-09T12:00:00Z' });
        assert.equal(write.update.fields.name.stringValue, 'Coffee');
        assert.equal(write.update.fields.legacy.mapValue.fields.rating.integerValue, '4');
        assert(write.updateMask.fieldPaths.includes('rating'));
        assert.equal(write.update.fields.rating, undefined);
        assert(!write.updateMask.fieldPaths.includes('uid'));
    });

    it('rejects another owner or a document outside the declared project', () => {
        assert.notEqual(runAudit({ fields: { uid: { stringValue: 'someone-else' } } }).result.status, 0);
        assert.notEqual(runAudit({ document: { name: 'projects/other/databases/(default)/documents/beans/bag' } }).result.status, 0);
    });

    it('rejects writes without a concurrency precondition', () => {
        assert.notEqual(runAudit({ document: { updateTime: undefined } }).result.status, 0);
    });
});
