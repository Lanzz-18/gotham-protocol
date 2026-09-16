export function uid(): string {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export function stamp(): string {
  const d = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = 60_000, h = 3_600_000, d = 86_400_000;
  if (diff < m) return "just now";
  if (diff < h) return Math.floor(diff / m) + "m ago";
  if (diff < d) return Math.floor(diff / h) + "h ago";
  if (diff < d * 7) return Math.floor(diff / d) + "d ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 500);
}
