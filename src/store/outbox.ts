import { opId, type PendingOp } from "../engine/sync";
import { pushHistoryDelete, pushHistoryEntry } from "./cloudSync";
import { loadOutbox, saveOutbox, type OutboxItem } from "./db";

interface OutboxDeps {
  load: () => Promise<OutboxItem[]>;
  save: (items: OutboxItem[]) => Promise<void>;
  /** Resolves true once the cloud has accepted the change. */
  send: (item: OutboxItem) => Promise<boolean>;
}

/**
 * Every cloud write goes through here. A change is saved to the device first,
 * then sent; it only leaves the queue once the cloud confirms it. Anything
 * that fails (offline, server error) stays queued and is retried on the next
 * flush — reconnect, app load, or right before a sync pulls from the cloud.
 */
export function createOutbox(deps: OutboxDeps) {
  let items: OutboxItem[] = [];
  let running: Promise<void> | null = null;
  let rerun = false;
  // Writing before the saved queue has loaded would overwrite it on disk.
  let restored = false;
  const save = () => (restored ? deps.save(items) : Promise.resolve());

  function put(userId: string, op: PendingOp) {
    const id = opId(op);
    // Latest intent per entry wins — edit-then-delete only needs the delete.
    items = [...items.filter((i) => !(i.userId === userId && opId(i.op) === id)), { userId, op }];
  }

  return {
    /** Load what an earlier session left unsent, keeping anything queued since. */
    async restore() {
      const loaded = await deps.load();
      const queuedNow = items;
      items = loaded;
      for (const i of queuedNow) put(i.userId, i.op);
      restored = true;
      await save();
    },

    enqueue(userId: string, op: PendingOp) {
      put(userId, op);
      void save();
    },

    /** Unsent changes for one account, so a merge can let them beat the cloud. */
    pending(userId: string): PendingOp[] {
      return items.filter((i) => i.userId === userId).map((i) => i.op);
    },

    /**
     * Send everything queued for this account. Only that account's items: the
     * cloud would reject another account's rows anyway, and they wait for
     * that account to sign back in. A failed item doesn't stop the rest, so
     * one bad row can't hold up every other change behind it.
     */
    flush(userId: string): Promise<void> {
      if (running) {
        rerun = true;
        return running;
      }
      running = (async () => {
        do {
          rerun = false;
          for (const item of items.filter((i) => i.userId === userId)) {
            // A newer op for the same entry replaces the item object, so this
            // only removes the exact change that was confirmed.
            if (await deps.send(item)) items = items.filter((i) => i !== item);
          }
          await save();
        } while (rerun);
      })().finally(() => {
        running = null;
      });
      return running;
    },
  };
}

function send(item: OutboxItem): Promise<boolean> {
  return item.op.kind === "upsert"
    ? pushHistoryEntry(item.op.entry, item.userId)
    : pushHistoryDelete(item.op.id);
}

export const outbox = createOutbox({ load: loadOutbox, save: saveOutbox, send });
