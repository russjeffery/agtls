import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validate a `?next=` redirect target from a query string. Returns the value
 * only when it's a safe same-origin relative path (starts with a single `/`,
 * not `//` or a scheme), otherwise `fallback`. Guards the auth pages against
 * open-redirect via the redirect param.
 */
export function safeRelativePath(
  value: string | string[] | undefined,
  fallback: string
): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//")) return fallback;
  return v;
}
