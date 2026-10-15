import { meshSuit, type SuitMesh } from "./suitSdf";

let pending: Promise<SuitMesh> | null = null;

/**
 * The Batsuit mesh, built once per visit in a worker and shared after that.
 * If workers aren't available it's built on the main thread instead.
 */
export function loadSuit(): Promise<SuitMesh> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    try {
      const w = new Worker(new URL("./suitWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<SuitMesh>) => {
        w.terminate();
        resolve(e.data);
      };
      w.onerror = () => {
        w.terminate();
        resolve(meshSuit());
      };
      w.postMessage(null);
    } catch {
      resolve(meshSuit());
    }
  });
  return pending;
}
