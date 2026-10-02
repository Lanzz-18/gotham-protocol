import { describe, expect, it } from "vitest";

import { createOutbox } from "../../src/store/outbox";
import type { OutboxItem } from "../../src/store/db";
import { log } from "../helpers";

/**
 * The outbox is what stops an offline edit or delete from being undone by
 * the next sync. Storage and network are both passed in, so this runs with
 * neither — `online` flips whether the fake cloud accepts a send.
 */

function setup(saved: OutboxItem[] = []) {
  let online = false;
  let disk: OutboxItem[] = saved;
  const sent: OutboxItem[] = [];
  const box = createOutbox({
    load: async () => disk,
    save: async (items) => { disk = items; },
    send: async (item) => {
      if (!online) return false;
      sent.push(item);
      return true;
    },
  });
  return {
    box,
    sent,
    disk: () => disk,
    goOnline: () => { online = true; },
  };
}

describe("Offline", () => {
  it("keeps a failed change queued instead of dropping it", async () => {
    const { box, disk } = setup();
    await box.restore();
    box.enqueue("u1", { kind: "delete", id: "a" });
    await box.flush("u1");
    expect(box.pending("u1")).toEqual([{ kind: "delete", id: "a" }]);
    expect(disk()).toHaveLength(1);
  });

  it("sends it once the connection is back, then clears it", async () => {
    const { box, sent, goOnline } = setup();
    box.enqueue("u1", { kind: "delete", id: "a" });
    await box.flush("u1");
    goOnline();
    await box.flush("u1");
    expect(sent).toHaveLength(1);
    expect(box.pending("u1")).toEqual([]);
  });
});

describe("Coalescing", () => {
  it("only the latest change per entry is kept — edit then delete is just a delete", async () => {
    const { box } = setup();
    const e = log("forge", 50, 1);
    box.enqueue("u1", { kind: "upsert", entry: e });
    box.enqueue("u1", { kind: "upsert", entry: { ...e, xp: 80 } });
    box.enqueue("u1", { kind: "delete", id: e.id });
    expect(box.pending("u1")).toEqual([{ kind: "delete", id: e.id }]);
  });
});

describe("Accounts", () => {
  it("never sends one account's changes while another is signed in", async () => {
    const { box, sent, goOnline } = setup();
    box.enqueue("alice", { kind: "delete", id: "a" });
    goOnline();
    await box.flush("bob");
    expect(sent).toEqual([]);
    expect(box.pending("alice")).toHaveLength(1);
  });
});

describe("Across app restarts", () => {
  it("restore picks up what the last session left unsent", async () => {
    const { box } = setup([{ userId: "u1", op: { kind: "delete", id: "old" } }]);
    await box.restore();
    expect(box.pending("u1")).toEqual([{ kind: "delete", id: "old" }]);
  });

  it("restore keeps changes queued before it finished loading", async () => {
    const { box } = setup([{ userId: "u1", op: { kind: "delete", id: "old" } }]);
    box.enqueue("u1", { kind: "delete", id: "new" });
    await box.restore();
    expect(box.pending("u1").map((o) => (o.kind === "delete" ? o.id : ""))).toEqual(["old", "new"]);
  });

  it("never overwrites the saved queue before it has been loaded", async () => {
    const { box, disk } = setup([{ userId: "u1", op: { kind: "delete", id: "old" } }]);
    box.enqueue("u1", { kind: "delete", id: "new" });
    expect(disk()).toHaveLength(1);
    await box.restore();
    expect(disk()).toHaveLength(2);
  });
});
