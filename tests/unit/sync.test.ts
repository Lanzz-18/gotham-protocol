import { describe, expect, it } from "vitest";

import { mergeHistory, type RemoteHistoryRow } from "../../src/engine/sync";
import { log } from "../helpers";

/**
 * mergeHistory is the one piece of the cross-device sync that can be tested
 * with no network at all — a plain reducer over two arrays.
 */

function remote(id: string, over: Partial<RemoteHistoryRow> = {}): RemoteHistoryRow {
  return { id, pillar: "forge", action: "Workout", xp: 50, note: "", ts: 1000, deletedAt: null, ...over };
}

describe("First sync on a fresh device", () => {
  it("pulls the cloud's entries straight into local", () => {
    const { merged, toPush } = mergeHistory([], [remote("r1"), remote("r2")]);
    expect(merged.map((e) => e.id).sort()).toEqual(["r1", "r2"]);
    expect(toPush).toEqual([]);
  });

  it("queues every local entry the cloud has never heard of", () => {
    const local = [log("forge", 40, 1), log("craft", 30, 2)];
    const { merged, toPush } = mergeHistory(local, []);
    expect(merged).toHaveLength(2);
    expect(toPush).toHaveLength(2);
  });
});

describe("Two devices that logged different things", () => {
  it("unions cleanly — nothing from either side is lost", () => {
    const localOnly = log("forge", 50, 1);
    localOnly.id = "phone-1";
    const { merged, toPush } = mergeHistory([localOnly], [remote("laptop-1")]);
    expect(merged.map((e) => e.id).sort()).toEqual(["laptop-1", "phone-1"]);
    expect(toPush.map((e) => e.id)).toEqual(["phone-1"]);
  });
});

describe("A delete tombstoned in the cloud", () => {
  it("removes that id from the merged set even though local still has it", () => {
    const stale = log("forge", 50, 1);
    stale.id = "gone";
    const { merged } = mergeHistory([stale], [remote("gone", { deletedAt: "2026-01-01T00:00:00Z" })]);
    expect(merged.find((e) => e.id === "gone")).toBeUndefined();
  });

  it("does not resurrect it as a re-push either", () => {
    const stale = log("forge", 50, 1);
    stale.id = "gone";
    const { toPush } = mergeHistory([stale], [remote("gone", { deletedAt: "2026-01-01T00:00:00Z" })]);
    expect(toPush).toEqual([]);
  });
});

describe("An id the cloud already has an opinion on", () => {
  it("the cloud's version wins, even if local disagrees on the fields", () => {
    const localEdit = log("forge", 999, 1);
    localEdit.id = "shared";
    localEdit.action = "Local edit";
    const { merged } = mergeHistory(
      [localEdit],
      [remote("shared", { action: "Cloud edit", xp: 40 })],
    );
    const winner = merged.find((e) => e.id === "shared");
    expect(winner?.action).toBe("Cloud edit");
    expect(winner?.xp).toBe(40);
  });

  it("is never queued to push back up — that would just fight the cloud's own value", () => {
    const localEdit = log("forge", 999, 1);
    localEdit.id = "shared";
    const { toPush } = mergeHistory([localEdit], [remote("shared")]);
    expect(toPush).toEqual([]);
  });
});

describe("A change still waiting in the outbox", () => {
  it("an offline delete stays deleted even though the cloud still has the row live", () => {
    const { merged, toPush } = mergeHistory([], [remote("gone")], [{ kind: "delete", id: "gone" }]);
    expect(merged.find((e) => e.id === "gone")).toBeUndefined();
    expect(toPush).toEqual([]);
  });

  it("an offline edit beats the cloud's older copy", () => {
    const edited = log("forge", 80, 1);
    edited.id = "shared";
    edited.action = "PR";
    const { merged } = mergeHistory([edited], [remote("shared", { action: "Workout", xp: 50 })], [
      { kind: "upsert", entry: edited },
    ]);
    const winner = merged.find((e) => e.id === "shared");
    expect(winner?.action).toBe("PR");
    expect(winner?.xp).toBe(80);
  });

  it("leaves pending entries out of toPush, so the outbox is the only thing sending them", () => {
    const fresh = log("forge", 50, 1);
    const { merged, toPush } = mergeHistory([fresh], [], [{ kind: "upsert", entry: fresh }]);
    expect(merged.map((e) => e.id)).toEqual([fresh.id]);
    expect(toPush).toEqual([]);
  });
});

describe("Idempotence", () => {
  it("merging the same pull twice changes nothing further", () => {
    const rows = [remote("a"), remote("b", { deletedAt: "2026-01-01T00:00:00Z" })];
    const first = mergeHistory([], rows);
    const second = mergeHistory(first.merged, rows);
    expect(second.merged.map((e) => e.id).sort()).toEqual(first.merged.map((e) => e.id).sort());
    expect(second.toPush).toEqual([]);
  });
});
