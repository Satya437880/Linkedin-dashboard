import type { IngestEvent } from "../shared/types";

export type ParsedEvents = IngestEvent[];

export type Json = unknown;

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Depth-first walk over every object in a JSON tree. */
export function walk(v: unknown, visit: (o: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 40) return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x, visit, depth + 1);
  } else if (isObj(v)) {
    visit(v);
    for (const k of Object.keys(v)) walk(v[k], visit, depth + 1);
  }
}

export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** LinkedIn wraps many strings as { text: "..." }. */
export const txt = (v: unknown): string | null => (isObj(v) ? str(v.text) : str(v));
