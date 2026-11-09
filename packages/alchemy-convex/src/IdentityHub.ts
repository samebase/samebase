// IdentityHub.Client: one deployment of an app as a client of the identity hub that the stack
// names, for an app that deploys in its own GitHub Actions run, on any host, and in development as a
// stage of the same stack. Import it as
// `import * as IdentityHub from "@samebase/alchemy-convex/identity-hub"`; `Convex.providers()`
// registers its provider.
//
// A run in GitHub Actions asks the hub for a new client with a GitHub OIDC token, so the stack needs
// no key and no Samebase account. The token names the repository. The hub reads
// `/samebase-verification.json` at the origin of the return address, which must name the same
// repository, and registers the client on that address. The answer holds the client's own
// registration access token (RFC 7591), and each later deploy reads the client on the hub with that
// token (RFC 7592). The hub keeps only hashes, so the state is the only record of the secret and the
// token.
//
// The answer to a production registration also holds the app's initial access token (RFC 7591
// section 1.2) and the repository id. The state of stage `prod` keeps them. A development checkout
// runs the stack as a stage `dev-<name>`: it reads them with `IdentityHub.Client.read`, and a client
// with `deploymentType: "development"` asks the hub with the token in place of the GitHub token
// (RFC 133).
//
// A client is enrolled in the connectors it signs in through, such as `google` and `github`, at
// registration (RFC 137). The hub records the set on the client and never changes it: a stack with
// another set registers a new client.
//
// A push removes a variable that a deploy stops passing, so a failure here must not drop working
// variables or stop the deploy. A renewal that fails keeps the saved values. Only a client that
// cannot work asks for a new one: it is gone, or it has another return address, type, or connector
// set. If that request fails, the run gives the off values, so the app has guest sign-in and not a
// broken button. The off values are the `no-hub` variables of a checkout without a hub: Convex
// needs the variables, and the app hides the button for this client ID.
//
// No text in this file quotes an answer or a fetch error, so no log line can hold a secret. The one
// exception is the connector names of an `invalid_connectors` refusal, each checked against the
// grammar of a connector name before it is printed.
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Output from "alchemy/Output";
import * as Provider from "alchemy/Provider";
import { Stack } from "alchemy/Stack";
import { State } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { Providers } from "./Providers.ts";

/** A hung service must not hold a deploy: the time limit of one request. */
const REQUEST_TIMEOUT_MS = 30_000;

/** The variables of a deployment without a hub client, as the starter writes them. */
const OFF_VALUES = { issuer: "http://127.0.0.1:1", clientId: "no-hub", clientSecret: "no-hub" };

/** The name of a connector on the hub. */
const CONNECTOR_NAME = /^[a-z0-9-]{1,64}$/;

/**
 * An identity hub of @samebase/identity-broker, such as Samebase's public hub:
 * `{ issuer: "https://id.samebase.com" }`.
 */
export interface Hub {
  /**
   * The hub's issuer, such as `https://auth.example.com`. The run asks at `<issuer>/hub-clients`,
   * with a GitHub token whose audience is the issuer, so no other hub can use that token.
   */
  readonly issuer: string;
}

interface CommonProps {
  /** The stable name of the app, set once in the stack. */
  readonly app: string;
  /** The hub to register at. A changed hub registers a new client there; the old one stays. */
  readonly hub: Hub;
  /**
   * The connectors the client signs in through, by their names on the hub, such as
   * `["google", "github"]`: at least one, each of `[a-z0-9-]{1,64}`. The hub refuses a name it does
   * not offer, or does not allow this repository, and the log then names the allowed ones. The set
   * is recorded on the client for good: a changed set registers a new client.
   */
  readonly connectors: readonly string[];
  /**
   * The return address of the hub's sign-ins, such as `${site.siteUrl}/auth/hub/callback`: an https
   * URL whose origin serves `/samebase-verification.json` with the numeric GitHub id of this
   * repository, `{ "repository": "123" }`. It can come from a resource that this run creates. A
   * development client can also have http on a loopback host, which needs no file.
   */
  readonly redirectUri: string;
  /** Recorded on the hub's client, such as the commit. The hub records "unknown" without it. */
  readonly softwareVersion?: string;
  /**
   * The run fails unless the hub confirms the client in this run: it fails when the hub refuses or
   * does not answer a registration or a renewal, and when it suspended the client. Without it, such
   * a run gives the off values or keeps the saved client, so the app deploys anyway. Set it where
   * sign-in is the product. A failed run saves nothing, so the next run asks the hub again.
   */
  readonly required?: boolean;
}

/**
 * A production or preview client asks with the GitHub OIDC token of the run. A development client
 * asks with the app's initial access token, which `IdentityHub.Client.read` gives from stage `prod`.
 */
export type ClientProps =
  | (CommonProps & {
      readonly deploymentType: "production" | "preview";
      readonly initialAccessToken?: never;
    })
  | (CommonProps & {
      readonly deploymentType: "development";
      /** Empty before the first production registration: the client gets the off values. */
      readonly initialAccessToken: Redacted.Redacted<string>;
    });

const DeploymentType = Schema.Literals(["production", "preview", "development"]);

const Attributes = Schema.Struct({
  /** `off`: no client, and the values below are the off values. */
  status: Schema.Literals(["on", "off", "suspended"]),
  /** The issuer of the hub, which the deployment names to sign in. */
  issuer: Schema.String,
  clientId: Schema.String,
  /** Returned only at registration. */
  clientSecret: Schema.Redacted(Schema.String),
  /** Returned only at registration. It reads and deletes this client on the hub, and nothing else. */
  registrationAccessToken: Schema.Redacted(Schema.String),
  registrationClientUri: Schema.String,
  deploymentType: DeploymentType,
  /** The return address that the client serves. Empty for the off values. */
  redirectUri: Schema.String,
  /** The connectors the client is enrolled in, sorted, each once. Empty for the off values. */
  connectors: Schema.Array(Schema.String),
  /**
   * Returned only at a production registration (RFC 7591 section 1.2). It registers development
   * clients of this app. Empty for a preview, for a development client, and for the off values.
   */
  initialAccessToken: Schema.Redacted(Schema.String),
  /** The numeric GitHub id of the repository, with the initial access token. Empty without it. */
  repository: Schema.String,
});

/**
 * The attributes keep the real values of a suspended client, so that an unblock needs no new client.
 * `IdentityHub.Client.variables` gives the values that the app gets.
 */
export interface ClientAttributes extends Schema.Schema.Type<typeof Attributes> {}

/**
 * The attributes of a saved row. A row that does not have this version's shape, or any other
 * failure of the decoder, stops the run with `reason`. The text of a schema issue can quote a value
 * of the row, so it is never kept.
 */
const savedAttributes = (value: unknown, reason: string) =>
  Schema.decodeUnknownEffect(Attributes)(value).pipe(
    Effect.catchCause(() => Effect.die(new IdentityHubClientFailed({ reason }))),
  );

/** The attributes of no client. */
const offAttributes = (deploymentType: ClientAttributes["deploymentType"]): ClientAttributes => ({
  status: "off",
  issuer: OFF_VALUES.issuer,
  clientId: OFF_VALUES.clientId,
  clientSecret: Redacted.make(OFF_VALUES.clientSecret),
  registrationAccessToken: Redacted.make(""),
  registrationClientUri: "",
  deploymentType,
  redirectUri: "",
  connectors: [],
  initialAccessToken: Redacted.make(""),
  repository: "",
});

/** The set of `names`: sorted, each once. */
const connectorSet = (names: readonly string[]) => [...new Set(names)].sort();

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, index) => name === b[index]);

/** One request gave no usable answer. The reason holds no secret. */
class IdentityHubClientFailed extends Schema.TaggedError<IdentityHubClientFailed>()(
  "IdentityHubClientFailed",
  { reason: Schema.String },
) {
  override get message() {
    return `IdentityHub.Client: ${this.reason}.`;
  }
}

const OidcToken = Schema.Struct({ value: Schema.NonEmptyString });

/** The 201 answer of `POST /hub-clients`. */
const NewClient = Schema.Struct({
  issuer: Schema.NonEmptyString,
  client_id: Schema.NonEmptyString,
  client_secret: Schema.NonEmptyString,
  registration_access_token: Schema.NonEmptyString,
  registration_client_uri: Schema.NonEmptyString,
  redirect_uri: Schema.NonEmptyString,
  /** The set the hub recorded, which must be the set the request sent. */
  connectors: Schema.Array(Schema.String),
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
  ["paused", "this app is paused on the identity hub"],
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
/** A 400 for a connector the hub does not offer or allow, with the names it allows. */
const InvalidConnectors = Schema.Struct({
  error: Schema.Literal("invalid_connectors"),
  allowed: Schema.Array(Schema.String),
});

/**
 * The text of a refusal: a known reason of a 403 or window of a 429, the allowed connectors of an
 * `invalid_connectors` 400 (only names of the connector grammar, so no other text of the answer is
 * printed), else the text of its status.
 */
const refusalOf = (status: number, body: unknown): string => {
  const decoded = <S extends Schema.Codec<unknown, unknown>>(schema: S) =>
    Option.getOrUndefined(Schema.decodeUnknownOption(schema)(body));
  const ofStatus = () => REFUSALS[status] ?? "the identity hub refused the request";
  switch (status) {
    case 400: {
      const allowed = decoded(InvalidConnectors)?.allowed.filter((name) =>
        CONNECTOR_NAME.test(name),
      );
      return allowed === undefined
        ? ofStatus()
        : `the identity hub does not offer or allow one of the connectors; it allows ${allowed.length === 0 ? "none for this app" : allowed.join(", ")}`;
    }
    case 403:
      return NOT_ALLOWED.get(decoded(Refusal)?.reason ?? "") ?? ofStatus();
    case 429:
      return RATE_LIMITED.get(decoded(RateLimited)?.window ?? "") ?? ofStatus();
    default:
      return ofStatus();
  }
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
    catch: () => new IdentityHubClientFailed({ reason: `${who} gave no answer` }),
  });

const decode =
  <S extends Schema.Codec<unknown, unknown>>(schema: S, who: string) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(() => new IdentityHubClientFailed({ reason: `${who} gave a bad answer` })),
    );

/**
 * The OIDC token of this run for `audience`, read right before the call, because it lives for
 * minutes only.
 */
const readOidcToken = (requestUrl: string, requestToken: string, audience: string) =>
  Effect.gen(function* () {
    const { body, status } = yield* send(
      "GitHub",
      `${requestUrl}&audience=${encodeURIComponent(audience)}`,
      requestToken,
      { method: "GET" },
    );
    if (status !== 200) {
      return yield* new IdentityHubClientFailed({
        reason: `GitHub gave no OIDC token (HTTP ${status})`,
      });
    }
    return (yield* decode(OidcToken, "GitHub")(body)).value;
  });

/** `POST /hub-clients` with `bearer`: the GitHub OIDC token, or the app's initial access token. */
const requestNewClient = (props: ClientProps, connectors: readonly string[], bearer: string) =>
  Effect.gen(function* () {
    const { hub } = props;
    const { body, status } = yield* send("The identity hub", `${hub.issuer}/hub-clients`, bearer, {
      method: "POST",
      body: JSON.stringify({
        app: props.app,
        redirectUri: props.redirectUri,
        softwareVersion: props.softwareVersion ?? "unknown",
        connectors,
      }),
    });
    if (status !== 201) {
      const reason =
        status === 401 && props.deploymentType === "development"
          ? "the identity hub refused the initial access token"
          : refusalOf(status, body);
      return yield* new IdentityHubClientFailed({ reason: `${reason} (HTTP ${status})` });
    }
    const client = yield* decode(NewClient, "The identity hub")(body);
    // The hub registers the address and the connectors that the request sent, under its own issuer.
    // The log and the state hold the stack's values, so no value that the answer chose is printed
    // or kept.
    if (
      client.issuer !== hub.issuer ||
      client.redirect_uri !== props.redirectUri ||
      !sameSet(client.connectors, connectors)
    ) {
      return yield* new IdentityHubClientFailed({ reason: "The identity hub gave a bad answer" });
    }
    yield* Effect.logInfo(
      `IdentityHub.Client: ${props.app} on ${props.redirectUri} has a new client of the identity hub ${hub.issuer}.`,
    );
    // Only a production registration gives the app's token (RFC 7591); any other answer's is dropped.
    const production = props.deploymentType === "production";
    return {
      status: "on" as const,
      issuer: hub.issuer,
      clientId: client.client_id,
      clientSecret: Redacted.make(client.client_secret),
      registrationAccessToken: Redacted.make(client.registration_access_token),
      registrationClientUri: client.registration_client_uri,
      deploymentType: props.deploymentType,
      redirectUri: props.redirectUri,
      connectors,
      initialAccessToken: Redacted.make(production ? (client.initial_access_token ?? "") : ""),
      repository: production ? (client.repository ?? "") : "",
    };
  });

/** A new client, or the off values. */
const newClient = (props: ClientProps, connectors: readonly string[]) => {
  const label = `IdentityHub.Client: ${props.app} on ${props.redirectUri} deploys without the hub`;
  const off = offAttributes(props.deploymentType);
  const request = (bearer: Effect.Effect<string, IdentityHubClientFailed>) =>
    bearer.pipe(
      Effect.flatMap((token) => requestNewClient(props, connectors, token)),
      Effect.catchTag("IdentityHubClientFailed", (error) =>
        Effect.logWarning(`${label}: ${error.reason}. The next deploy asks again.`).pipe(
          Effect.as(off),
        ),
      ),
    );

  if (props.deploymentType === "development") {
    const token = Redacted.value(props.initialAccessToken);
    return token === ""
      ? Effect.logInfo(
          "IdentityHub.Client: deploy to main once for hub sign-in in development.",
        ).pipe(Effect.as(off))
      : request(Effect.succeed(token));
  }

  const requestUrl = process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  const requestToken = process.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"];
  // A development machine, or another CI. In a workflow, `id-token: write` gives both, so a
  // workflow without them is a mistake to show, not a normal run.
  if (!requestUrl || !requestToken) {
    return (
      process.env["GITHUB_ACTIONS"] === "true"
        ? Effect.logWarning(`${label}: this workflow needs the permission id-token: write.`)
        : Effect.logInfo(`${label}: this run has no GitHub OIDC token.`)
    ).pipe(Effect.as(off));
  }
  return request(readOidcToken(requestUrl, requestToken, props.hub.issuer));
};

/**
 * The client after a read on the hub, or undefined when the hub says that the client is gone. A
 * read with no usable answer keeps the saved client, except for a required one: a required client
 * passes a run only when the hub confirms it in that run, so a suspension that an earlier run saw,
 * and did not save because that run failed, cannot pass a run that the hub does not answer.
 */
const renew = (saved: ClientAttributes, required: boolean) =>
  Effect.gen(function* () {
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
          `IdentityHub.Client: the hub suspended the client of ${saved.redirectUri}. It keeps its values, and nobody can sign in with it.`,
        );
        return { ...saved, status: "suspended" as const };
      default:
        return yield* new IdentityHubClientFailed({
          reason: `The identity hub answered HTTP ${status}`,
        });
    }
  }).pipe(
    Effect.catchTag("IdentityHubClientFailed", (error) =>
      required
        ? Effect.fail(
            new IdentityHubClientFailed({
              reason: `${saved.redirectUri} is required, and the hub did not confirm its client: ${error.reason}`,
            }),
          )
        : Effect.logWarning(
            `IdentityHub.Client: ${saved.redirectUri} keeps the saved client: ${error.reason}.`,
          ).pipe(Effect.as(saved)),
    ),
  );

/**
 * The type of this resource before 0.37.0. Alchemy finds this provider for a row of that type, and
 * the next write of the row gives it the new type, with the same client. Remove it, here and in
 * `SavedRow`, once no saved row has the old type.
 */
const OLD_TYPE = "IdentityHub.SharedClient";

/** A saved row of this resource, whose `attr` `savedAttributes` reads. */
const SavedRow = Schema.Struct({
  resourceType: Schema.Literals(["IdentityHub.Client", OLD_TYPE]),
  attr: Schema.Unknown,
});

/**
 * The attributes of the client `id` in another stage of this stack, such as
 * `read("HubClient", { stage: "prod" })` in a development stage, as Outputs: the
 * `initialAccessToken` and the `repository` of the production client. Without that row, the off
 * attributes, with `deploymentType: "production"`.
 *
 * `IdentityHub.Client.ref` is not enough: Alchemy fails the plan with `InvalidReferenceError` when the
 * row is missing, and a development stage before the first deploy to main has none. This read runs
 * when the plan resolves it, with the State service of the running stack and its `get`, so it never
 * creates or upgrades a store. The store revives each secret as `Redacted`, as it does for every
 * read.
 */
const read = (id: string, options: { readonly stage: string }) =>
  Output.fromEffect(
    Effect.gen(function* () {
      const stack = yield* Stack;
      const state = yield* yield* State;
      const row = yield* state
        .get({ stack: stack.name, stage: options.stage, fqn: id })
        .pipe(Effect.orDie);
      if (row === undefined) return offAttributes("production");
      const { attr } = yield* Schema.decodeUnknownEffect(SavedRow)(row).pipe(
        Effect.catchCause(() =>
          Effect.die(
            new IdentityHubClientFailed({
              reason: `the row ${id} of stage ${options.stage} is not an IdentityHub.Client`,
            }),
          ),
        ),
      );
      return yield* savedAttributes(
        attr,
        `the row ${id} of stage ${options.stage} holds attributes that this version cannot read`,
      );
    }),
  );

/**
 * The three values that the app's deployment gets, such as `IDENTITY_HUB_ISSUER`,
 * `IDENTITY_HUB_CLIENT_ID`, and `IDENTITY_HUB_CLIENT_SECRET`, as Outputs: the client's values when
 * `status` is `on`, else the off values, so that a suspended client gives guest sign-in and keeps
 * its values in state.
 */
const variables = (client: Client) =>
  Output.map(Output.of(client), (attributes) =>
    attributes.status === "on"
      ? {
          issuer: attributes.issuer,
          clientId: attributes.clientId,
          clientSecret: attributes.clientSecret,
        }
      : {
          issuer: OFF_VALUES.issuer,
          clientId: OFF_VALUES.clientId,
          clientSecret: Redacted.make(OFF_VALUES.clientSecret),
        },
  );

export type Client = Resource<
  "IdentityHub.Client",
  ClientProps,
  ClientAttributes,
  never,
  Providers
>;
export const Client = Resource<Client>("IdentityHub.Client", { aliases: [OLD_TYPE] })({
  read,
  variables,
});

export const ClientProvider = () =>
  Provider.succeed(Client, {
    // Always an update, so that each deploy reaches the hub. No attribute is stable, so a push
    // reads the values that this run ended with. The same values cause no other push.
    diff: ({ news }) =>
      Effect.succeed(isResolved(news) ? ({ action: "update" } as const) : undefined),

    read: ({ output }) => Effect.succeed(output),

    // Only a client of the same hub (its issuer), return address, type, and connector set is
    // renewed. A saved row without this version's shape stops the run with a fixed message.
    reconcile: Effect.fn(function* ({ news, output }) {
      // A bad prop is a mistake of the stack, not of the hub: the run fails, with no request.
      if (
        news.connectors.length === 0 ||
        !news.connectors.every((name) => CONNECTOR_NAME.test(name))
      ) {
        return yield* new IdentityHubClientFailed({
          reason: `${news.app} on ${news.redirectUri} needs connectors: one or more names of [a-z0-9-]{1,64}`,
        });
      }
      const connectors = connectorSet(news.connectors);
      const saved =
        output === undefined || output.status === "off"
          ? undefined
          : yield* savedAttributes(
              output,
              `the saved attributes of ${news.app} on ${news.redirectUri} cannot be read by this version`,
            );
      const renewed =
        saved?.issuer === news.hub.issuer &&
        saved.redirectUri === news.redirectUri &&
        saved.deploymentType === news.deploymentType &&
        sameSet(saved.connectors, connectors)
          ? yield* renew(saved, news.required === true)
          : undefined;
      const client = renewed ?? (yield* newClient(news, connectors));
      if (news.required === true && client.status !== "on") {
        return yield* new IdentityHubClientFailed({
          reason: `${news.app} on ${news.redirectUri} is required and has no working client (${client.status}). The warning above names the reason`,
        });
      }
      return client;
    }),

    // A failed delete does not stop a destroy: the removal date of a preview or development client
    // cleans it up. A destroy can leave a production deployment running, so its client stays.
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
              return yield* new IdentityHubClientFailed({
                reason: `The identity hub answered HTTP ${status}`,
              });
            }
          }).pipe(
            Effect.catchTag("IdentityHubClientFailed", (error) =>
              Effect.logWarning(
                `IdentityHub.Client: the client of ${output.redirectUri} stays on the hub until its removal date: ${error.reason}.`,
              ),
            ),
          ),
  });
