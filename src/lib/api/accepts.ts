export function wantsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  // Browsers send text/html first; API clients typically send application/json or nothing
  return accept.includes("text/html") && !accept.startsWith("application/json");
}
