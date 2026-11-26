// Test support of the integrations part: fake providers at the real token endpoints of Convex,
// Cloudflare and GitHub, and at Cloudflare's revocation endpoint, on the harness's `Fetch`; a broker
// with the part; and the client's side of each step. A fake provider spends each refresh token
// once, like the rotation of GitHub and Cloudflare. No test framework import.
import { Effect, Redacted } from "effect";
import {
  createBroker,
  pkce,
  stubFetch,
  txnCookie,
  type StubFetch,
} from "../core/testing/harness.ts";
import type { Connector } from "../core/connectors/types.ts";
import type { Registration } from "../core/router.ts";
import * as Integrations from "./index.ts";
import { readProvider, type Integration } from "./providers.ts";
import { integrationsPart } from "./routes.ts";

const credentials = {
  clientId: Effect.succeed(Redacted.make("provider-client")),
  clientSecret: Effect.succeed(Redacted.make("provider-secret")),
};
export const [convex, cloudflare, github] = Effect.runSync(
  Effect.all([
    readProvider(Integrations.convex(credentials)),
    readProvider(Integrations.cloudflare({ ...credentials, scopes: ["workers-scripts.read"] })),
    readProvider(Integrations.github(credentials)),
  ]),
);
export const PROVIDERS: ReadonlyArray<Integration> = [convex, cloudflare, github];

// Convex's documented response:
// https://docs.convex.dev/platform-apis/oauth-applications#step-3-exchange-the-authorization-code-for-a-project-token
export const convexToken = { access_token: "team:my-team|AAAAAA==", token_type: "bearer" };
// GitHub's documented response; the fake adds its own refresh token:
// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
const githubToken = {
  access_token: "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  expires_in: 28800,
  refresh_token_expires_in: 15897600,
  scope: "",
  token_type: "bearer",
};
// GitHub's answer to a wrong refresh token, recorded on 2026-11-02 for the Convex broker: HTTP 200.
const githubBadRefreshToken = {
  error: "bad_refresh_token",
  error_description: "The refresh token passed is incorrect or expired.",
  error_uri:
    "https://docs.github.com/apps/managing-oauth-apps/troubleshooting-oauth-app-access-token-request-errors/#bad-verification-code",
};
// RFC 6749 section 5.1's token response, with a Bearer token type.
const oauthToken = {
  access_token: "2YotnFZFEjr1zCsicMWpAA",
  token_type: "Bearer",
  expires_in: 3600,
  example_parameter: "example_value",
};

/** One call of a provider's token or revocation endpoint, as the provider saw it. */
export type ProviderCall = {
  readonly provider: string;
  readonly url: string;
  readonly body: URLSearchParams;
  readonly authorization: string | null;
};

/**
 * The three providers on `fetch`. Each code `upstream-code` gives tokens; Cloudflare and GitHub
 * also give a refresh token, which a refresh spends once and replaces. A spent or unknown refresh
 * token gets `invalid_grant`, in GitHub's HTTP 200 form for GitHub. Cloudflare's revocation
 * endpoint spends the token it gets.
 */
export function fakeProviders(fetch: StubFetch) {
  const live = new Set<string>();
  let serial = 0;
  const calls: ProviderCall[] = [];
  const record = async (provider: string, request: Request) => {
    const body = new URLSearchParams(await request.text());
    calls.push({
      provider,
      url: request.url,
      body,
      authorization: request.headers.get("authorization"),
    });
    return body;
  };
  const mint = (provider: string) => {
    serial += 1;
    const token = `${provider}-refresh-${serial}`;
    live.add(token);
    return token;
  };
  const success = (provider: Integration, refreshToken: string) =>
    Response.json(
      provider.name === "github"
        ? { ...githubToken, refresh_token: refreshToken }
        : { ...oauthToken, refresh_token: refreshToken },
    );
  const invalidGrant = (provider: Integration) =>
    provider.name === "github"
      ? Response.json(githubBadRefreshToken)
      : Response.json({ error: "invalid_grant" }, { status: 400 });
  for (const provider of PROVIDERS) {
    fetch.plan({
      match: (request) =>
        request.method === "POST" && request.url === provider.server.token_endpoint,
      respond: async (request) => {
        const body = await record(provider.name, request);
        if (body.get("grant_type") === "authorization_code") {
          if (body.get("code") !== "upstream-code") {
            return Response.json({ error: "invalid_grant" }, { status: 400 });
          }
          return provider.name === "convex"
            ? Response.json(convexToken)
            : success(provider, mint(provider.name));
        }
        return live.delete(body.get("refresh_token") ?? "")
          ? success(provider, mint(provider.name))
          : invalidGrant(provider);
      },
    });
    const revocation = provider.server.revocation_endpoint;
    if (revocation !== undefined) {
      fetch.plan({
        match: (request) => request.method === "POST" && request.url === revocation,
        respond: async (request) => {
          live.delete((await record(provider.name, request)).get("token") ?? "");
          return new Response(null, { status: 200 });
        },
      });
    }
  }
  return {
    calls,
    /** Whether `token` is a live refresh token of its provider. */
    isLive: (token: string) => live.has(token),
  };
}

export const REDIRECT = "https://preview.example.com/oauth/broker/callback";

/**
 * A broker with the integrations part over the three providers and their fakes, and one card that
 * may use `connections` (by default all three).
 */
export async function integrationsBroker(
  options: {
    readonly registration?: Registration;
    readonly connections?: string[];
    /** The sign-in connectors, made on the broker's `Fetch` (by default the harness's two). */
    readonly connectors?: (fetch: StubFetch) => ReadonlyArray<Connector>;
  } = {},
) {
  const fetch = stubFetch();
  const providers = fakeProviders(fetch);
  const h = await createBroker({
    fetch,
    part: integrationsPart(PROVIDERS),
    ...(options.registration === undefined ? {} : { registration: options.registration }),
    ...(options.connectors === undefined
      ? {}
      : { config: { connectors: options.connectors(fetch) } }),
  });
  const client = await h.registerClient({
    appName: "Resource app",
    redirectUri: REDIRECT,
    connections: options.connections ?? ["cloudflare", "convex", "github"],
  });
  return { ...h, providers, client };
}
export type IntegrationsBroker = Awaited<ReturnType<typeof integrationsBroker>>;

/** A client of the broker: its id, its secret and its return address. */
export type TestClient = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
};

/** `/authorize` with `resource`, and the PKCE verifier of the request. */
export async function authorize(
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  resource: string,
  extra: Record<string, string> = {},
) {
  const proof = await pkce();
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    resource,
    state: "client-state",
    code_challenge: proof.challenge,
    code_challenge_method: "S256",
    ...extra,
  });
  const start = await h.fetchBroker(`${h.issuer}/authorize?${params.toString()}`);
  return { start, verifier: proof.verifier };
}

/** The provider's redirect back to the broker for `start`, from the browser that started it. */
export async function callback(
  h: Pick<IntegrationsBroker, "fetchBroker">,
  start: Response,
  extra: Record<string, string> = {},
) {
  const upstream = new URL(start.headers.get("location") ?? "");
  const url = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  url.searchParams.set("code", "upstream-code");
  url.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  for (const [name, value] of Object.entries(extra)) {
    url.searchParams.set(name, value);
  }
  const back = await h.fetchBroker(url, { headers: txnCookie(start) });
  return { back, url, returned: new URL(back.headers.get("location") ?? "https://none.invalid") };
}

/** A `/token` request of `client` with `params`, its secret in the body. */
export const tokenRequest = (
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  params: Record<string, string>,
) =>
  h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      ...params,
    }),
  });

/** The code exchange of `code` with `verifier`. */
export const redeem = (
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  code: string,
  verifier: string,
  extra: Record<string, string> = {},
) =>
  tokenRequest(h, client, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: client.redirectUri,
    ...extra,
  });

/** A refresh of the provider's refresh token at the provider of `resource`. */
export const refresh = (
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  refreshToken: string,
  resource: string,
  extra: Record<string, string> = {},
) =>
  tokenRequest(h, client, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    resource,
    ...extra,
  });

/** RFC 7009 revocation of `token` by `client` at the provider of `resource`. */
export const revoke = (
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  token: string,
  resource: string,
) =>
  h.fetchBroker(`${h.issuer}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      token,
      token_type_hint: "refresh_token",
      resource,
    }),
  });

/**
 * A whole connection of `resource`: the start, the provider's callback and the code exchange. A
 * step that answers no redirect onward ends it with that answer.
 */
export async function connect(
  h: Pick<IntegrationsBroker, "fetchBroker" | "issuer">,
  client: TestClient,
  resource: string,
) {
  const { start, verifier } = await authorize(h, client, resource);
  if (start.status !== 302) {
    return start;
  }
  const { back, returned } = await callback(
    h,
    start,
    resource === github.resource ? { iss: github.server.issuer } : {},
  );
  const code = returned.searchParams.get("code");
  return code === null ? back : await redeem(h, client, code, verifier);
}
