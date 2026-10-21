import type { Page } from "@playwright/test";
import { isRecord } from "@samebase/dependent";
import { ConvexHttpClient } from "convex/browser";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api";
import type { WorkspaceSidebarState } from "../convex/userPreferenceModel";

const LOCAL_CONFIG_PATH = fileURLToPath(
  new URL("../.convex/local/default/config.json", import.meta.url),
);

/**
Saves the workspace sidebar state of the page's signed-in account in Convex with the same mutation
that the app calls, so the next server render of a page uses it. Call it after the sign-in and
before the page load that the test measures.
*/
export async function saveWorkspaceSidebarState(page: Page, state: WorkspaceSidebarState) {
  const localConfig: unknown = JSON.parse(await readFile(LOCAL_CONFIG_PATH, "utf8"));
  if (!isRecord(localConfig) || !isRecord(localConfig.ports)) {
    throw new Error(`Invalid local Convex config: ${LOCAL_CONFIG_PATH}`);
  }
  const accessToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "__convexAuthJWT",
  )?.value;
  if (!accessToken) {
    throw new Error("Sign in before saving the workspace sidebar state.");
  }

  const client = new ConvexHttpClient(`http://127.0.0.1:${String(localConfig.ports.cloud)}`, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  });
  client.setAuth(accessToken);
  await client.mutation(api.workspaceSidebarState.setWorkspaceSidebarState, {
    state,
    workspaceKey: "app",
  });
}
