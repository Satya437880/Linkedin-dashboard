import { EventQueue, type KV } from "../queue/queue";
import { isPaused, PAUSE_KEY } from "../shared/pause";
import { DEFAULT_CONFIG, type Config, type IngestEvent } from "../shared/types";

const kv: KV = {
  async get<T>(key: string) {
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};
const queue = new EventQueue(kv);

async function config(): Promise<Config> {
  return { ...DEFAULT_CONFIG, ...((await kv.get<Config>("config")) ?? {}) };
}

const paused = async () => isPaused(await kv.get(PAUSE_KEY));

/** Toolbar badge: "II" while paused, otherwise the number of events waiting to be sent. */
async function updateBadge() {
  if (await paused()) {
    await chrome.action.setBadgeText({ text: "II" });
    await chrome.action.setBadgeBackgroundColor({ color: "#687073" });
    return;
  }
  const s = await queue.status();
  await chrome.action.setBadgeText({ text: s.queued ? String(s.queued) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#6B2737" });
}

async function flush() {
  await queue.flush(await config()); // events already read still go out, so nothing is lost by pausing
  await updateBadge();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg?.type === "events") {
      // Authoritative pause check: even if a page script was slow to notice, nothing new is stored while paused.
      if (await paused()) { reply({ ok: true, paused: true }); return; }
      await queue.enqueue(msg.events as IngestEvent[]);
      await flush();
      reply({ ok: true });
    } else if (msg?.type === "status") {
      reply({ ...(await queue.status()), appUrl: (await config()).appUrl, paused: await paused() });
    } else if (msg?.type === "flush") {
      await flush();
      reply({ ok: true });
    }
  })();
  return true; // async reply
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[PAUSE_KEY]) void updateBadge();
});

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("flush", { periodInMinutes: 1 }); void updateBadge(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create("flush", { periodInMinutes: 1 }); void updateBadge(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "flush") void flush(); });
