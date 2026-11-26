import { beforeEach, describe, expect, it } from "vitest";
import { approveAccount, checkPassword, getAccount, listAccounts, removeAccount, requestAccount, setPassword, upsertAdmin } from "../src/server/auth/accounts";
import { makeSessionValue, readSessionValue, TTL_MS } from "../src/server/auth/session";
import { settings } from "../src/server/db/schema";
import { openMemoryDb } from "../src/server/db/testDb";
import type { Db } from "../src/server/db/client";

let db: Db;

describe("accounts", () => {
  beforeEach(async () => {
    db = (await openMemoryDb()).db;
  });

  it("new accounts wait for approval, and a second sign-up cannot overwrite one", async () => {
    expect(await requestAccount(db, "a@x.com", "password-one")).toBe("ok");
    expect((await getAccount(db, "a@x.com"))?.status).toBe("pending");
    expect(await requestAccount(db, "a@x.com", "password-two")).toBe("exists");
    expect(await checkPassword(db, "a@x.com", "password-two")).toBeNull();
    await approveAccount(db, "a@x.com");
    expect((await checkPassword(db, "a@x.com", "password-one"))?.status).toBe("active");
    expect((await getAccount(db, "a@x.com"))?.admin).toBe(false);
  });

  it("stores only a hash, and changing the password ends old sessions", async () => {
    await upsertAdmin(db, "boss@x.com", "first-password");
    const before = (await getAccount(db, "boss@x.com"))!.version;
    const after = await setPassword(db, "boss@x.com", "second-password");
    expect(after).not.toBe(before);
    expect(await checkPassword(db, "boss@x.com", "first-password")).toBeNull();
    expect(await checkPassword(db, "boss@x.com", "second-password")).not.toBeNull();
    expect(JSON.stringify(await db.select().from(settings))).not.toContain("second-password");
  });

  it("removes accounts and limits how many can wait", async () => {
    for (let i = 0; i < 20; i++) await requestAccount(db, `p${i}@x.com`, "password-one");
    expect(await requestAccount(db, "extra@x.com", "password-one")).toBe("full");
    await removeAccount(db, "p0@x.com");
    expect(await listAccounts(db)).toHaveLength(19);
  });
});

describe("session cookie", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret-123";
  });

  it("round-trips, expires, and rejects tampering", () => {
    const value = makeSessionValue("a@x.com", "v1", 1000);
    expect(readSessionValue(value, 2000)).toMatchObject({ email: "a@x.com", version: "v1" });
    expect(readSessionValue(value, 1000 + TTL_MS + 1)).toBeNull();
    const parts = value.split(".");
    parts[2] = Buffer.from("boss@x.com").toString("base64url");
    expect(readSessionValue(parts.join("."), 2000)).toBeNull();
    expect(readSessionValue(undefined)).toBeNull();
  });
});
