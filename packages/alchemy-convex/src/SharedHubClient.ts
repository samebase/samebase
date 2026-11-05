// Convex.SharedHubClient: one deployment of an app as a client of the central identity hub, for an
// app that deploys in its own GitHub Actions run, on any host.
//
// The run asks the hub for a new client with a GitHub OIDC token, so the stack needs no key and no
// Samebase account. The token names the repository. The hub reads `/samebase-verification.json` at
// the origin of the return address, which must name the same repository, and registers the client on
// that address. The answer holds the client's own registration access token (RFC 7591), and each
// later deploy reads the client on the hub with that token (RFC 7592). The hub keeps only hashes, so
// the state is the only record of the secret and the token.
//
// The answer to a production registration also holds the app's initial access token (RFC 7591
// section 1.2) and the repository id. The state of stage `prod` keeps them. On a laptop,
// `alchemy-convex hub-client --shared` reads that row with the Convex login of the team and asks the
// hub for a development client with the token: see `registerSharedDevelopmentClient`.
//
// A push removes a variable that a deploy stops passing, so a failure here must not drop working
// variables or stop the deploy. A renewal that fails keeps the saved values. Only a client that
// cannot work asks for a new one: it is gone, or it has another return address. If that request
// fails, the run gives the off values, so the app has guest sign-in and not a broken button.
// The off values are the `no-hub` variables of a checkout without a hub: Convex needs the variables,
// and the app hides the button for this client ID.
//
// No text in this file quotes an answer or a fetch error, so no log line can hold a secret.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { reviveState } from "alchemy/State";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { DeploymentRow } from "./Deployment.ts";
import { ManagementApi, type ManagementApiService } from "./ManagementApi.ts";
import { findProjectByName, getProjectById, prodDeploymentOf } from "./Project.ts";
import type { Providers } from "./Providers.ts";
import { withPushKey } from "./Push.ts";
import { makeFunctionApi, STORE_PROJECT_NAME } from "./State.ts";

/** A hung service must not hold a deploy: the time limit of one request. */
const REQUEST_TIMEOUT_MS = 30_000;

/** The variables of a deployment without a hub client, as the starter writes them. */
const OFF_VALUES = { issuer: "http://127.0.0.1:1", clientId: "no-hub", clientSecret: "no-hub" };

/** Where a run asks for a new client. */
const hubClientsUrl = () => `${process.env["HUB_URL"] ?? "https://auth.samebase.com"}/hub-clients`;

export interface SharedHubClientProps {
  /** The stable name of the app, set once in the stack. */
  readonly app: string;
  /**
   * The return address of the hub's sign-ins, such as `${site.siteUrl}/auth/hub/callback`: an https
   * URL whose origin serves `/samebase-verification.json` with the numeric GitHub id of this
   * repository, `{ "repository": "123" }`. It can come from a resource that this run creates.
   */
  readonly redirectUri: string;
  readonly deploymentType: "production" | "preview";
  /** Recorded on the hub's client, such as the commit. The hub records "unknown" without it. */
  readonly softwareVersion?: string;
}

export interface SharedHubClientAttributes {
  /** `off`: no client, and the values below are the off values. */
  readonly status: "on" | "off" | "suspended";
  /** The issuer of the hub, which the deployment names to sign in. */
  readonly issuer: string;
  readonly clientId: string;
  /** Returned only at registration. */
  readonly clientSecret: Redacted.Redacted<string>;
  /** Returned only at registration. It reads and deletes this client on the hub, and nothing else. */
  readonly registrationAccessToken: Redacted.Redacted<string>;
  readonly registrationClientUri: string;
  readonly deploymentType: "production" | "preview";
  /** The return address that the client serves. Empty for the off values. */
  readonly redirectUri: string;
  /**
   * Returned only at a production registration (RFC 7591 section 1.2). It registers development
   * clients of this app, such as `alchemy-convex hub-client --shared` on a laptop. Empty for a
   * preview and for the off values.
   */
  readonly initialAccessToken: Redacted.Redacted<string>;
  /** The numeric GitHub id of the repository, with the initial access token. Empty without it. */
  readonly repository: string;
}

export type SharedHubClient = Resource<
  "IdentityHub.SharedClient",
  SharedHubClientProps,
  SharedHubClientAttributes,
  never,
  Providers
>;
export const SharedHubClient = Resource<SharedHubClient>("IdentityHub.SharedClient");

/** One request gave no usable answer. The reason holds no secret. */
class SharedHubClientFailed extends Schema.TaggedError<SharedHubClientFailed>()(
  "SharedHubClientFailed",
  { reason: Schema.String },
) {}

const OidcToken = Schema.Struct({ value: Schema.NonEmptyString });

/** The 201 answer of `POST /hub-clients`. */
const NewClient = Schema.Struct({
  issuer: Schema.NonEmptyString,
  client_id: Schema.NonEmptyString,
  client_secret: Schema.NonEmptyString,
  registration_access_token: Schema.NonEmptyString,
  registration_client_uri: Schema.NonEmptyString,
  redirect_uri: Schema.NonEmptyString,
  /** The terms of the shared sign-in service, which the log shows once, for the new client. */
  terms: Schema.NonEmptyString,
  /** Only in the answer to a production registration with the GitHub token. */
  initial_access_token: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d+$/))),
});

/** The other answers of `POST /hub-clients`, by status. */
const REFUSALS: Readonly<Record<number, string>> = {
  400: "the identity hub refused the request: the return address must be https on a DNS name, and the app name at most 64 characters",
  401: "the identity hub refused the GitHub OIDC token",
  403: "the identity hub does not allow this repository or return address",
  404: "the identity hub has no /hub-clients",
  429: "the identity hub limits new clients",
  502: "GitHub's keys are not available to the identity hub",
};

/** The reasons of a 403 that a log line shows. Any other text of the answer is never logged. */
const NOT_ALLOWED = new Map([
  ["paused", "the identity hub pauses new clients of third-party apps"],
  ["run_not_allowed", "the identity hub gives clients only to runs of main and of pull requests"],
  ["blocked", "Samebase blocked this repository or its owner"],
  ["suspended", "the identity hub suspended this repository"],
  ["too_many_apps", "the repository has as many apps on the identity hub as it may"],
  ["too_many_clients", "the app has as many clients on the identity hub as it may"],
  ["app_taken", "the app's name belongs to another app on the identity hub"],
  ["host_unreachable", "the identity hub could not reach the host of the return address"],
  [
    "verification_file_missing",
    "the host of the return address does not serve /samebase-verification.json",
  ],
  ["verification_file_invalid", "/samebase-verification.json on the host holds no repository id"],
  ["repository_mismatch", "/samebase-verification.json on the host names another repository"],
  ["app_mismatch", "the initial access token belongs to another app on the identity hub"],
]);

/** The windows of a 429, by the name that the answer gives. */
const RATE_LIMITED = new Map([
  ["repository", "the identity hub gives one repository at most 30 new clients an hour"],
  ["owner", "the identity hub gives one owner at most 100 new clients an hour"],
  ["new_owners", "the identity hub takes at most 50 new owners an hour"],
]);

const Refusal = Schema.Struct({ reason: Schema.String });
const RateLimited = Schema.Struct({ window: Schema.String });

/** The text of a refusal: a known reason of a 403 or window of a 429, else the text of its status. */
const refusalOf = (status: number, body: unknown) => {
  const known =
    status === 403
      ? NOT_ALLOWED.get(
          Option.getOrUndefined(Schema.decodeUnknownOption(Refusal)(body))?.reason ?? "",
        )
      : status === 429
        ? RATE_LIMITED.get(
            Option.getOrUndefined(Schema.decodeUnknownOption(RateLimited)(body))?.window ?? "",
          )
        : undefined;
  return known ?? REFUSALS[status] ?? "the identity hub refused the request";
};

const send = (who: string, url: string, token: string, init: { method: string; body?: string }) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => undefined);
      return { status: response.status, body };
    },
    catch: () => new SharedHubClientFailed({ reason: `${who} gave no answer` }),
  });

const decode =
  <S extends Schema.Codec<unknown, unknown>>(schema: S, who: string) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(() => new SharedHubClientFailed({ reason: `${who} gave a bad answer` })),
    );

/** The OIDC token of this run, read right before the call, because it lives for minutes only. */
const readOidcToken = (requestUrl: string, requestToken: string) =>
  Effect.gen(function* () {
    const { body, status } = yield* send(
      "GitHub",
      `${requestUrl}&audience=samebase`,
      requestToken,
      { method: "GET" },
    );
    if (status !== 200) {
      return yield* new SharedHubClientFailed({
        reason: `GitHub gave no OIDC token (HTTP ${status})`,
      });
    }
    return (yield* decode(OidcToken, "GitHub")(body)).value;
  });

const requestNewClient = (props: SharedHubClientProps, requestUrl: string, requestToken: string) =>
  Effect.gen(function* () {
    const token = yield* readOidcToken(requestUrl, requestToken);
    const { body, status } = yield* send("The identity hub", hubClientsUrl(), token, {
      method: "POST",
      body: JSON.stringify({
        app: props.app,
        redirectUri: props.redirectUri,
        softwareVersion: props.softwareVersion ?? "unknown",
      }),
    });
    if (status !== 201) {
      return yield* new SharedHubClientFailed({
        reason: `${refusalOf(status, body)} (HTTP ${status})`,
      });
    }
    const client = yield* decode(NewClient, "The identity hub")(body);
    yield* Effect.logInfo(
      `Convex.SharedHubClient: ${props.app} on ${client.redirect_uri} has a new client of the identity hub. Its use is under ${client.terms}.`,
    );
    return {
      status: "on" as const,
      issuer: client.issuer,
      clientId: client.client_id,
      clientSecret: Redacted.make(client.client_secret),
      registrationAccessToken: Redacted.make(client.registration_access_token),
      registrationClientUri: client.registration_client_uri,
      deploymentType: props.deploymentType,
      redirectUri: client.redirect_uri,
      initialAccessToken: Redacted.make(client.initial_access_token ?? ""),
      repository: client.repository ?? "",
    };
  });

/** A new client, or `saved`, or the off values. `saved` holds no off values. */
const newClient = (props: SharedHubClientProps) => {
  const label = `Convex.SharedHubClient: ${props.app} on ${props.redirectUri} deploys without the hub`;
  const off: SharedHubClientAttributes = {
    status: "off",
    issuer: OFF_VALUES.issuer,
    clientId: OFF_VALUES.clientId,
    clientSecret: Redacted.make(OFF_VALUES.clientSecret),
    registrationAccessToken: Redacted.make(""),
    registrationClientUri: "",
    deploymentType: props.deploymentType,
    redirectUri: "",
    initialAccessToken: Redacted.make(""),
    repository: "",
  };
  const requestUrl = process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  const requestToken = process.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"];
  // A laptop, or another CI. In a workflow, `id-token: write` gives both, so a workflow without them
  // is a mistake to show, not a normal run.
  if (!requestUrl || !requestToken) {
    return (
      process.env["GITHUB_ACTIONS"] === "true"
        ? Effect.logWarning(`${label}: this workflow needs the permission id-token: write.`)
        : Effect.logInfo(`${label}: this run has no GitHub OIDC token.`)
    ).pipe(Effect.as(off));
  }
  return requestNewClient(props, requestUrl, requestToken).pipe(
    Effect.catchTag("SharedHubClientFailed", (error) =>
      Effect.logWarning(`${label}: ${error.reason}. The next deploy asks again.`).pipe(
        Effect.as(off),
      ),
    ),
  );
};

/**
 * The token fields of saved attributes. A row of 0.25 and earlier has neither, and they stay empty
 * until the next production registration.
 */
const StoredToken = Schema.Struct({
  initialAccessToken: Schema.optionalKey(Schema.Redacted(Schema.String)),
  repository: Schema.optionalKey(Schema.String),
});

/** The client after a read on the hub, or undefined when the hub says that the client is gone. */
const renew = (stored: SharedHubClientAttributes) => {
  const { initialAccessToken = Redacted.make(""), repository = "" } =
    Schema.decodeUnknownSync(StoredToken)(stored);
  const saved = { ...stored, initialAccessToken, repository };
  return Effect.gen(function* () {
    const { status } = yield* send(
      "The identity hub",
      saved.registrationClientUri,
      Redacted.value(saved.registrationAccessToken),
      { method: "GET" },
    );
    switch (status) {
      case 200:
        return { ...saved, status: "on" as const };
      case 401:
        return undefined;
      case 403:
        yield* Effect.logWarning(
          `Convex.SharedHubClient: the hub suspended the client of ${saved.redirectUri}. It keeps its values, and nobody can sign in with it.`,
        );
        return { ...saved, status: "suspended" as const };
      default:
        return yield* new SharedHubClientFailed({
          reason: `The identity hub answered HTTP ${status}`,
        });
    }
  }).pipe(
    Effect.catchTag("SharedHubClientFailed", (error) =>
      Effect.logWarning(
        `Convex.SharedHubClient: ${saved.redirectUri} keeps the saved client: ${error.reason}.`,
      ).pipe(Effect.as(saved)),
    ),
  );
};

export const SharedHubClientProvider = () =>
  Provider.succeed(SharedHubClient, {
    // Always an update, so that each deploy reaches the hub. No attribute is stable, so a push
    // reads the values that this run ended with. The same values cause no other push.
    diff: ({ news }) =>
      Effect.succeed(isResolved(news) ? ({ action: "update" } as const) : undefined),

    read: ({ output }) => Effect.succeed(output),

    reconcile: Effect.fn(function* ({ news, output }) {
      const saved = output?.status === "off" ? undefined : output;
      const renewed = saved?.redirectUri === news.redirectUri ? yield* renew(saved) : undefined;
      return renewed ?? (yield* newClient(news));
    }),

    // A failed delete does not stop a destroy: the removal date of a preview client cleans it up.
    // A destroy can leave a production deployment running, so its client stays.
    delete: ({ output }) =>
      output.deploymentType === "production" || output.status === "off"
        ? Effect.void
        : Effect.gen(function* () {
            const { status } = yield* send(
              "The identity hub",
              output.registrationClientUri,
              Redacted.value(output.registrationAccessToken),
              { method: "DELETE" },
            );
            // 401: the client is gone already.
            if (status !== 204 && status !== 401) {
              return yield* new SharedHubClientFailed({
                reason: `The identity hub answered HTTP ${status}`,
              });
            }
          }).pipe(
            Effect.catchTag("SharedHubClientFailed", (error) =>
              Effect.logWarning(
                `Convex.SharedHubClient: the client of ${output.redirectUri} stays on the hub until its removal date: ${error.reason}.`,
              ),
            ),
          ),
  });

export interface SharedDevelopmentClientOptions {
  /** The stack of the app, the repository `owner/name`. Its stage `prod` holds the token. */
  readonly stack: string;
  readonly app: string;
  /** The path of the hub's callback after the site URL of the deployment. */
  readonly callbackPath: string;
  /** Prefix of the five deployment variables. */
  readonly envPrefix?: string;
  /** The Convex team, a slug or an id, whose state store holds the stack. */
  readonly team?: string;
  /** The directory of the app. */
  readonly cwd: string;
  /** Runs the Convex CLI on the deployment of `cwd`, and answers its output. */
  readonly convex: (args: readonly string[], input?: string) => string;
}

/** The logical id of the client in the stack of the starter. */
const CLIENT_FQN = "HubClient";

/** The one action that `state:get` needs. */
const READ_KEY_ACTIONS = ["deployment:functions:runInternalQueries"] as const;

/** `CONVEX_DEPLOYMENT` of `.env.local` for a cloud development deployment, such as `dev:happy-otter-123`. */
const CLOUD_DEPLOYMENT = /^CONVEX_DEPLOYMENT=(?:dev:)?([a-z0-9]+(?:-[a-z0-9]+)*)[ \t]*(?:#.*)?$/m;

/** The client row of stage `prod` with a token. A row without one fails to decode. */
const SavedToken = Schema.Struct({
  resourceType: Schema.Literal("IdentityHub.SharedClient"),
  attr: Schema.Struct({
    initialAccessToken: Schema.Redacted(Schema.NonEmptyString),
    repository: Schema.NonEmptyString,
  }),
});

/** The part of a client's own record (RFC 7592) that a renewal compares. */
const ClientRecord = Schema.Struct({ redirect_uris: Schema.Array(Schema.String) });

/**
 * The directory whose `.env.local` selects the cloud development deployment of `cwd`. A linked git
 * worktree runs a local backend, so the main checkout, the parent of the common git directory,
 * selects it.
 */
const selectingDirectory = (cwd: string) =>
  Effect.try({
    try: () =>
      // The prefix is the path of `cwd` in the checkout, and an empty line at its root.
      execFileSync(
        "git",
        ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-prefix"],
        { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).split(/\r?\n/),
    catch: () => undefined,
  }).pipe(
    Effect.map(([gitDir, commonDir, prefix = ""]) =>
      gitDir === undefined || commonDir === undefined || gitDir === commonDir
        ? cwd
        : join(dirname(commonDir), prefix),
    ),
    Effect.orElseSucceed(() => cwd),
  );

/** The team of the cloud development deployment that `.env.local` selects, or undefined. */
const teamOfSelectedDeployment = (api: ManagementApiService, cwd: string) =>
  Effect.gen(function* () {
    const directory = yield* selectingDirectory(cwd);
    const text = yield* Effect.tryPromise(() =>
      readFile(join(directory, ".env.local"), "utf8"),
    ).pipe(Effect.orElseSucceed(() => ""));
    const name = CLOUD_DEPLOYMENT.exec(text)?.[1];
    if (name === undefined) return undefined;
    const { projectId } = yield* api
      .request("get deployment", (client) =>
        client.GET("/deployments/{deployment_name}", {
          params: { path: { deployment_name: name } },
        }),
      )
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(DeploymentRow)));
    return (yield* getProjectById(api, projectId))?.teamId;
  });

/**
 * The initial access token and the repository id in the client row of stage `prod` of `stack`, or
 * undefined. It reads the row with the store's own `state:get` and a key that runs internal queries
 * only. It never builds `Convex.state()`, which can create or upgrade the store.
 */
const readSavedToken = (api: ManagementApiService, team: string | number, stack: string) =>
  Effect.gen(function* () {
    const project = yield* findProjectByName(
      api,
      yield* api.resolveTeamId(team),
      STORE_PROJECT_NAME,
    );
    const deployment = project === undefined ? undefined : yield* prodDeploymentOf(api, project.id);
    if (deployment === undefined) return undefined;
    const reply = yield* withPushKey(api, deployment.name, READ_KEY_ACTIONS, (key) =>
      makeFunctionApi(deployment.deploymentUrl, key).call("state:get", {
        stack,
        stage: "prod",
        fqn: CLIENT_FQN,
      }),
    );
    if (reply.status === "error") {
      return yield* new SharedHubClientFailed({ reason: reply.errorMessage.trim() });
    }
    const text = yield* decode(Schema.NullOr(Schema.String), "The state store")(reply.value);
    if (text === null) return undefined;
    const row = yield* Effect.try({
      try: (): unknown => JSON.parse(text, reviveState),
      catch: () => new SharedHubClientFailed({ reason: "the state store gave a bad row" }),
    });
    return Option.getOrUndefined(Schema.decodeUnknownOption(SavedToken)(row))?.attr;
  });

/** What the hub says about the client that the variables name. */
const readClient = (uri: string, token: string, callbackUrl: string) =>
  Effect.gen(function* () {
    const { body, status } = yield* send("The identity hub", uri, token, { method: "GET" });
    switch (status) {
      case 200: {
        const record = yield* decode(ClientRecord, "The identity hub")(body);
        return record.redirect_uris[0] === callbackUrl ? "renewed" : "moved";
      }
      case 401:
        return "gone";
      case 403:
        return "stopped";
      default:
        return yield* new SharedHubClientFailed({
          reason: `the identity hub answered HTTP ${status}`,
        });
    }
  });

/**
 * `alchemy-convex hub-client --shared`: a development client of an app on the central identity hub,
 * for `pnpm run dev` on a laptop, with the initial access token that the stack saved at the
 * production registration (RFC 133). Run it after the first push of each dev start. Answers the one
 * line to print. It fails only for a defect: a refusal, a failed request, or no token keeps the
 * variables and answers why.
 *
 * 1. The team: `team`, else `CONVEX_TEAM_ID`, else the team of the selected cloud development
 *    deployment.
 * 2. The five variables name a client: the hub renews it on a read with its own token (RFC 7592). A
 *    client on another address, or one that the hub no longer has, gets a new client. A client that
 *    the hub stopped gets the off values.
 * 3. The token from the client row of stage `prod`, the repository id on an https site, and a new
 *    client, in one `env set --force`.
 *
 * The secret and both tokens reach the Convex CLI on standard input, never in its arguments, and no
 * line holds them.
 */
export const registerSharedDevelopmentClient = (options: SharedDevelopmentClientOptions) =>
  Effect.gen(function* () {
    const { convex } = options;
    const api = yield* ManagementApi;
    const named = options.team ?? process.env["CONVEX_TEAM_ID"];
    const team =
      named !== undefined && named !== ""
        ? named
        : yield* teamOfSelectedDeployment(api, options.cwd);
    if (team === undefined) {
      return "No Convex team for Google sign-in on this laptop: set CONVEX_TEAM_ID, or select a cloud development deployment.";
    }

    const prefix = options.envPrefix ?? "HUB";
    const siteUrl = yield* decode(
      Schema.fromJsonString(Schema.String),
      "The deployment",
    )(convex(["run", "--inline-query", "process.env.CONVEX_SITE_URL"]));
    const callbackUrl = `${siteUrl.replace(/\/$/, "")}${options.callbackPath}`;

    const names = convex(["env", "list", "--names-only"]).split(/\r?\n/);
    const variables = ["ISSUER", "CLIENT_ID", "CLIENT_SECRET", "REGISTRATION_URI"].map(
      (name) => `${prefix}_${name}`,
    );
    const tokenVariable = `${prefix}_REGISTRATION_TOKEN`;
    if (
      [...variables, tokenVariable].every((name) => names.includes(name)) &&
      convex(["env", "get", `${prefix}_CLIENT_ID`]) !== OFF_VALUES.clientId
    ) {
      const client = yield* readClient(
        convex(["env", "get", `${prefix}_REGISTRATION_URI`]),
        convex(["env", "get", tokenVariable]),
        callbackUrl,
      );
      if (client === "renewed") return "Hub client renewed.";
      if (client === "stopped") {
        convex(
          ["env", "set", "--force"],
          `${prefix}_ISSUER='${OFF_VALUES.issuer}'\n${prefix}_CLIENT_ID='${OFF_VALUES.clientId}'\n${prefix}_CLIENT_SECRET='${OFF_VALUES.clientSecret}'\n`,
        );
        convex(["env", "remove", `${prefix}_REGISTRATION_URI`]);
        convex(["env", "remove", tokenVariable]);
        return "The identity hub stopped the hub client of this laptop (HTTP 403), so the laptop has guest sign-in.";
      }
    }

    const saved = yield* readSavedToken(api, team, options.stack);
    if (saved === undefined) return "Deploy to main once for Google sign-in on this laptop.";
    if (new URL(siteUrl).protocol === "https:") {
      // The hub reads /samebase-verification.json of an https site, which serves this variable.
      convex(["env", "set", "SAMEBASE_REPOSITORY_ID", saved.repository]);
    }
    const { body, status } = yield* send(
      "The identity hub",
      hubClientsUrl(),
      Redacted.value(saved.initialAccessToken),
      {
        method: "POST",
        body: JSON.stringify({
          app: options.app,
          redirectUri: callbackUrl,
          softwareVersion: new URL(siteUrl).host,
        }),
      },
    );
    if (status !== 201) {
      const reason =
        status === 401
          ? "the identity hub refused the initial access token of the app"
          : refusalOf(status, body);
      return `The hub client keeps its values: ${reason} (HTTP ${status}).`;
    }
    const client = yield* decode(NewClient, "The identity hub")(body);
    // One request, so that an interrupted run cannot leave half a client. `--force` replaces the
    // values of an earlier one.
    convex(
      ["env", "set", "--force"],
      `${prefix}_ISSUER='${client.issuer}'\n${prefix}_CLIENT_ID='${client.client_id}'\n${prefix}_CLIENT_SECRET='${client.client_secret}'\n${prefix}_REGISTRATION_URI='${client.registration_client_uri}'\n${tokenVariable}='${client.registration_access_token}'\n`,
    );
    return `Hub client registered for ${callbackUrl}.`;
  }).pipe(
    // A dev start goes on after any failure. The text of a failure holds no secret: a request of
    // this file names no answer, and the Convex CLI gets no secret in its arguments.
    Effect.catchCause((cause) => {
      const error = Cause.squash(cause);
      const reason =
        error instanceof SharedHubClientFailed
          ? error.reason
          : error instanceof Error
            ? error.message
            : "an unknown failure";
      return Effect.succeed(`The hub client keeps its values: ${reason}.`);
    }),
  );
