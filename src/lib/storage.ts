/**
 * Per-device memory for "have I already shown you this?" — which celebration
 * last played, which villain was last seen locked up. localStorage can be
 * missing or throw (private windows, blocked site data), so every access is
 * guarded and a failure just means the moment may replay.
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // nothing to do
  }
}
