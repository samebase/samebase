import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { z } from "zod";

type ComponentBinding = {
  componentPath: string;
  resource: { fqn: string; type: string };
  env: Record<string, string | Redacted.Redacted<string>>;
};
type Association = {
  componentPath: string;
  resources: { fqn: string; type: string }[];
  envNames: string[];
};
type LocalDeployment = Resource<
  "Experiment.ConvexDeployment",
  Record<string, never>,
  { associations: Association[]; envNames: string[] },
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
      for (const { data } of bindings) {
        // This prototype supports one top-level mount. Nested names need a collision-free encoding.
        const componentPath = z
          .string()
          .regex(/^[a-z][a-z0-9]*$/)
          .parse(data.componentPath);
        const association = associations.get(componentPath) ?? {
          componentPath,
          resources: [],
          envNames: [],
        };
        if (!association.resources.some((resource) => resource.fqn === data.resource.fqn))
          association.resources.push(data.resource);
        for (const [name, value] of Object.entries(data.env)) {
          const envName = `${componentPath.toUpperCase()}_${name}`;
          if (Object.hasOwn(env, envName)) throw new Error(`Duplicate binding for ${envName}`);
          env[envName] = Redacted.isRedacted(value) ? Redacted.value(value) : value;
          if (name === "WORKER_URL") z.url().parse(env[envName]);
          association.envNames.push(envName);
        }
        associations.set(componentPath, association);
      }
      for (const [name, value] of Object.entries(env)) await convex(["env", "set", name, value]);
      await convex(["deploy", "--yes", "--typecheck", "disable"]);
      // Required env removal is valid only after a push has removed its config references.
      for (const name of output?.envNames ?? []) {
        if (!Object.hasOwn(env, name)) await convex(["env", "remove", name]);
      }
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
      for (const componentPath of associations.keys()) {
        if (!mounts.some((mount) => mount.path === componentPath && mount.state === "active"))
          throw new Error(`Component ${componentPath} is not mounted`);
      }
      const result = {
        associations: [...associations.values()]
          .sort((left, right) => left.componentPath.localeCompare(right.componentPath))
          .map((association) => ({
            ...association,
            resources: association.resources.sort((left, right) =>
              left.fqn.localeCompare(right.fqn),
            ),
            envNames: association.envNames.sort(),
          })),
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
