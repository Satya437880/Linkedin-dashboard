export {};
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load() {
  const { config } = (await chrome.storage.local.get("config")) as { config?: { appUrl: string; token: string; ownName?: string } };
  $<HTMLInputElement>("appUrl").value = config?.appUrl ?? "http://localhost:3000";
  $<HTMLInputElement>("token").value = config?.token ?? "";
  $<HTMLInputElement>("ownName").value = config?.ownName ?? "";
  const { stats } = (await chrome.storage.local.get("stats")) as { stats?: { lastSentAt: string | null } };
  $("last").textContent = `Last sent event: ${stats?.lastSentAt ? new Date(stats.lastSentAt).toLocaleString() : "none yet"}`;
}

$("save").addEventListener("click", async () => {
  const appUrl = $<HTMLInputElement>("appUrl").value.trim() || "http://localhost:3000";
  const token = $<HTMLInputElement>("token").value.trim();
  const ownName = $<HTMLInputElement>("ownName").value.trim();
  await chrome.storage.local.set({ config: { appUrl, token, ownName } });
  $("status").textContent = "Saved.";
  await chrome.runtime.sendMessage({ type: "flush" });
});
void load();
