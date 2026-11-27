import type { IngestEvent } from "../shared/types";
import { looksClassic, parseClassic } from "./classic";
import { looksSalesNav, parseSalesNav } from "./salesnav";

export { parseClassic, parseSalesNav };
export { parseClassicDom } from "./dom";

/** Tries every JSON parser. Returns [] for responses that are not messages. */
export function parseJson(json: unknown): IngestEvent[] {
  if (looksClassic(json)) return parseClassic(json);
  if (looksSalesNav(json)) return parseSalesNav(json);
  return [];
}

/** URLs worth inspecting; everything else is ignored by the page hook. */
export const INTERESTING_URL = /voyager|messenger|sales-api|salesApiMessaging/i;
