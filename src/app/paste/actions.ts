"use server";

import { redirect } from "next/navigation";
import { verifyCsrf } from "@/server/auth/auth";
import { getBundle } from "@/server/db/client";
import { ingestEvent } from "@/server/ingest/ingestEvent";

export type PasteState = {
  errors: Partial<Record<"name" | "url" | "text" | "form", string>>;
  values: { name: string; url: string; headline: string; direction: string; text: string };
};

export async function addMessage(_prev: PasteState, form: FormData): Promise<PasteState> {
  await verifyCsrf(form);
  const values = {
    name: String(form.get("name") ?? "").trim(),
    url: String(form.get("linkedinUrl") ?? "").trim(),
    headline: String(form.get("headline") ?? "").trim(),
    direction: form.get("direction") === "outbound" ? "outbound" : "inbound",
    text: String(form.get("text") ?? "").trim(),
  };
  const errors: PasteState["errors"] = {};
  if (!values.name) errors.name = "Enter the person's full name.";
  if (!values.text) errors.text = "Paste the message text.";
  if (values.url && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(values.url)) errors.url = "This does not look like a LinkedIn link. It should start with https://www.linkedin.com/";
  if (Object.keys(errors).length) return { errors, values };

  const slug = (values.url.split("/in/")[1] ?? values.name).replace(/[/?#].*$/, "").toLowerCase();
  let id: number | null = null;
  try {
    const r = ingestEvent(getBundle(), {
      source: "manual",
      eventType: "message.new",
      externalMessageId: `manual:${slug}:${Date.now()}`,
      externalThreadId: `manual:${slug}`,
      inbox: "manual",
      direction: values.direction,
      text: values.text,
      sentAt: new Date(),
      sender: { providerUserId: slug, fullName: values.name, linkedinUrl: values.url || null, headline: values.headline || null },
    });
    if (r.status === "processed") id = r.prospectId;
  } catch {
    return { errors: { form: "Could not save this message. Check the details and try again." }, values };
  }
  redirect(id ? `/prospects/${id}` : "/prospects");
}
