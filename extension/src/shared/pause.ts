/** Temporary stop: while paused, nothing new is read from LinkedIn. Queued events still reach the dashboard. */
export const PAUSE_KEY = "paused";
export const isPaused = (v: unknown): boolean => v === true;
