// Alchemy state in Convex: `state: Convex.state()` in `Alchemy.Stack`.
//
// One project for each Convex team, `alchemy-state-store`, holds the state of
// every stack and stage of the team in its production deployment: the
// tables `resources (stack, stage, fqn, value)` and `outputs (stack, stage,
// value)` of the alchemyState component (src/store/component), served by the
// functions of src/store/convex. The store lives
// outside every resource that a stack manages, so a stack can create and
// destroy its own project. See docs/design/convex-state.md.
//
// Bootstrap, on the first call of the run: the team token (CONVEX_ACCESS_TOKEN,
// or the Convex CLI login) finds the project by name, or creates it; a deploy
// key of its production deployment that can run internal queries and
// mutations, and nothing else, is created for the run and deleted at its
// end; the `state:version` query says whether the deployment has the store
// of this version. Without one, the installed Convex CLI pushes
// src/store/convex to it, with a push key that is deleted after the push. An
// older one first gets the bridge of src/store-bridge, which cleans its rows
// for the schema of this version (see `upgradeStore`). The raw state functions are internal; authenticated readers get
// repository-scoped subscriptions with secret values removed. A key that stops working during a
// long run (it expires after two hours) is replaced once per call.
//
// The store seals each `Redacted` value in its own functions, with a key in a variable of its
// deployment, so this client sends and gets clear text. Each run asks whether the sealing is
// finished, and finishes it: see `ensureSealed`.
//
// Two first runs of a team can both create a project named `alchemy-state-store`.
// The run whose project is not the oldest deletes its own, before it writes
// anything, and uses the oldest: both runs end on one store.
//
// Samebase reads `stacks`, `getOutput`, `readStack`, and `reader:repository`
// by name. The store and its readers are released and upgraded together:
// STORE_VERSION rises with each change of a function, and a client works only
// with a store of its own version. An older store is upgraded in the run; a
// newer one fails the run.
//
// The store holds Alchemy's state interface and nothing else, so a stack can
// use the state store of Alchemy's Cloudflare package in its place. The run
// record that Samebase reads is a layer over any state: see `withRunRecord` in
// src/RunRecord.ts.
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import {
  encodeState,
  type PersistedState,
  type ReplacedResourceState,
  reviveState,
  State,
  type StateService,
  STATE_STORE_VERSION,
  StateStoreError,
} from "alchemy/State";
import { fromConfig } from "./Credentials.ts";
import { ProductionDeploymentNotFound } from "./Deployment.ts";
import {
  absentAsUndefined,
  ManagementApi,
  ManagementApiLive,
  type ManagementApiService,
  retryIdempotentWrite,
} from "./ManagementApi.ts";
import {
  createProject,
  findProjectByName,
  listProjectsByName,
  prodDeploymentOf,
} from "./Project.ts";
import {
  createDeployKey,
  deleteDeployKey,
  installedCli,
  push,
  PUSH_KEY_ACTIONS,
  withPushKey,
  writeVariables,
} from "./Push.ts";
import { stateKeyName } from "./store/convex/sealing.ts";
import { STORE_VERSION } from "./store/convex/version.ts";
import { newKey, newKeyId } from "./store/sealedSecret.ts";

/** The name of the state project in each team. */
export const STORE_PROJECT_NAME = "alchemy-state-store";

/**
 * The actions of the key of one run: the internal queries and mutations of
 * the store, nothing else. Measured: `deployment:data:view` and
 * `deployment:data:write` do not run an internal function.
 */
export const RUN_KEY_ACTIONS = [
  "deployment:functions:runInternalQueries",
  "deployment:functions:runInternalMutations",
] as const;

/** The actions of the key of one run on the store: its writes are actions that seal. */
const STORE_KEY_ACTIONS = [...RUN_KEY_ACTIONS, "deployment:functions:runInternalActions"] as const;

/** The body of POST /api/function, with HTTP 200 for a function error too. */
const Reply = Schema.Union([
  Schema.Struct({ status: Schema.Literal("success"), value: Schema.Unknown }),
  Schema.Struct({ status: Schema.Literal("error"), errorMessage: Schema.String }),
]);
type Reply = typeof Reply.Type;

/** The error reply of /api/function for a function that the deployment does not have (recorded). */
const MISSING_FUNCTION = /Could not find function for '/;

/** HTTP 401 or 403 from the function API: the key is gone or expired (recorded: 403 without a key). */
const isUnauthorized = (error: StateStoreError) =>
  error.http?.status === 401 || error.http?.status === 403;

const failure = (message: string) => new StateStoreError({ message: `Convex state: ${message}` });

/** No reply, HTTP 429, or HTTP 5xx: a new attempt can succeed. Every call of the store is idempotent. */
const isTransient = (error: StateStoreError) =>
  error.http !== undefined &&
  (error.http.status === undefined || error.http.status === 429 || error.http.status >= 500);

const post = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Effect.Effect<unknown, StateStoreError> =>
  Effect.tryPromise({
    try: () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    catch: () => new StateStoreError({ message: `Convex state: POST ${url} failed`, http: {} }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok || response.status === 560
        ? Effect.tryPromise({
            try: (): Promise<unknown> => response.json(),
            catch: () => failure(`${url} gave no JSON`),
          })
        : Effect.fail(
            new StateStoreError({
              message: `Convex state: POST ${url} failed with HTTP ${response.status}`,
              http: { status: response.status },
            }),
          ),
    ),
    Effect.retry({
      while: isTransient,
      schedule: Schedule.exponential("100 millis").pipe(Schedule.jittered),
      times: 5,
    }),
  );

const decode =
  <S extends Schema.Codec<unknown, unknown>>(schema: S, what: string) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => failure(`bad ${what}`)));

/** The reply of `state:sealing`. */
const Sealing = Schema.Struct({ current: Schema.NullOr(Schema.String), sealed: Schema.Boolean });

/** The reply of `state:reseal`. */
const Resealed = Schema.Struct({ failed: Schema.Array(Schema.String) });

/** The function API of the store deployment, with a deploy key. */
export interface FunctionApi {
  /** POST /api/function, the call that `convex run` makes: the reply, which can be a function error. */
  readonly call: (
    path: string,
    args: Record<string, string | boolean | undefined>,
  ) => Effect.Effect<Reply, StateStoreError>;
}

export const makeFunctionApi = (url: string, key: Redacted.Redacted<string>): FunctionApi => ({
  call: (path, args) =>
    post(
      `${url}/api/function`,
      { Authorization: `Convex ${Redacted.value(key)}` },
      { path, args, format: "json" },
    ).pipe(Effect.flatMap(decode(Reply, `reply of ${path}`))),
});

/** The value of a reply, or the Convex message, which names the function and the cause, such as a missing key action. */
const valueOf = (reply: Reply) =>
  reply.status === "success"
    ? Effect.succeed(reply.value)
    : Effect.fail(failure(reply.errorMessage.trim()));

/** The functions of the store with Alchemy's encoding: the JSON text of encodeState. */
const remoteOf = (api: FunctionApi) => {
  const run = (name: string, args: Record<string, string | undefined>) =>
    api.call(`state:${name}`, args).pipe(Effect.flatMap(valueOf));
  const strings = (name: string, args: Record<string, string>) =>
    run(name, args).pipe(Effect.flatMap(decode(Schema.Array(Schema.String), name)));
  const optional = (name: string, args: Record<string, string>) =>
    run(name, args).pipe(Effect.flatMap(decode(Schema.NullOr(Schema.String), name)));
  const encode = (value: unknown) => JSON.stringify(encodeState(value));
  return {
    listStacks: () => strings("stacks", {}),
    listStages: (stack: string) => strings("stages", { stack }),
    list: (r: { stack: string; stage: string }) =>
      strings("list", { stack: r.stack, stage: r.stage }),
    // Like Alchemy's own stores, the store gives back the state that it got.
    get: (r: { stack: string; stage: string; fqn: string }) =>
      optional("get", { stack: r.stack, stage: r.stage, fqn: r.fqn }).pipe(
        Effect.map((text): PersistedState | undefined =>
          text === null ? undefined : JSON.parse(text, reviveState),
        ),
      ),
    getReplacedResources: (r: { stack: string; stage: string }) =>
      strings("replaced", { stack: r.stack, stage: r.stage }).pipe(
        Effect.map((texts) =>
          texts.map((text): ReplacedResourceState => JSON.parse(text, reviveState)),
        ),
      ),
    getOutput: (r: { stack: string; stage: string }) =>
      optional("getOutput", { stack: r.stack, stage: r.stage }).pipe(
        Effect.map((text): unknown => (text === null ? undefined : JSON.parse(text, reviveState))),
      ),
    set: (r: { stack: string; stage: string; fqn: string; value: PersistedState }) =>
      run("set", { stack: r.stack, stage: r.stage, fqn: r.fqn, value: encode(r.value) }),
    delete: (r: { stack: string; stage: string; fqn: string }) =>
      run("remove", { stack: r.stack, stage: r.stage, fqn: r.fqn }),
    deleteStack: (r: { stack: string; stage?: string }) =>
      run("removeStack", { stack: r.stack, stage: r.stage }),
    setOutput: (r: { stack: string; stage: string; value: unknown }) =>
      run("setOutput", { stack: r.stack, stage: r.stage, value: encode(r.value) }),
  };
};

/** The version that the store answers, or undefined when the deployment has no `state:version`. */
const storeVersion = (api: FunctionApi) =>
  api
    .call("state:version", {})
    .pipe(
      Effect.flatMap((reply) =>
        reply.status === "error" && MISSING_FUNCTION.test(reply.errorMessage)
          ? Effect.succeed(undefined)
          : valueOf(reply).pipe(Effect.flatMap(decode(Schema.Number, "store version"))),
      ),
    );

/**
 * The functions directory of the store app, `src/store/convex` of this
 * package. This file is `src/State.ts` in a checkout and a chunk in `lib/`
 * in the installed package, which ships `src` too, so the directory is
 * `../src/store/convex` from either place. Its `convex.config.ts` mounts the
 * alchemyState component of `src/store/component`, inside the same push root.
 */
export const storeDirectory = () =>
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "store", "convex");

export interface StoreOptions {
  /** The store is in the team of its credential: ManagementApi.teamId. */
  readonly api: ManagementApiService;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  /** The key of the run is deleted when this scope closes. */
  readonly scope: Scope.Scope;
  /** The functions directory that an outdated store gets: {@link storeDirectory}. */
  readonly store: string;
}

/**
 * Pushes the functions directory `functions` (the store, or the store of a bridge root) to the
 * production deployment of the state project with the installed Convex CLI: no typecheck, no
 * codegen, the key only in the environment of the CLI.
 */
const pushStore = (
  options: StoreOptions,
  deployment: { readonly name: string; readonly deploymentUrl: string },
  functions: string,
  what: string,
) =>
  Effect.gen(function* () {
    const cli = yield* installedCli(join(functions, ".."));
    yield* Effect.logInfo(`Convex state: pushing ${what} to ${deployment.name}`);
    yield* withPushKey(options.api, deployment.name, PUSH_KEY_ACTIONS, (key) =>
      push(options.spawner, key, {
        deployment: deployment.name,
        url: deployment.deploymentUrl,
        rootDir: join(functions, ".."),
        source: {
          path: functions,
          command: [...cli, "deploy", "--typecheck", "disable", "--codegen", "disable"],
        },
        env: {},
        previousEnvNames: [],
        adopt: false,
        previewName: undefined,
      }),
    );
  });

/**
 * Finishes the sealing of the store, whatever an earlier run left: a new key when the store has
 * none, then a reseal unless one finished under the current key. A run reads this each time, so a
 * run that stopped after a push cannot leave rows in clear text. This client makes a key once, and
 * it never reads a key back. It answers false when a row could not be sealed.
 */
const ensureSealed = (
  options: StoreOptions,
  deployment: { readonly name: string; readonly deploymentUrl: string },
  functions: FunctionApi,
) =>
  Effect.gen(function* () {
    const { current, sealed } = yield* functions
      .call("state:sealing", {})
      .pipe(Effect.flatMap(valueOf), Effect.flatMap(decode(Sealing, "state:sealing")));
    if (current === null) {
      const keyId = newKeyId();
      yield* withPushKey(options.api, deployment.name, PUSH_KEY_ACTIONS, (key) =>
        writeVariables(deployment.deploymentUrl, key, [
          { name: stateKeyName(keyId), value: newKey() },
        ]),
      );
      yield* functions.call("state:chooseKey", { keyId }).pipe(Effect.flatMap(valueOf));
    }
    if (sealed) return true;
    const { failed } = yield* functions
      .call("state:reseal", {})
      .pipe(Effect.flatMap(valueOf), Effect.flatMap(decode(Resealed, "state:reseal")));
    if (failed.length > 0) {
      yield* Effect.logWarning(
        `Convex state: the store could not seal ${failed.join(", ")}. The next run tries again.`,
      );
    }
    return failed.length === 0;
  });

/** The reply of `bridge:cleanup`. */
const Cleanup = Schema.Struct({
  cursor: Schema.String,
  done: Schema.Boolean,
  removed: Schema.Number,
});

/** Runs `bridge:cleanup` page by page until the last page, from the first page. */
const cleanOutputs = (functions: FunctionApi) =>
  Effect.gen(function* () {
    let cursor: string | undefined;
    let removed = 0;
    for (;;) {
      const page = yield* functions
        .call("bridge:cleanup", { cursor })
        .pipe(Effect.flatMap(valueOf), Effect.flatMap(decode(Cleanup, "bridge:cleanup")));
      removed += page.removed;
      if (page.done) break;
      cursor = page.cursor;
    }
    if (removed > 0) {
      yield* Effect.logInfo(
        `Convex state: the upgrade deleted ${removed} output rows without a value.`,
      );
    }
  });

/** The relative import specifier of `target` in a module at `file`, with `/` on every system. */
const specifierOf = (file: string, target: string) => {
  const path = relative(dirname(file), target).split(sep).join("/");
  return path.startsWith(".") ? path : `./${path}`;
};

/**
 * Makes the bridge root of one run: `<package>/.store-bridge-<random>/`, a copy of `src/store` in
 * the installed package directory, so that it resolves the `convex` package of the store. The copy
 * takes the schema and the sealing of store version 7 from `src/store-bridge`, adds the cleanup
 * module `bridge` to the component and to the app, and answers the version below this one. So a
 * store with the bridge accepts the rows of store version 6 and older, and a run that stops after
 * the bridge push does every step again. Each written module re-exports a file of
 * `src/store-bridge`, which stays where the package installed it. Nothing shared changes, so
 * parallel runs share no edited file.
 */
const bridgeRoot = (store: string) =>
  Effect.tryPromise({
    try: async () => {
      const app = join(store, "..");
      const source = join(app, "..", "store-bridge");
      const root = await mkdtemp(join(app, "..", "..", ".store-bridge-"));
      await cp(app, root, { recursive: true });
      const write = (file: string, text: (from: (name: string) => string) => string) => {
        const path = join(root, file);
        return writeFile(
          path,
          text((name) => specifierOf(path, join(source, name))),
        );
      };
      await write(
        "component/schema.ts",
        (from) => `export { default } from "${from("schema.ts")}";\n`,
      );
      await write("component/bridge.ts", (from) => `export * from "${from("bridge.ts")}";\n`);
      await write("convex/sealing.ts", (from) => `export * from "${from("sealing.ts")}";\n`);
      await write("convex/bridge.ts", (from) => `export * from "${from("bridgeApp.ts")}";\n`);
      await write(
        "convex/version.ts",
        () => `export const STORE_VERSION = ${STORE_VERSION - 1};\n`,
      );
      return root;
    },
    catch: () =>
      failure("could not make the bridge root of the store upgrade in the package directory"),
  });

/** The attempts of one run at the upgrade of an older store. */
const UPGRADE_ATTEMPTS = 3;

/**
 * Upgrades a store that answers an older version, with the bridge root of {@link bridgeRoot}:
 * the bridge push, the cleanup pages, a sealing that must finish, the push of the store, and a new
 * read of the version. After a failed step, the version tells the next step: this version or a
 * newer one means that another run finished, else the run starts again with the bridge push. A
 * failed step is logged by its name only: a push error can quote a row.
 */
const upgradeStore = (
  options: StoreOptions,
  deployment: { readonly name: string; readonly deploymentUrl: string },
  functions: FunctionApi,
) =>
  Effect.acquireUseRelease(
    bridgeRoot(options.store),
    (root) =>
      Effect.gen(function* () {
        for (let attempt = 1; attempt <= UPGRADE_ATTEMPTS; attempt += 1) {
          yield* Effect.gen(function* () {
            yield* pushStore(
              options,
              deployment,
              join(root, "convex"),
              `the bridge to store version ${STORE_VERSION}`,
            ).pipe(Effect.mapError(() => "bridge push"));
            yield* cleanOutputs(functions).pipe(Effect.mapError(() => "cleanup"));
            const sealed = yield* ensureSealed(options, deployment, functions).pipe(
              Effect.mapError(() => "sealing"),
            );
            if (!sealed) return yield* Effect.fail("sealing");
            yield* pushStore(
              options,
              deployment,
              options.store,
              `the store version ${STORE_VERSION}`,
            ).pipe(Effect.mapError(() => "store push"));
          }).pipe(
            Effect.catch((step) =>
              Effect.logWarning(
                `Convex state: the ${step} of the upgrade to store version ${STORE_VERSION} failed (attempt ${attempt} of ${UPGRADE_ATTEMPTS}).`,
              ),
            ),
          );
          const version = yield* storeVersion(functions);
          if (version !== undefined && version >= STORE_VERSION) return version;
        }
        return yield* failure(
          `${deployment.name} did not upgrade to store version ${STORE_VERSION} in ${UPGRADE_ATTEMPTS} attempts. A run of an older version of this package can push its store in the meantime: upgrade every repository of the team to this version, and run again.`,
        );
      }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );

/**
 * Creates the state project of the team. Two first runs can both create one:
 * the run whose project is not the oldest deletes its own, which holds
 * nothing yet, and uses the oldest, so that every run ends on one store.
 */
const createStoreProject = (api: ManagementApiService, teamId: number) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `Convex state: creating the project ${STORE_PROJECT_NAME} in team ${teamId}`,
    );
    const created = yield* createProject(api, teamId, {
      name: STORE_PROJECT_NAME,
      deploymentType: "prod",
      deploymentRegion: undefined,
    });
    const all = yield* listProjectsByName(api, teamId, STORE_PROJECT_NAME);
    const oldest = all.reduce((a, b) => (b.id < a.id ? b : a), created);
    if (oldest.id === created.id) return created;
    yield* Effect.logInfo(
      `Convex state: another run created ${STORE_PROJECT_NAME} ${oldest.id} first; project ${created.id} is deleted again.`,
    );
    yield* absentAsUndefined(
      retryIdempotentWrite(
        api.requestVoid("delete project", (client) =>
          client.POST("/projects/{project_id}/delete", {
            params: { path: { project_id: created.id } },
          }),
        ),
      ),
    );
    return oldest;
  });

/**
 * The StateService over the `alchemy-state-store` project of the team: found or
 * created, its store pushed when it is missing or older, and read and
 * written with the keys of this run.
 */
export const makeConvexState = (options: StoreOptions) =>
  Effect.gen(function* () {
    const { api } = options;
    const teamId = yield* api.teamId;
    const found = yield* findProjectByName(api, teamId, STORE_PROJECT_NAME);
    const project = found ?? (yield* createStoreProject(api, teamId));
    const deployment = yield* prodDeploymentOf(api, project.id);
    if (deployment === undefined) {
      return yield* new ProductionDeploymentNotFound({ projectId: project.id });
    }

    // The keys of this run, deleted together when the scope closes. A call
    // that the current key no longer authorizes gets one new key and one
    // more attempt.
    const keys: Redacted.Redacted<string>[] = [];
    yield* Scope.addFinalizer(
      options.scope,
      Effect.suspend(() =>
        Effect.forEach(keys, (key) => deleteDeployKey(api, deployment.name, key), {
          discard: true,
        }),
      ),
    );
    const mint = createDeployKey(api, deployment.name, STORE_PROJECT_NAME, STORE_KEY_ACTIONS).pipe(
      Effect.map((key) => {
        keys.push(key);
        return makeFunctionApi(deployment.deploymentUrl, key);
      }),
      Effect.mapError((error) => failure(`no key for ${deployment.name}: ${error.message}`)),
    );
    let current = yield* mint;
    const functions: FunctionApi = {
      call: (path, args) =>
        current.call(path, args).pipe(
          Effect.catchIf(isUnauthorized, () =>
            mint.pipe(
              Effect.flatMap((next) => {
                current = next;
                return next.call(path, args);
              }),
            ),
          ),
        ),
    };

    let version = yield* storeVersion(functions);
    if (version === undefined || version < STORE_VERSION) {
      // Code without `state:version` is another app with the name of the store.
      if (version === undefined && deployment.lastDeployTime) {
        return yield* failure(
          `project ${STORE_PROJECT_NAME} (${project.id}) of team ${teamId} has code that is not the state store, and Convex.state does not push over it. Rename that project in the Convex dashboard.`,
        );
      }
      // Another run can push a newer store in the meantime: read again right
      // before the push. The push itself has no lock (see the design note).
      version = yield* storeVersion(functions);
      if (version === undefined) {
        // A deployment without code has no rows, so the store goes on it with no bridge.
        yield* pushStore(options, deployment, options.store, `the store version ${STORE_VERSION}`);
        version = yield* storeVersion(functions);
      } else if (version < STORE_VERSION) {
        version = yield* upgradeStore(options, deployment, functions);
      }
    }
    if (version !== STORE_VERSION) {
      return yield* failure(
        `${deployment.name} answers store version ${version ?? "none"}, and this package needs store version ${STORE_VERSION}.`,
      );
    }

    yield* ensureSealed(options, deployment, functions);

    const remote = remoteOf(functions);
    const service: StateService = {
      id: "convex",
      getVersion: () => Effect.succeed(STATE_STORE_VERSION),
      listStacks: remote.listStacks,
      listStages: remote.listStages,
      list: remote.list,
      get: remote.get,
      getReplacedResources: remote.getReplacedResources,
      getOutput: remote.getOutput,
      set: (request) => remote.set(request).pipe(Effect.as(request.value)),
      delete: (request) => remote.delete(request).pipe(Effect.asVoid),
      deleteStack: (request) => remote.deleteStack(request).pipe(Effect.asVoid),
      setOutput: (request) => remote.setOutput(request).pipe(Effect.as(request.value)),
    };
    return service;
  });

/**
 * Alchemy state in the `alchemy-state-store` project of the team of the credential: the team token
 * in CONVEX_ACCESS_TOKEN, which names its team, or the Convex CLI login, with the team of the
 * deployment that the CLI selected (CONVEX_DEPLOYMENT, see ManagementApi.teamId). The first use of
 * the run finds or creates the project and pushes the store when it is missing or older.
 * `alchemy plan` on another stack never touches Convex.
 */
export const state = (): Layer.Layer<State, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Layer.effect(
    State,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const scope = yield* Scope.Scope;
      // The stack's ConfigProvider, for the read of the token on first use.
      const context = yield* Effect.context<never>();
      return yield* Effect.cached(
        Effect.gen(function* () {
          const api = yield* ManagementApi.pipe(
            Effect.provide(ManagementApiLive().pipe(Layer.provide(fromConfig()))),
          );
          return yield* makeConvexState({ api, spawner, scope, store: storeDirectory() });
        }).pipe(Effect.provideContext(context), Effect.orDie),
      );
    }),
  );
