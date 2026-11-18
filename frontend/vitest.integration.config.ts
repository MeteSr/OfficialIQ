import { defineConfig } from "vitest/config";

// Canister integration tests: real calls against canisters deployed to a local
// icp network (`icp network start -d && icp deploy <backend canisters>`), see
// src/integration/README.md. Kept out of `npm test`, which needs no network.
export default defineConfig({
  test: {
    include: ["src/integration/**/*.itest.ts"],
    environment: "node",
    globalSetup: ["src/integration/globalSetup.ts"],
    // Update calls go through consensus: allow a few seconds each.
    testTimeout: 180_000,
    hookTimeout: 300_000,
    // One file at a time keeps the local replica's load (and logs) readable.
    fileParallelism: false,
  },
});
