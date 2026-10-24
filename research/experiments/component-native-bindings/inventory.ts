import { globSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { toPath } from "alchemy/FQN";
import { z } from "zod";
import { association } from "./deployment.ts";

const namespace = z.object({
  Id: z.string(),
  get Parent() {
    return namespace.optional();
  },
});
const resource = z.object({
  resourceType: z.string(),
  namespace: namespace.optional(),
  fqn: z.string(),
  instanceId: z.string(),
  status: z.string(),
});

/** Read actual Alchemy state. A resource FQN is not a namespace path. */
export async function inventory(stack: string, associations: z.infer<typeof association>[]) {
  const directory = resolve(import.meta.dirname, ".alchemy/state", stack, "local-experiment");
  const rows = [];
  for (const file of globSync("**/*.json", { cwd: directory })) {
    if (file === "__stack_output__.json") continue;
    const row = resource.parse(JSON.parse(await readFile(resolve(directory, file), "utf8")));
    const path = toPath(row.namespace);
    const owner = associations
      .filter((item) => item.namespace.every((part, index) => path[index] === part))
      .sort((left, right) => right.namespace.length - left.namespace.length)
      .at(0);
    rows.push({
      fqn: row.fqn,
      type: row.resourceType,
      namespace: path,
      instanceId: row.instanceId,
      status: row.status,
      componentPath: owner?.componentPath ?? null,
    });
  }
  return rows.sort((left, right) => left.fqn.localeCompare(right.fqn));
}
