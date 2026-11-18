// The app as a relying party of the identity hub, in OpenID Connect. oauth4webapi does discovery,
// the callback checks (state and the RFC 9207 `iss`), the code exchange with `client_secret_post`,
// and the ID token checks (signature against the hub's JWKS, issuer, audience, nonce, expiry).
//
// The errors keep no text of the hub or the library, only a fixed reason, so no page and no log
// line can hold a token, a code, or a secret.
import * as IdentityHub from "@samebase/alchemy-convex/identity-hub";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as oauth from "oauth4webapi";

/** The test hub, an OpenID Provider of packages/identity-broker-effect. */
const HUB = { issuer: "https://identity-broker-effect-dev-spike.pfp.workers.dev" };
/** IdentityHub.Client gives this client id when the deployment has no client. */
const OFF_CLIENT_ID = "no-hub";
/** The hub connector that the sign-in link names. */
const CONNECTOR = "google";

/** The hub could not be reached, or failed in a way that the protocol does not name. */
export class HubUnreachable extends Schema.TaggedError<HubUnreachable>()("HubUnreachable", {}) {}
/** The hub's answer to the browser is an error, such as `access_denied`. */
export class HubDeclined extends Schema.TaggedError<HubDeclined>()("HubDeclined", {}) {}
/** An answer of the hub fails a check: state, issuer, ID token, or claims. */
export class HubAnswerRejected extends Schema.TaggedError<HubAnswerRejected>()(
  "HubAnswerRejected",
  { code: Schema.String },
) {}
/** The token endpoint refused the code. */
export class TokenRefused extends Schema.TaggedError<TokenRefused>()("TokenRefused", {}) {}
/** The answer to the browser names no issuer (RFC 9207). */
export class AnswerWithoutIssuer extends Schema.TaggedError<AnswerWithoutIssuer>()(
  "AnswerWithoutIssuer",
  {},
) {}
export class NoAuthorizationEndpoint extends Schema.TaggedError<NoAuthorizationEndpoint>()(
  "NoAuthorizationEndpoint",
  {},
) {}
export class NoIdToken extends Schema.TaggedError<NoIdToken>()("NoIdToken", {}) {}

/** Any failure of a hub request, by what the protocol says about it. */
export type HubError = HubUnreachable | HubDeclined | HubAnswerRejected | TokenRefused;

/** What a sign-in keeps in the browser from /login to /callback. */
export const PendingSignIn = Schema.Struct({
  state: Schema.String,
  nonce: Schema.String,
  verifier: Schema.String,
});
export type PendingSignIn = typeof PendingSignIn.Type;

/** The signed-in user: the ID token's subject and the profile claims that the page shows. */
export const User = Schema.Struct({
  sub: Schema.String,
  email: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
});
export type User = typeof User.Type;

/**
 * The client's values. They are Effects because the Worker reads them from its env per request;
 * at deploy they exist only as Outputs of the client.
 */
export interface ClientValues {
  readonly issuer: Effect.Effect<string>;
  readonly clientId: Effect.Effect<string>;
  readonly clientSecret: Effect.Effect<Redacted.Redacted<string>>;
}

/** The tagged error of a failure of oauth4webapi, by its class. */
const hubError = (cause: unknown): HubError =>
  cause instanceof oauth.AuthorizationResponseError
    ? new HubDeclined()
    : cause instanceof oauth.OperationProcessingError
      ? new HubAnswerRejected({ code: cause.code ?? "operation" })
      : cause instanceof oauth.ResponseBodyError
        ? new TokenRefused()
        : new HubUnreachable();

const hubCall = <A>(evaluate: () => Promise<A>) =>
  Effect.tryPromise({ try: evaluate, catch: hubError });

export class HubClient extends Context.Service<
  HubClient,
  {
    /** False with the off values, before the hub has registered this deployment's client. */
    readonly configured: Effect.Effect<boolean>;
    /** The hub's sign-in address for `redirectUri`, and what the callback must check. */
    start(
      redirectUri: string,
    ): Effect.Effect<
      { readonly url: string; readonly pending: PendingSignIn },
      HubError | NoAuthorizationEndpoint
    >;
    /** The user of the hub's `answer` at `redirectUri`, after every check. */
    finish(
      answer: URL,
      redirectUri: string,
      pending: PendingSignIn,
    ): Effect.Effect<User, HubError | AnswerWithoutIssuer | NoIdToken>;
  }
>()("identity-broker-effect-example/HubClient") {
  /** The service for the client of `values`. Every hub request goes through `FetchHttpClient.Fetch`. */
  static readonly layerWith = (values: ClientValues) =>
    Layer.effect(
      HubClient,
      Effect.gen(function* () {
        const fetch = yield* FetchHttpClient.Fetch;
        const options = {
          [oauth.customFetch]: <Method extends string, Body extends RequestInit["body"]>(
            url: string,
            init: oauth.CustomFetchOptions<Method, Body>,
          ) =>
            fetch(url, {
              method: init.method,
              headers: init.headers,
              body: init.body ?? null,
              redirect: init.redirect,
              ...(init.signal === undefined ? {} : { signal: init.signal }),
            }),
        };

        const discovery = Effect.flatMap(values.issuer, (issuer) =>
          hubCall(async () => {
            const url = new URL(issuer);
            const response = await oauth.discoveryRequest(url, { algorithm: "oidc", ...options });
            return await oauth.processDiscoveryResponse(url, response);
          }),
        );

        const start = Effect.fn("HubClient.start")(function* (redirectUri: string) {
          const as = yield* discovery;
          if (as.authorization_endpoint === undefined) {
            return yield* new NoAuthorizationEndpoint();
          }
          const pending = {
            state: oauth.generateRandomState(),
            nonce: oauth.generateRandomNonce(),
            verifier: oauth.generateRandomCodeVerifier(),
          };
          const url = new URL(as.authorization_endpoint);
          const parameters = {
            client_id: yield* values.clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "openid email profile",
            connector: CONNECTOR,
            state: pending.state,
            nonce: pending.nonce,
            code_challenge: yield* hubCall(() =>
              oauth.calculatePKCECodeChallenge(pending.verifier),
            ),
            code_challenge_method: "S256",
          };
          for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
          return { url: url.href, pending };
        });

        const finish = Effect.fn("HubClient.finish")(function* (
          answer: URL,
          redirectUri: string,
          pending: PendingSignIn,
        ) {
          // RFC 9207: the hub names itself in every answer. oauth4webapi compares the value with
          // the issuer; this makes it required whatever the metadata says.
          if (!answer.searchParams.has("iss")) return yield* new AnswerWithoutIssuer();
          const as = yield* discovery;
          const client: oauth.Client = { client_id: yield* values.clientId };
          const clientSecret = yield* values.clientSecret;
          const params = yield* Effect.try({
            try: () => oauth.validateAuthResponse(as, client, answer, pending.state),
            catch: hubError,
          });
          const response = yield* hubCall(() =>
            oauth.authorizationCodeGrantRequest(
              as,
              client,
              oauth.ClientSecretPost(Redacted.value(clientSecret)),
              params,
              redirectUri,
              pending.verifier,
              options,
            ),
          );
          const tokens = yield* hubCall(() =>
            oauth.processAuthorizationCodeResponse(as, client, response, {
              expectedNonce: pending.nonce,
              requireIdToken: true,
            }),
          );
          yield* hubCall(() => oauth.validateApplicationLevelSignature(as, response, options));
          const claims = oauth.getValidatedIdTokenClaims(tokens);
          if (claims === undefined) return yield* new NoIdToken();
          return yield* Schema.decodeUnknownEffect(User)(claims).pipe(
            Effect.mapError(() => new HubAnswerRejected({ code: "claims" })),
          );
        });

        return HubClient.of({
          configured: Effect.map(values.clientId, (clientId) => clientId !== OFF_CLIENT_ID),
          start,
          finish,
        });
      }),
    );

  /**
   * The service on Cloudflare, with the client of this deployment on the test hub. Yielding the
   * client's Outputs here binds them to the Worker as IDENTITY_HUB_* at deploy, and reads them from
   * the Worker's env per request. The hub registers the client only for a GitHub Actions OIDC
   * token, after it reads `/samebase-verification.json` at the origin of `redirectUri`; until then
   * the client gives the off values. `Convex.providers()` in the stack holds the client's provider,
   * so none of its code runs in the Worker.
   */
  static readonly layer = (redirectUri: (stage: string) => string) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const { stage } = yield* Alchemy.Stack;
        const client = IdentityHub.Client.variables(
          yield* IdentityHub.Client("HubClient", {
            hub: HUB,
            connectors: [CONNECTOR],
            redirectUris: [redirectUri(stage)],
            deploymentType: "preview",
          }),
        );
        return HubClient.layerWith({
          issuer: yield* Output.named(client.issuer, "IDENTITY_HUB_ISSUER"),
          clientId: yield* Output.named(client.clientId, "IDENTITY_HUB_CLIENT_ID"),
          clientSecret: yield* Output.named(client.clientSecret, "IDENTITY_HUB_CLIENT_SECRET"),
        });
      }),
    );
}
