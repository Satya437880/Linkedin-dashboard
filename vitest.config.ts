import { defineConfig } from "vitest/config";

// Each test boots a fresh in-memory Postgres and runs every migration, so allow more than the 5s default.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
