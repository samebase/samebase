import { isRecord } from "@samebase/dependent";
import { ConvexHttpClient } from "convex/browser";
import { readFile } from "node:fs/promises";

export async function createLocalConvexAdminClient(localConfigPath: string) {
  const localConfig: unknown = JSON.parse(await readFile(localConfigPath, "utf8"));
  if (
    !isRecord(localConfig) ||
    !isRecord(localConfig.ports) ||
    typeof localConfig.ports.cloud !== "number" ||
    typeof localConfig.adminKey !== "string"
  ) {
    throw new Error("Invalid local Convex config: " + localConfigPath);
  }

  const client = new ConvexHttpClient("http://127.0.0.1:" + localConfig.ports.cloud, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  });
  // @ts-expect-error ConvexHttpClient ships this admin method for the CLI, but omits it from the public type declaration.
  client.setAdminAuth(localConfig.adminKey);
  return client;
}
