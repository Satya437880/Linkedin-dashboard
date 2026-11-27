/**
 * Runs in the page's own JS context. Only WATCHES responses LinkedIn's page already fetched and hands
 * a copy to the content script. It never sends, clicks or types anything.
 */
import { INTERESTING_URL } from "../parsers";
import { SseSplitter } from "../shared/sse";

const TAG = "__mpss_capture__";

function emit(url: string, json: unknown, sse = false) {
  window.postMessage({ [TAG]: true, url, json, sse }, window.location.origin);
}

/** LinkedIn pushes new messages through a live event stream. Read a copy of it; the page keeps its own. */
async function readStream(url: string, res: Response) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const split = new SseSplitter();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const data of split.push(dec.decode(value, { stream: true }))) {
      try { emit(url, JSON.parse(data), true); } catch { /* not JSON */ }
    }
  }
}

function emitSkipped(url: string, ct: string) {
  window.postMessage({ [TAG]: true, skipped: true, url, ct }, window.location.origin);
}

const origFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const res = await origFetch.apply(this, args);
  try {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : String(args[0]);
    const ct = res.headers.get("content-type") ?? "";
    if (/text\/event-stream/i.test(ct)) {
      readStream(url, res.clone()).catch(() => undefined);
      emitSkipped(url, ct);
    } else if (INTERESTING_URL.test(url) && /json/i.test(ct)) {
      res.clone().json().then((j) => emit(url, j)).catch(() => undefined);
    } else {
      emitSkipped(url, ct); // diagnostics only: which requests the page makes that we do not read
    }
  } catch { /* never break the page */ }
  return res;
};

const origOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  const u = String(url);
  if (INTERESTING_URL.test(u)) {
    this.addEventListener("load", () => {
      try {
        if (/json/i.test(this.getResponseHeader("content-type") ?? "")) emit(u, JSON.parse(this.responseText));
      } catch { /* ignore */ }
    });
  }
  // @ts-expect-error forwarding the original variadic signature
  return origOpen.call(this, method, url, ...rest);
};
