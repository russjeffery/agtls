// Best-effort client IP extraction for rate limiting and audit. Returns null
// when no IP is available (e.g. stripped by a proxy) so callers can skip the
// per-IP check rather than reject.
export function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}
