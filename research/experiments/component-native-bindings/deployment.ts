import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { z } from "zod";

export const association = z.object({
  componentPath: z.string(),
  namespace: z.array(z.string()),
  uses: z.array(z.object({ stack: z.string(), stage: z.string(), fqn: z.string() })),
});
export const attributes = z.object({
  associations: z.array(association),
  envNames: z.array(z.string()),
});
type Association = z.infer<typeof association>;
type ComponentBinding = Omit<Association, "namespace"> & {
  namespace: string[] | null;
  env: Record<string, string | Redacted.Redacted<string>>;
};
type LocalDeployment = Resource<
  "Experiment.ConvexDeployment",
  Record<string, never>,
  z.infer<typeof attributes>,
  ComponentBinding
>;
export const Deployment = Resource<LocalDeployment>("Experiment.ConvexDeployment");
export const backendUrl = "http://127.0.0.1:33440";

async function localAdminKey() {
  return z
    .object({ adminKey: z.string() })
    .parse(
      JSON.parse(
        await readFile(new URL(".convex/local/default/config.json", import.meta.url), "utf8"),
      ),
    ).adminKey;
}

/** Only this sample's anonymous backend is permitted. No ambient deployment credentials. */
export async function convex(args: string[]) {
  const adminKey = await localAdminKey();
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "node_modules/convex/bin/main.js"),
      ...args,
      "--url",
      backendUrl,
      "--admin-key",
      adminKey,
    ],
    {
      cwd: import.meta.dirname,
      env: process.env,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    let message = result.stderr.replaceAll(adminKey, "[REDACTED]");
    if (process.env.EXPERIMENT_SECRET)
      message = message.replaceAll(process.env.EXPERIMENT_SECRET, "[REDACTED]");
    throw new Error(message.slice(0, 4000));
  }
  return result.stdout;
}

// This is the missing provider feature. It uses Alchemy's actual lifecycle bindings.
export const deploymentProvider = Provider.succeed(Deployment, {
  read: ({ output }) => Effect.succeed(output),
  reconcile: ({ bindings, output }) =>
    Effect.tryPromise(async () => {
      const env: Record<string, string> = {};
      const associations = new Map<string, Association>();
      const targets = new Set<string>();
      for (const { data } of bindings) {
        const componentPath = z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/)
          .parse(data.componentPath);
        targets.add(componentPath);
        if (data.namespace !== null) {
          if (associations.has(componentPath)) throw new Error("Duplicate component association");
          if (
            [...associations.values()].some(
              (item) => JSON.stringify(item.namespace) === JSON.stringify(data.namespace),
            )
          )
            throw new Error("Namespace has more than one component owner");
          associations.set(componentPath, {
            componentPath,
            namespace: data.namespace,
            uses: data.uses,
          });
        }
        for (const [envName, value] of Object.entries(data.env)) {
          if (Object.hasOwn(env, envName)) throw new Error(`Duplicate binding for ${envName}`);
          env[envName] = Redacted.isRedacted(value) ? Redacted.value(value) : value;
          if (envName.endsWith("_URL")) z.url().parse(env[envName]);
        }
      }
      for (const [name, value] of Object.entries(env)) await convex(["env", "set", name, value]);
      await convex(["deploy", "--yes", "--typecheck", "disable"]);
      // Pinned private dashboard protocol, not a public component installation API.
      const response = await fetch(`${backendUrl}/api/query_batch`, {
        method: "POST",
        headers: {
          Authorization: `Convex ${await localAdminKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          queries: [{ path: "_system/frontend/components:list", args: {}, format: "json" }],
        }),
      });
      if (!response.ok) throw new Error(`Component inspection returned ${response.status}`);
      const {
        results: [{ value: mounts }],
      } = z
        .object({
          results: z.tuple([
            z.object({
              status: z.literal("success"),
              value: z.array(z.object({ path: z.string(), state: z.string() })),
            }),
          ]),
        })
        .parse(await response.json());
      for (const componentPath of targets) {
        if (!mounts.some((mount) => mount.path === componentPath && mount.state === "active"))
          throw new Error(`Component ${componentPath} is not mounted`);
      }
      // Validate the pushed mounts before removing env that is no longer owned by a binding.
      for (const name of output?.envNames ?? []) {
        if (!Object.hasOwn(env, name)) await convex(["env", "remove", name]);
      }
      const result = {
        associations: [...associations.values()].sort((left, right) =>
          left.componentPath.localeCompare(right.componentPath),
        ),
        envNames: Object.keys(env).sort(),
      };
      await writeFile(
        `.local/applied-${process.env.EXPERIMENT_PHASE}.json`,
        JSON.stringify(result, null, 2),
      );
      return result;
    }).pipe(Effect.catch((error) => Effect.fail(error.cause))),
  delete: () => Effect.void,
});
