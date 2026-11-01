// Convex.SharedHubClient: one deployment of an app as a client of the central identity hub, for an
// app that deploys in its own GitHub Actions run.
//
// The run asks samebase.com for a new client with a GitHub OIDC token, so the stack needs no
// Samebase key. Samebase checks the token, chooses the callback, and registers the client. The
// answer holds the client's own registration access token (RFC 7591), and each later deploy reads
// the client on the hub with that token (RFC 7592). The hub keeps only hashes, so the state is the
// only record of the secret and the token.
//
// A push removes a variable that a deploy stops passing, so a failure here must not drop working
// variables or stop the deploy. A renewal that fails keeps the saved values. Only a client that
// cannot work asks for a new one: it is gone, or it has the callback of another deployment. If that
// request fails, the run gives the off values, so the app has guest sign-in and not a broken button.
// The off values are the `no-hub` variables of a checkout without a hub: Convex needs the variables,
// and the app hides the button for this client ID.
//
// No text in this file quotes an answer or a fetch error, so no log line can hold a secret.
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { Providers } from "./Providers.ts";

/** A hung service must not hold a deploy: the time limit of one request. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface SharedHubClientProps {
  /** The stable name of the app, set once in the stack. */
  readonly app: string;
  /** The Convex deployment name. It can come from a deployment that this run creates. */
  readonly deployment: string;
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
  /** The deployment that the client serves. */
  readonly deployment: string;
  readonly deploymentType: "production" | "preview";
  readonly redirectUri: string;
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

/** The 201 answer of `POST /api/hub-clients`. */
const NewClient = Schema.Struct({
  issuer: Schema.NonEmptyString,
  client_id: Schema.NonEmptyString,
  client_secret: Schema.NonEmptyString,
  registration_access_token: Schema.NonEmptyString,
  registration_client_uri: Schema.NonEmptyString,
  redirect_uri: Schema.NonEmptyString,
});

/** The other answers of `POST /api/hub-clients`, by status. */
const REFUSALS: Readonly<Record<number, string>> = {
  401: "Samebase refused the GitHub OIDC token",
  403: "Samebase does not allow this repository or deployment",
  404: "hub clients are off on Samebase",
  429: "Samebase limits the requests of this repository",
  502: "the identity hub is not available",
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
    const { body, status } = yield* send(
      "Samebase",
      `${process.env["SAMEBASE_URL"] ?? "https://samebase.com"}/api/hub-clients`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          app: props.app,
          deployment: props.deployment,
          softwareVersion: props.softwareVersion ?? "unknown",
        }),
      },
    );
    if (status !== 201) {
      return yield* new SharedHubClientFailed({
        reason: `${REFUSALS[status] ?? "Samebase refused the request"} (HTTP ${status})`,
      });
    }
    const client = yield* decode(NewClient, "Samebase")(body);
    return {
      status: "on" as const,
      issuer: client.issuer,
      clientId: client.client_id,
      clientSecret: Redacted.make(client.client_secret),
      registrationAccessToken: Redacted.make(client.registration_access_token),
      registrationClientUri: client.registration_client_uri,
      deployment: props.deployment,
      deploymentType: props.deploymentType,
      redirectUri: client.redirect_uri,
    };
  });

/** A new client, or `saved`, or the off values. `saved` holds no off values. */
const newClient = (props: SharedHubClientProps) => {
  const label = `Convex.SharedHubClient: ${props.app} on ${props.deployment} deploys without the hub`;
  const off: SharedHubClientAttributes = {
    status: "off",
    issuer: "http://127.0.0.1:1",
    clientId: "no-hub",
    clientSecret: Redacted.make("no-hub"),
    registrationAccessToken: Redacted.make(""),
    registrationClientUri: "",
    deployment: props.deployment,
    deploymentType: props.deploymentType,
    redirectUri: "",
  };
  const requestUrl = process.env["ACTIONS_ID_TOKEN_REQUEST_URL"];
  const requestToken = process.env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"];
  // A laptop, or a repository outside Samebase. In a workflow, `id-token: write` gives both, so a
  // workflow without them is a mistake to show, not a normal run.
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

/** The client after a read on the hub, or undefined when the hub says that the client is gone. */
const renew = (saved: SharedHubClientAttributes) =>
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
          `Convex.SharedHubClient: the hub suspended the client of ${saved.deployment}. It keeps its values, and nobody can sign in with it.`,
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
        `Convex.SharedHubClient: ${saved.deployment} keeps the saved client: ${error.reason}.`,
      ).pipe(Effect.as(saved)),
    ),
  );

export const SharedHubClientProvider = () =>
  Provider.succeed(SharedHubClient, {
    // Always an update, so that each deploy reaches the hub. No attribute is stable, so a push
    // reads the values that this run ended with. The same values cause no other push.
    diff: ({ news }) =>
      Effect.succeed(isResolved(news) ? ({ action: "update" } as const) : undefined),

    read: ({ output }) => Effect.succeed(output),

    reconcile: Effect.fn(function* ({ news, output }) {
      const saved = output?.status === "off" ? undefined : output;
      const renewed = saved?.deployment === news.deployment ? yield* renew(saved) : undefined;
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
                `Convex.SharedHubClient: the client of ${output.deployment} stays on the hub until its removal date: ${error.reason}.`,
              ),
            ),
          ),
  });
