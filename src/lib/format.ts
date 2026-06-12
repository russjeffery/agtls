// Display helpers for the browser-facing resource pages. The API serializes
// timestamps as Unix seconds; these turn them back into readable strings.

export function fmtDate(unix: number | null | undefined): string {
  if (unix == null) return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export function fmtDateTime(unix: number | null | undefined): string {
  if (unix == null) return "";
  return new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** `YYYY-MM-DDTHH:mm` for prefilling a <input type="datetime-local">. */
export function toDatetimeLocal(unix: number | null | undefined): string {
  if (unix == null) return "";
  return new Date(unix * 1000).toISOString().slice(0, 16);
}
