import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMemoryDb } from "../src/server/db/testDb";
import type { DbBundle } from "../src/server/db/client";

let bundle: DbBundle;
vi.mock("../src/server/db/client", async (orig) => ({ ...(await orig<object>()), getDb: () => bundle.db, getBundle: () => bundle }));
vi.mock("next/headers", () => ({ cookies: async () => ({}), headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

const auth = () => import("../src/server/auth/auth");

describe("password and reset", () => {
  beforeEach(async () => {
    bundle = await openMemoryDb();
    process.env.APP_PASSWORD = "env-password-1";
    process.env.RECOVERY_CODE = "recovery-code-123456";
  });

  it("uses APP_PASSWORD until a new password is set, then only the new one", async () => {
    const a = await auth();
    expect(await a.checkPassword("env-password-1")).toBe(true);
    expect(await a.checkPassword("nope")).toBe(false);
    await a.setPassword("brand-new-password");
    expect(await a.checkPassword("brand-new-password")).toBe(true);
    expect(await a.checkPassword("env-password-1")).toBe(false);
  });

  it("stores only a hash, never the password", async () => {
    const a = await auth();
    await a.setPassword("brand-new-password");
    const { settings } = await import("../src/server/db/schema");
    const rows = await bundle.db.select().from(settings);
    expect(JSON.stringify(rows)).not.toContain("brand-new-password");
  });

  it("accepts only the exact recovery code, and is off when none is configured", async () => {
    const a = await auth();
    expect(a.checkRecoveryCode("recovery-code-123456")).toBe(true);
    expect(a.checkRecoveryCode("recovery-code-12345")).toBe(false);
    process.env.RECOVERY_CODE = "short";
    expect(a.recoveryEnabled()).toBe(false);
    expect(a.checkRecoveryCode("short")).toBe(false);
  });

  it("locks out after 5 failures", async () => {
    const a = await auth();
    for (let i = 0; i < 5; i++) await a.recordLoginFailure();
    expect(await a.loginLockedMinutes()).toBeGreaterThan(0);
    await a.clearLoginFailures();
    expect(await a.loginLockedMinutes()).toBe(0);
  });
});
