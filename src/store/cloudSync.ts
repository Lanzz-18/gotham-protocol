import { mergeHistory, type PendingOp, type RemoteHistoryRow } from "../engine/sync";
import type { EngineConfig, LogEntry } from "../engine/types";
import { supabase } from "./supabaseClient";

export interface CloudUser {
  id: string;
  email: string;
  /** The display name given at sign-up. Falls back to the email's local part
   *  for accounts created before this existed, so the nav never shows blank. */
  name: string;
}

export interface ProfileBlob {
  config: EngineConfig;
  settings: { sound: boolean; motion: boolean; accent: string };
  portraits: Record<number, string>;
}

type RawUser = {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string } | null;
} | null | undefined;

function toUser(u: RawUser): CloudUser | null {
  if (!u) return null;
  const email = u.email ?? "";
  const name = u.user_metadata?.name || email.split("@")[0] || "";
  return { id: u.id, email, name };
}

/** Current session's user, or null if signed out or cloud sync isn't configured. */
export async function getCloudUser(): Promise<CloudUser | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return toUser(data.user);
}

/** Fires on sign-in, sign-out, and token refresh. Returns an unsubscribe function. */
export function onAuthChange(cb: (user: CloudUser | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(toUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}

export interface AuthResult {
  error: string | null;
  /** True when the account was created but Supabase is holding it pending an
   *  email-confirmation click — sign-in won't work until that happens. This
   *  is a project-level toggle in Supabase, not something the client controls. */
  needsConfirmation: boolean;
  user: CloudUser | null;
}

/** Creates the account with a display name attached, then signs in immediately
 *  if the project doesn't require email confirmation first. */
export async function signUpWithPassword(name: string, email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { error: "Cloud sync isn't configured on this build.", needsConfirmation: false, user: null };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) return { error: error.message, needsConfirmation: false, user: null };
  // Supabase returns a user with no session when the project requires the
  // confirmation-email click before the account is usable.
  const needsConfirmation = !!data.user && !data.session;
  return { error: null, needsConfirmation, user: toUser(data.session ? data.user : null) };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { error: "Cloud sync isn't configured on this build.", needsConfirmation: false, user: null };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message, needsConfirmation: false, user: null };
  return { error: null, needsConfirmation: false, user: toUser(data.user) };
}

export async function signOutCloud(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Pull this user's history from the cloud and reconcile it against what's
 * already local. Returns the merged set to load, plus whatever was
 * local-only and now needs pushing. `pending` is the outbox: changes the
 * cloud hasn't confirmed yet, which win over the cloud's older copy.
 */
export async function pullAndMergeHistory(local: readonly LogEntry[], pending: readonly PendingOp[] = []) {
  if (!supabase) return { merged: [...local], toPush: [] as LogEntry[] };
  const { data, error } = await supabase.from("history").select("*");
  if (error || !data) return { merged: [...local], toPush: [] as LogEntry[] };

  const rows: RemoteHistoryRow[] = data.map((r) => ({
    id: r.id,
    pillar: r.pillar,
    action: r.action,
    xp: r.xp,
    note: r.note,
    ts: Number(r.ts),
    deletedAt: r.deleted_at,
  }));
  return mergeHistory(local, rows, pending);
}

/**
 * Push one log entry (a new one, or an edit). Returns whether the cloud
 * accepted it. Supabase reports most failures — offline included — as a
 * returned `error`, not a throw, so both have to be checked.
 */
export async function pushHistoryEntry(entry: LogEntry, userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("history").upsert({
      id: entry.id,
      user_id: userId,
      pillar: entry.pillar,
      action: entry.action,
      xp: entry.xp,
      note: entry.note,
      ts: entry.ts,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Tombstone push — the row is never hard-deleted, just marked gone. Returns whether it landed. */
export async function pushHistoryDelete(id: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("history").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** Pulls the profile blob if the cloud's copy is newer than what's passed in. */
export async function pullProfileIfNewer(
  localUpdatedAt: number,
): Promise<{ blob: ProfileBlob; updatedAt: number } | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;

  const { data: row } = await supabase.from("profile").select("*").eq("user_id", userId).maybeSingle();
  if (!row) return null;

  const remoteUpdatedAt = new Date(row.updated_at).getTime();
  if (remoteUpdatedAt <= localUpdatedAt) return null;

  return {
    blob: { config: row.config, settings: row.settings, portraits: row.portraits ?? {} },
    updatedAt: remoteUpdatedAt,
  };
}

/** Best-effort push of config/settings/portraits. Never throws. */
export async function pushProfile(blob: ProfileBlob): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("profile").upsert({
      user_id: userId,
      config: blob.config,
      settings: blob.settings,
      portraits: blob.portraits,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort, same reasoning as the history pushes above.
  }
}
