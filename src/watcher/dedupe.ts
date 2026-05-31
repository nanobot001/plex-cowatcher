import type { WatchEvent } from "../types/index.js";

export function watchEventKey(event: Pick<WatchEvent, "sourceUserId" | "ratingKey" | "watchedAt">): string {
  return `${event.sourceUserId}:${event.ratingKey}:${event.watchedAt}`;
}

export function isDuplicateWithinWindow(existingWatchedAt: string, incomingWatchedAt: string, windowMinutes = 10): boolean {
  const existing = new Date(existingWatchedAt).getTime();
  const incoming = new Date(incomingWatchedAt).getTime();
  if (!Number.isFinite(existing) || !Number.isFinite(incoming)) return false;
  return Math.abs(existing - incoming) <= windowMinutes * 60 * 1000;
}
