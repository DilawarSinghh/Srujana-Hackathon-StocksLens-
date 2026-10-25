/**
 * Delete the local test user (and cascade its owned rows) and remove the saved
 * browser state. Safe to run anytime; no-op when the harness is unconfigured.
 *
 *   pnpm e2e:cleanup
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

import fs from "node:fs";
import { STORAGE_STATE, readTestAuthEnv } from "./test-auth.config";
import { deleteTestUser } from "./seed-test-user";

async function main(): Promise<void> {
  // Remove the signed-in state regardless of env.
  if (fs.existsSync(STORAGE_STATE)) {
    fs.rmSync(STORAGE_STATE, { force: true });
    console.log(`[e2e:cleanup] removed ${STORAGE_STATE}`);
  }

  let env: ReturnType<typeof readTestAuthEnv> = null;
  try {
    env = readTestAuthEnv();
  } catch (e) {
    console.error(`[e2e:cleanup] ${(e as Error).message}`);
    return;
  }
  if (!env) {
    console.log("[e2e:cleanup] harness not configured — nothing else to clean.");
    return;
  }

  await deleteTestUser(env);
  console.log(`[e2e:cleanup] deleted local test user ${env.email}.`);
}

main().catch((e) => {
  console.error(`[e2e:cleanup] failed: ${(e as Error).message}`);
  process.exit(1);
});
