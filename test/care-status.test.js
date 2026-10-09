import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { careChecklist, homeCareSummary, latestCareRecords } from "../public/js/care-status.js";

describe("machine care checklist", () => {
    it("uses the newest same-day record even when fetch order is arbitrary", () => {
        const older = { type: "Machine clean", completedDate: "2026-09-21", nextDueDate: "2026-09-25", createdAt: { seconds: 10 } };
        const newer = { type: "Machine clean", completedDate: "2026-09-21", nextDueDate: "2026-09-30", createdAt: { seconds: 20 } };
        assert.equal(latestCareRecords([older, newer]).get("Machine clean"), newer);
        assert.equal(careChecklist("elizabeth", [older, newer], "2026-09-28").find(item => item.preset.type === "Machine clean").state, "upcoming");
    });

    it("separates never-logged scheduled work from due cleaning and respects saved due dates", () => {
        const fresh = careChecklist("elizabeth", [], "2026-09-28");
        assert.equal(fresh.find(item => item.preset.type === "Steam wand clean").state, "due");
        assert.equal(fresh.find(item => item.preset.type === "Backflush").state, "untracked");
        const records = [{ type: "Backflush", completedDate: "2026-09-01", nextDueDate: "2026-10-15" }];
        assert.equal(careChecklist("elizabeth", records, "2026-09-28").find(item => item.preset.type === "Backflush").state, "upcoming");
    });

    it("marks completed daily care done only on the local date key", () => {
        const records = [{ type: "Daily group and tray care", completedDate: "2026-09-28" }];
        assert.equal(careChecklist("bianca", records, "2026-09-28").find(item => item.preset.type === "Daily group and tray care").state, "done");
        assert.equal(careChecklist("bianca", records, "2026-09-29").find(item => item.preset.type === "Daily group and tray care").state, "due");
    });

    it('prioritizes overdue scheduled work, tracks completion, and shows the next scheduled task', () => {
        const records = [
            { type: 'Backflush', completedDate: '2026-08-01', nextDueDate: '2026-09-01' },
            { type: 'Machine clean', completedDate: '2026-10-07', nextDueDate: '2026-10-14' },
            { type: 'Steam wand clean', completedDate: '2026-10-09' }
        ];
        const summary = homeCareSummary('elizabeth', records, '2026-10-09');
        assert.equal(summary.visible[0].preset.type, 'Backflush');
        assert.equal(summary.done, 1);
        assert.equal(summary.next.preset.type, 'Machine clean');
        assert.equal(summary.next.nextDueDate, '2026-10-14');
        assert.ok(!summary.visible.some(task => task.preset.type === 'Steam wand clean'));
    });
});
