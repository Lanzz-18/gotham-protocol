import type { LogEntry } from "./types";

/**
 * The shape a history row takes in the cloud. Deletes are never a hard row
 * removal — they are recorded as a tombstone (deletedAt set) so the delete
 * can travel to a device that was offline when it happened. Without this a
 * device that deletes something while another device is asleep would just
 * see it come back the next time that device reconnects.
 */
export interface RemoteHistoryRow {
  id: string;
  pillar: string;
  action: string;
  xp: number;
  note: string;
  ts: number;
  deletedAt: string | null;
}

export interface MergeResult {
  /** The reconciled set to load into local state. */
  merged: LogEntry[];
  /** Local entries the cloud has never seen — push these up. */
  toPush: LogEntry[];
}

/**
 * A change made on this device that the cloud has not confirmed yet. Edits
 * and deletes need this: the cloud already knows those ids, so without a
 * record of the pending change the next merge would let the cloud's stale
 * copy win and quietly undo it.
 */
export type PendingOp =
  | { kind: "upsert"; entry: LogEntry }
  | { kind: "delete"; id: string };

export function opId(op: PendingOp): string {
  return op.kind === "upsert" ? op.entry.id : op.id;
}

/**
 * Reconcile a local history against the cloud's version of it.
 *
 * The rule is simple on purpose: for any id the cloud already knows about,
 * the cloud wins — live or tombstoned. An id the cloud has never seen is
 * local-only and gets queued to push. This is correct for the case this app
 * is actually built for (log from your phone, log from your laptop, they
 * meet up later) and does NOT resolve two devices editing or deleting the
 * very same entry while both are offline at once — whichever syncs second
 * wins outright in that rare case, rather than attempting a merge of the
 * conflicting edit itself.
 *
 * The one exception is `pending`: a change this device made that has not
 * reached the cloud yet beats the cloud's copy, because the cloud's copy is
 * simply older. Those ids are left out of toPush — the outbox owns them.
 */
export function mergeHistory(
  local: readonly LogEntry[],
  remote: readonly RemoteHistoryRow[],
  pending: readonly PendingOp[] = [],
): MergeResult {
  const alive = new Map<string, LogEntry>();
  const knownRemotely = new Set<string>();

  for (const r of remote) {
    knownRemotely.add(r.id);
    if (r.deletedAt) continue; // tombstoned — the cloud says this id is gone
    alive.set(r.id, { id: r.id, pillar: r.pillar, action: r.action, xp: r.xp, note: r.note, ts: r.ts });
  }

  const owned = new Set(pending.map(opId));
  const toPush: LogEntry[] = [];
  for (const e of local) {
    if (knownRemotely.has(e.id)) continue; // the cloud has already ruled on this id
    alive.set(e.id, e);
    if (!owned.has(e.id)) toPush.push(e);
  }

  for (const op of pending) {
    if (op.kind === "delete") alive.delete(op.id);
    else alive.set(op.entry.id, op.entry);
  }

  return { merged: [...alive.values()], toPush };
}
