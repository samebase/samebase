// Convex.LocalDeployment: the logged-in local deployment of one folder, which
// `npx convex deployment create <team>:<project>:local --select` makes and `npx convex dev` runs on
// this machine. Each folder, such as each git worktree, has its own, with its own data.
//
// The resource writes its `env` and nothing else. The running `convex dev` owns the backend and
// pushes the functions, so the stage of a laptop runs after `convex dev` has started, and the
// first push of a new local deployment takes the variables that the project's default variables
// for development gave it. The resource reads the deployment from
// `.convex/local/default/config.json`, where the Convex CLI keeps its name, ports, and admin key,
// and writes with that admin key through the same call as for a cloud deployment.
//
// A destroy changes nothing: the folder's deployment and its variables stay with the folder.
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";
import { readLocalDeployment } from "./ManagementApi.ts";
import type { Providers } from "./Providers.ts";
import { type EnvValue, push } from "./Push.ts";

/** The folder has no logged-in local deployment. */
export class LocalDeploymentNotFound extends Schema.TaggedError<LocalDeploymentNotFound>()(
  "LocalDeploymentNotFound",
  { rootDir: Schema.String },
) {
  override get message() {
    return `Convex.LocalDeployment: ${this.rootDir} has no logged-in local deployment. Run \`npx convex deployment create <team>:<project>:local --select\` there, then \`npx convex dev\`.`;
  }
}

/**
 * The folder's logged-in local deployment, read when the stack's program runs, so that a client
 * can take its `siteUrl`. Fails with `LocalDeploymentNotFound` when the folder has none.
 */
const of = (rootDir = ".") => {
  const info = readLocalDeployment(rootDir);
  if (info === undefined) throw new LocalDeploymentNotFound({ rootDir });
  return { name: info.name, url: info.url, siteUrl: info.siteUrl };
};

export interface LocalDeploymentProps {
  /** The folder of the Convex app, where `.convex/local/default` is. The working directory without it. */
  readonly rootDir?: string;
  /** The variables of the deployment. A name that leaves `env` is removed. */
  readonly env: Readonly<Record<string, EnvValue>>;
}

export interface LocalDeploymentAttributes {
  readonly name: string;
  readonly url: string;
  readonly siteUrl: string;
  /** The names that this resource set, so a name that leaves `env` is removed. */
  readonly envNames: readonly string[];
}

export type LocalDeployment = Resource<
  "Convex.LocalDeployment",
  LocalDeploymentProps,
  LocalDeploymentAttributes,
  never,
  Providers
>;
export const LocalDeployment = Resource<LocalDeployment>("Convex.LocalDeployment")({ of });

export const LocalDeploymentProvider = () =>
  Provider.effect(
    LocalDeployment,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      return {
        // Always an update: the variables are read and only changed values are written.
        diff: ({ news }) =>
          Effect.succeed(isResolved(news) ? ({ action: "update" } as const) : undefined),

        read: ({ output }) => Effect.succeed(output),

        reconcile: Effect.fn(function* ({ news, output }) {
          const rootDir = news.rootDir ?? ".";
          const info = readLocalDeployment(rootDir);
          if (info === undefined) return yield* new LocalDeploymentNotFound({ rootDir });
          // Without `source`, a push only sets the variables and removes the names that left `env`.
          yield* push(spawner, info.adminKey, {
            deployment: info.name,
            url: info.url,
            rootDir,
            source: undefined,
            env: news.env,
            previousEnvNames: output?.name === info.name ? output.envNames : [],
            adopt: true,
            previewName: undefined,
          });
          return {
            name: info.name,
            url: info.url,
            siteUrl: info.siteUrl,
            envNames: Object.keys(news.env).sort(),
          };
        }),

        delete: () => Effect.void,
      };
    }),
  );
