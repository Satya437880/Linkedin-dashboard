export type Inbox = "classic" | "sales_navigator";

export interface Sender {
  linkedinUrl: string | null;
  providerUserId: string;
  fullName: string;
  headline: string | null;
  photoUrl: string | null;
}

/** Normalized event posted to the app. `sender` is always the other party in the thread (the prospect). */
export interface IngestEvent {
  source: "extension";
  eventType: "message.new" | "relation.new" | "profile.view";
  externalMessageId: string;
  externalThreadId: string;
  inbox: Inbox;
  direction: "inbound" | "outbound";
  text: string;
  sentAt: string; // ISO
  sender: Sender;
  threadUrl?: string | null;
  raw?: unknown;
}

export interface Config {
  appUrl: string;
  token: string;
  /** Your name as LinkedIn shows it. Used to tell your messages from the client's when it cannot be detected. */
  ownName?: string;
}

export interface Stats {
  read: number;
  sent: number;
  lastSentAt: string | null;
  lastError: string | null;
}

export const DEFAULT_CONFIG: Config = { appUrl: "http://localhost:3000", token: "" };
