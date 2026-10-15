import { meshSuit } from "./suitSdf";

// Meshing takes most of a second, so it runs here instead of freezing the page.
const ctx = self as unknown as {
  onmessage: (() => void) | null;
  postMessage: (msg: unknown, transfer: Transferable[]) => void;
};

ctx.onmessage = () => {
  const m = meshSuit();
  ctx.postMessage(m, [m.positions.buffer, m.normals.buffer, m.indices.buffer, m.parts.buffer, m.ao.buffer, m.glow.buffer]);
};
