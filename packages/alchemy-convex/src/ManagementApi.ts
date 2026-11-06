// Effect wrapper around the official Convex platform client.
//
// `@convex-dev/platform` is an openapi-fetch client: every call resolves to
// `{ data, error, response }`. This service turns that into an Effect with one
// typed error, resolves credentials lazily, and validates the fields the
// provider relies on at runtime.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createDeploymentClient, createManagementClient } from "@convex-dev/platform";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Credentials, type ResolvedCredentials } from "./Credentials.ts";

export type ManagementClient = ReturnType<typeof createManagementClient>;
export type DeploymentClient = ReturnType<typeof createDeploymentClient>;

/** Shape of every openapi-fetch result we consume. */
export interface FetchResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
}

/**
 * One error for every control-plane and deployment call. Resources branch on
 * `status` (404 means absent for read and delete), so the class is load
 * bearing, not decorative.
 */
export class ConvexApiError extends Schema.TaggedError<ConvexApiError>()("ConvexApiError", {
  operation: Schema.String,
  status: Schema.Number,
  code: Schema.optionalKey(Schema.String),
  message: Schema.String,
}) {}

const ErrorBody = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
});

const toApiError = (operation: string, result: FetchResult<unknown>) => {
  const body = Schema.decodeUnknownSync(Schema.NullishOr(ErrorBody))(result.error ?? null);
  const code = body?.code;
  return new ConvexApiError({
    operation,
    status: result.response.status,
    ...(code === undefined ? {} : { code }),
    message: body?.message ?? `${operation} failed with HTTP ${result.response.status}`,
  });
};

export interface ManagementApiService {
  /** Run one management call with the resolved credentials. */
  readonly request: <T>(
    operation: string,
    run: (client: ManagementClient) => Promise<FetchResult<T>>,
  ) => Effect.Effect<T, ConvexApiError>;
  /** Run one management call whose success response has no body. */
  readonly requestVoid: (
    operation: string,
    run: (client: ManagementClient) => Promise<FetchResult<unknown>>,
  ) => Effect.Effect<void, ConvexApiError>;
  /** Run one deployment-scoped call authenticated with a deploy key. */
  readonly deploymentRequest: <T>(
    operation: string,
    deploymentUrlOrName: string,
    deployKey: Redacted.Redacted<string>,
    run: (client: DeploymentClient) => Promise<FetchResult<T>>,
  ) => Effect.Effect<T, ConvexApiError>;
  /**
   * The team of the credential. A team access token and an OAuth token of a
   * team name it (`GET /token_details`). The Convex CLI login answers 403
   * there, so its team is the team of the project of the deployment that the
   * Convex CLI selected (CONVEX_DEPLOYMENT). Read once for each service.
   */
  readonly teamId: Effect.Effect<number, ConvexApiError>;
  /**
   * True when a deploy key that Convex returned carries the token of the
   * Management API credential itself. With an OAuth token, create_deploy_key
   * and create_preview_deploy_key create no new key: they return the OAuth
   * token with a new prefix, and the part after "|" is the same. A delete of
   * that key would revoke the credential.
   */
  readonly isCredentialToken: (secret: string) => Effect.Effect<boolean>;
  /**
   * True when the Management API credential is an OAuth token, `team:<slug>|...`
   * or `project:...|...`. A team access token and the Convex CLI login have no
   * such prefix. Convex answers HTTP 400 to create_deploy_key with
   * `allowedActions` or `expiresAt` from an OAuth token.
   */
  readonly isOAuthCredential: Effect.Effect<boolean>;
  /**
   * The same calls with another bearer token, such as a preview deploy key,
   * which the Management API takes for the preview deployments of its project.
   */
  readonly withToken: (token: Redacted.Redacted<string>) => ManagementApiService;
}

/** The part of a Convex token after the first "|", or the whole value when it has none. */
const tokenPart = (value: string) => value.slice(value.indexOf("|") + 1);

export class ManagementApi extends Context.Service<ManagementApi, ManagementApiService>()(
  "@samebase/alchemy-convex/ManagementApi",
) {}

const attempt = <T>(operation: string, run: () => Promise<FetchResult<T>>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ConvexApiError({
        operation,
        status: 0,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

/** Reads `data` or fails with the HTTP status and the API's own code and message. */
export const settle = <T>(
  operation: string,
  run: () => Promise<FetchResult<T>>,
): Effect.Effect<T, ConvexApiError> =>
  attempt(operation, run).pipe(
    Effect.flatMap((result) =>
      result.response.ok && result.data !== undefined
        ? Effect.succeed(result.data)
        : Effect.fail(toApiError(operation, result)),
    ),
  );

/** For endpoints that answer with an empty body, such as delete calls. */
export const settleVoid = (
  operation: string,
  run: () => Promise<FetchResult<unknown>>,
): Effect.Effect<void, ConvexApiError> =>
  attempt(operation, run).pipe(
    Effect.flatMap((result) =>
      result.response.ok ? Effect.void : Effect.fail(toApiError(operation, result)),
    ),
  );

/**
 * True when an idempotent write can succeed on a new attempt:
 *
 * - A Convex write conflict. Two parallel update_environment_variables calls
 *   on one deployment gave HTTP 503 `OptimisticConcurrencyControlFailure`,
 *   "Data read or written in this mutation changed while it was being run",
 *   in a live run. The platform codes `OCC` and `WriteConflict` and the
 *   message "... changed while this mutation was being run ..." mean the same.
 * - Any other 5xx answer. Two parallel delete_preview_deploy_key calls on one
 *   project gave HTTP 500 `InternalServerError`, "Your request couldn't be
 *   completed. Try again later.", in a live run. The next attempt succeeded.
 */
export const isRetryableWriteError = (error: ConvexApiError): boolean =>
  error.code === "OptimisticConcurrencyControlFailure" ||
  error.code === "OCC" ||
  error.code === "WriteConflict" ||
  /changed while (it|this mutation) was being run/.test(error.message) ||
  error.status >= 500;

/**
 * Runs an idempotent write again after a retryable Convex error: at most
 * four more attempts, with exponential backoff from 100 ms and jitter. Other
 * errors fail at once, and so does the last retryable error. Use it only for
 * a write that has the same result when it runs twice, such as setting a
 * value or deleting by id. Never for a create that does not check first.
 */
export const retryIdempotentWrite = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.retry({
      while: (error: E) => error instanceof ConvexApiError && isRetryableWriteError(error),
      times: 4,
      schedule: Schedule.exponential("100 millis").pipe(Schedule.jittered),
    }),
  );

/** Turns a 404 into `undefined` so read and delete stay idempotent. */
export const absentAsUndefined = <A, R>(
  effect: Effect.Effect<A, ConvexApiError, R>,
): Effect.Effect<A | undefined, ConvexApiError, R> =>
  effect.pipe(
    Effect.catchIf(
      (error) => error.status === 404,
      () => Effect.succeed(undefined),
    ),
  );

/** GET /deployments/{name}: the project of the deployment. */
const DeploymentProject = Schema.Struct({ projectId: Schema.Number });

/** GET /projects/{id}: the team of the project. */
const ProjectTeam = Schema.Struct({ teamId: Schema.Number });

/** A folder's `.convex/local/default/config.json`, as the Convex CLI writes it. */
const LocalConfig = Schema.Struct({
  deploymentName: Schema.String,
  ports: Schema.Struct({ cloud: Schema.Number, site: Schema.Number }),
  adminKey: Schema.String,
  /** The project of a logged-in local deployment. An anonymous one has none. */
  cloudProjectId: Schema.Number,
});

export interface LocalDeploymentInfo {
  /** Such as `local-nicu-samebase_com-1`. */
  readonly name: string;
  /** The client URL, `http://127.0.0.1:<cloud port>`. */
  readonly url: string;
  /** The HTTP actions URL, `http://127.0.0.1:<site port>`, the local `CONVEX_SITE_URL`. */
  readonly siteUrl: string;
  /** The Convex project that the deployment belongs to. */
  readonly projectId: number;
  readonly adminKey: Redacted.Redacted<string>;
}

/**
 * The logged-in local deployment of `rootDir`, which `npx convex deployment create
 * <team>:<project>:local` makes: undefined when the folder has none, or only an anonymous one, which
 * belongs to no project.
 */
export const readLocalDeployment = (rootDir = "."): LocalDeploymentInfo | undefined => {
  let raw: unknown;
  try {
    raw = JSON.parse(
      readFileSync(join(rootDir, ".convex", "local", "default", "config.json"), "utf8"),
    );
  } catch {
    return undefined;
  }
  const config = Option.getOrUndefined(Schema.decodeUnknownOption(LocalConfig)(raw));
  if (config === undefined || !config.deploymentName.startsWith("local-")) return undefined;
  return {
    name: config.deploymentName,
    url: `http://127.0.0.1:${config.ports.cloud}`,
    siteUrl: `http://127.0.0.1:${config.ports.site}`,
    projectId: config.cloudProjectId,
    adminKey: Redacted.make(config.adminKey),
  };
};

/**
 * The deployment that the Convex CLI selected: CONVEX_DEPLOYMENT in the environment or in
 * `.env.local` of the working directory, as `npx convex dev` writes it. A cloud deployment
 * (`dev:happy-animal-123`) by its name; a logged-in local deployment (`local:local-team-app`) by the
 * project in the working directory's `.convex/local/default`, when that is the selected one.
 * Undefined when neither has it, and for an anonymous deployment, which is in no project.
 */
const selectedDeployment = ():
  | { readonly kind: "cloud"; readonly name: string }
  | { readonly kind: "local"; readonly projectId: number }
  | undefined => {
  const fromEnv = process.env["CONVEX_DEPLOYMENT"];
  const value =
    fromEnv !== undefined && fromEnv !== ""
      ? fromEnv
      : (() => {
          try {
            return parseEnv(readFileSync(".env.local", "utf8"))["CONVEX_DEPLOYMENT"];
          } catch {
            return undefined;
          }
        })();
  const localName = /^local:(local-[^:]+)$/.exec(value ?? "")?.[1];
  if (localName !== undefined) {
    const local = readLocalDeployment();
    return local?.name === localName ? { kind: "local", projectId: local.projectId } : undefined;
  }
  const name = /^(?:(?:dev|prod|preview):)?([^:]+)$/.exec(value ?? "")?.[1];
  return name === undefined || name.startsWith("anonymous-") ? undefined : { kind: "cloud", name };
};

/** GET /token_details: the team of a team token, or the project of a project token. */
const TokenDetails = Schema.Union([
  Schema.Struct({ type: Schema.Literal("teamToken"), teamId: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("projectToken"), projectId: Schema.Number }),
]);

/** The service for one way to get the bearer token. */
const makeService = (source: Effect.Effect<ResolvedCredentials>): ManagementApiService => {
  // An HTTP header drops the white space around a token, so every use here takes the value that
  // Convex sees. isCredentialToken must compare that value: a miss deletes an OAuth credential.
  const credentials = source.pipe(
    Effect.map((resolved) => ({
      ...resolved,
      accessToken: Redacted.make(Redacted.value(resolved.accessToken).trim()),
    })),
  );

  const client = Effect.cached(
    credentials.pipe(
      Effect.map((resolved) => createManagementClient(Redacted.value(resolved.accessToken))),
    ),
  ).pipe(Effect.flatten);

  const request: ManagementApiService["request"] = (operation, run) =>
    client.pipe(Effect.flatMap((c) => settle(operation, () => run(c))));

  const requestVoid: ManagementApiService["requestVoid"] = (operation, run) =>
    client.pipe(Effect.flatMap((c) => settleVoid(operation, () => run(c))));

  const deploymentRequest: ManagementApiService["deploymentRequest"] = (
    operation,
    deploymentUrlOrName,
    deployKey,
    run,
  ) =>
    settle(operation, () =>
      run(createDeploymentClient(deploymentUrlOrName, Redacted.value(deployKey))),
    );

  // Measured: a team access token answers `GET /token_details` with its
  // team id and gets HTTP 403 from the dashboard's team list; the Convex CLI
  // login answers the team list and gets HTTP 403 `NotOAuthTeamToken` from
  // token_details. Read once for each service.
  // `Effect.cached` only allocates the cache, so runSync makes one for this service.
  const tokenDetails = Effect.runSync(
    Effect.cached(
      request("get token details", (c) => c.GET("/token_details")).pipe(
        Effect.map((body) => Schema.decodeUnknownSync(TokenDetails)(body)),
        Effect.catchIf(
          (error) => error.status === 403,
          () => Effect.succeed(undefined),
        ),
      ),
    ),
  );

  const teamId: ManagementApiService["teamId"] = Effect.runSync(
    Effect.cached(
      Effect.gen(function* () {
        const details = yield* tokenDetails;
        if (details?.type === "teamToken") return details.teamId;
        if (details?.type === "projectToken") {
          return yield* new ConvexApiError({
            operation: "resolve team",
            status: 403,
            message: `the access token belongs to project ${details.projectId}, and a project token cannot create projects. Use a team access token.`,
          });
        }
        // The Convex CLI login names no team, but the deployment that `npx convex dev` selected
        // belongs to a project, and the project to a team.
        const selected = selectedDeployment();
        if (selected === undefined) {
          return yield* new ConvexApiError({
            operation: "resolve team",
            status: 0,
            message:
              "the Convex CLI login names no team, and no deployment of a project is selected. Run `npx convex dev` once with a cloud deployment, or create a local one with `npx convex deployment create <team>:<project>:local --select`.",
          });
        }
        const projectId =
          selected.kind === "local"
            ? selected.projectId
            : Schema.decodeUnknownSync(DeploymentProject)(
                yield* request("get deployment", (c) =>
                  c.GET("/deployments/{deployment_name}", {
                    params: { path: { deployment_name: selected.name } },
                  }),
                ),
              ).projectId;
        const project = yield* request("get project", (c) =>
          c.GET("/projects/{project_id}", { params: { path: { project_id: projectId } } }),
        );
        return Schema.decodeUnknownSync(ProjectTeam)(project).teamId;
      }),
    ),
  );

  const isCredentialToken: ManagementApiService["isCredentialToken"] = (secret) =>
    credentials.pipe(
      Effect.map(
        (resolved) => tokenPart(Redacted.value(resolved.accessToken)) === tokenPart(secret),
      ),
    );

  const isOAuthCredential: ManagementApiService["isOAuthCredential"] = credentials.pipe(
    Effect.map((resolved) => /^(team|project):/.test(Redacted.value(resolved.accessToken))),
  );

  const withToken: ManagementApiService["withToken"] = (token) =>
    makeService(Effect.succeed({ accessToken: token, source: "explicit" }));

  return {
    request,
    requestVoid,
    deploymentRequest,
    teamId,
    isCredentialToken,
    isOAuthCredential,
    withToken,
  };
};

export const ManagementApiLive = (): Layer.Layer<ManagementApi, never, Credentials> =>
  Layer.effect(
    ManagementApi,
    Effect.gen(function* () {
      const credentials = yield* Credentials;
      return makeService(credentials.accessToken);
    }),
  );
