/**
 * Trigger a client-side JSON file download — no server temp file needed. Shared
 * by the COPPA export controls (per-child {@link LearnerDataControls} and the
 * whole-account {@link AccountDataControls}), which return the export payload to
 * the client and let the browser save it. Pretty-prints, then synthesizes and
 * clicks a transient anchor, revoking the object URL afterward.
 */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
