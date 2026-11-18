// The example app: sign-in with Google through an identity hub, as a relying party of OpenID
// Connect. A plain function from a Web `Request` to a `Response`. oauth4webapi does discovery, the
// callback checks (state and the RFC 9207 `iss`), the code exchange with `client_secret_post`, and
// the ID token checks (signature against the hub's JWKS, issuer, audience, nonce, expiry).
//
// No log line and no page holds a token, a code, a secret, or a URL with its query: the callback
// URL carries the code. A failure logs only a fixed category.
import { Schema } from "effect";
import * as oauth from "oauth4webapi";
import { seal, unseal } from "./signed.ts";

/** The Worker's bindings. */
export interface Env {
  /** The hub's issuer, such as `https://identity-broker-effect-dev-spike.pfp.workers.dev`. */
  readonly IDENTITY_HUB_ISSUER: string;
  /** The client of this deployment on the hub, or `no-hub`, the off value of IdentityHub.Client. */
  readonly IDENTITY_HUB_CLIENT_ID: string;
  readonly IDENTITY_HUB_CLIENT_SECRET: string;
  /** The key of the signed cookies. */
  readonly SESSION_SECRET: string;
  /** The numeric GitHub id of the repository, which `/samebase-verification.json` names. */
  readonly REPOSITORY_ID: string;
}

/** Every request to the hub: discovery, JWKS and the token request. Tests route it to the hub. */
export type FetchHub = (request: Request) => Promise<Response>;

/** IdentityHub.Client gives this client id when the deployment has no client. */
const OFF_CLIENT_ID = "no-hub";
/** The hub connector that the sign-in link names. */
const CONNECTOR = "google";
/** The hub sign-in has this long, from /login to /callback. */
const SIGN_IN_MS = 10 * 60 * 1000;
/** A session lasts this long. */
const SESSION_MS = 24 * 60 * 60 * 1000;

const SESSION_COOKIE = "__Host-session";
const SIGN_IN_COOKIE = "__Host-sign-in";

const Session = Schema.Struct({
  sub: Schema.String,
  email: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  exp: Schema.Number,
});
const SignIn = Schema.Struct({
  state: Schema.String,
  nonce: Schema.String,
  verifier: Schema.String,
  exp: Schema.Number,
});
/** The optional claims of the ID token that the page shows. */
const ProfileClaims = Schema.Struct({
  email: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
});

/** A failure that the page names with a fixed reason. */
class SignInFailed extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "Referrer-Policy": "no-referrer",
};

/** A page whose `body` is HTML that the caller escaped. */
function page(status: number, body: string, cookies: readonly string[] = []): Response {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    "Content-Type": "text/html; charset=utf-8",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Identity hub example</title></head><body>${body}</body></html>`,
    { status, headers },
  );
}

function redirect(location: string, cookies: readonly string[]): Response {
  const headers = new Headers({ ...SECURITY_HEADERS, Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

const setCookie = (name: string, value: string, maxAgeMs: number) =>
  `${name}=${value}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; Secure; SameSite=Lax`;
const clearCookie = (name: string) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/** `fetchHub` as oauth4webapi's custom fetch. */
const hubFetch =
  (fetchHub: FetchHub) =>
  <Method extends string, Body extends RequestInit["body"]>(
    url: string,
    options: oauth.CustomFetchOptions<Method, Body>,
  ): Promise<Response> =>
    fetchHub(
      new Request(url, {
        method: options.method,
        headers: options.headers,
        body: options.body ?? null,
        redirect: options.redirect,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      }),
    );

/** The hub's metadata, from its discovery document. */
async function discover(env: Env, fetchHub: FetchHub): Promise<oauth.AuthorizationServer> {
  const issuer = new URL(env.IDENTITY_HUB_ISSUER);
  const response = await oauth.discoveryRequest(issuer, {
    algorithm: "oidc",
    [oauth.customFetch]: hubFetch(fetchHub),
  });
  return await oauth.processDiscoveryResponse(issuer, response);
}

const callbackUrl = (request: Request) => `${new URL(request.url).origin}/callback`;

async function home(request: Request, env: Env): Promise<Response> {
  if (env.IDENTITY_HUB_CLIENT_ID === OFF_CLIENT_ID) {
    return page(200, "<p>Sign-in is not configured.</p>");
  }
  const value = readCookie(request, SESSION_COOKIE);
  const session =
    value === undefined
      ? undefined
      : await unseal(env.SESSION_SECRET, "session", Session, value, Date.now());
  if (session === undefined) {
    return page(200, '<p><a href="/login">Sign in with Google</a></p>');
  }
  return page(
    200,
    `<dl><dt>Subject</dt><dd>${escapeHtml(session.sub)}</dd><dt>Email</dt><dd>${escapeHtml(session.email ?? "")}</dd><dt>Name</dt><dd>${escapeHtml(session.name ?? "")}</dd></dl><p><a href="/logout">Sign out</a></p>`,
  );
}

async function login(request: Request, env: Env, fetchHub: FetchHub): Promise<Response> {
  const as = await discover(env, fetchHub);
  if (as.authorization_endpoint === undefined) {
    throw new SignInFailed(502, "The identity hub names no authorization endpoint.");
  }
  const state = oauth.generateRandomState();
  const nonce = oauth.generateRandomNonce();
  const verifier = oauth.generateRandomCodeVerifier();
  const url = new URL(as.authorization_endpoint);
  const parameters = {
    client_id: env.IDENTITY_HUB_CLIENT_ID,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    connector: CONNECTOR,
    state,
    nonce,
    code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  };
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const value = await seal(
    env.SESSION_SECRET,
    "sign-in",
    { state, nonce, verifier },
    Date.now() + SIGN_IN_MS,
  );
  return redirect(url.href, [setCookie(SIGN_IN_COOKIE, value, SIGN_IN_MS)]);
}

async function callback(request: Request, env: Env, fetchHub: FetchHub): Promise<Response> {
  const value = readCookie(request, SIGN_IN_COOKIE);
  const signIn =
    value === undefined
      ? undefined
      : await unseal(env.SESSION_SECRET, "sign-in", SignIn, value, Date.now());
  if (signIn === undefined) {
    throw new SignInFailed(400, "The sign-in expired or started in another browser.");
  }
  const currentUrl = new URL(request.url);
  // RFC 9207: the hub names itself in every answer. oauth4webapi compares the value with the
  // issuer; this makes it required whatever the metadata says.
  if (!currentUrl.searchParams.has("iss")) {
    throw new SignInFailed(400, "The answer does not name the identity hub.");
  }
  const as = await discover(env, fetchHub);
  const client: oauth.Client = { client_id: env.IDENTITY_HUB_CLIENT_ID };
  const options = { [oauth.customFetch]: hubFetch(fetchHub) };
  const params = oauth.validateAuthResponse(as, client, currentUrl, signIn.state);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    oauth.ClientSecretPost(env.IDENTITY_HUB_CLIENT_SECRET),
    params,
    callbackUrl(request),
    signIn.verifier,
    options,
  );
  const tokens = await oauth.processAuthorizationCodeResponse(as, client, response, {
    expectedNonce: signIn.nonce,
    requireIdToken: true,
  });
  await oauth.validateApplicationLevelSignature(as, response, options);
  const claims = oauth.getValidatedIdTokenClaims(tokens);
  if (claims === undefined) {
    throw new SignInFailed(502, "The identity hub gave no ID token.");
  }
  const profile = Schema.decodeUnknownSync(ProfileClaims)(claims);
  const session = await seal(
    env.SESSION_SECRET,
    "session",
    { sub: claims.sub, ...profile },
    Date.now() + SESSION_MS,
  );
  return redirect("/", [
    setCookie(SESSION_COOKIE, session, SESSION_MS),
    clearCookie(SIGN_IN_COOKIE),
  ]);
}

/** The fixed reason and the log category of a failed sign-in. No text of the error is kept. */
function failure(error: unknown): { status: number; reason: string; category: string } {
  if (error instanceof SignInFailed) {
    return { status: error.status, reason: error.reason, category: "sign_in" };
  }
  if (error instanceof oauth.AuthorizationResponseError) {
    return { status: 400, reason: "The identity hub did not sign you in.", category: "refused" };
  }
  if (error instanceof oauth.OperationProcessingError) {
    return {
      status: 502,
      reason: "The identity hub gave an answer that the app cannot accept.",
      category: error.code ?? "operation",
    };
  }
  if (error instanceof oauth.ResponseBodyError) {
    return { status: 502, reason: "The identity hub refused the sign-in.", category: "token" };
  }
  return { status: 502, reason: "The identity hub could not be reached.", category: "other" };
}

/** The app's request handler. */
export async function handle(request: Request, env: Env, fetchHub: FetchHub): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET") {
    return page(405, "<p>Method not allowed.</p>");
  }
  switch (pathname) {
    case "/":
      return await home(request, env);
    case "/samebase-verification.json":
      return Response.json({ repository: env.REPOSITORY_ID }, { headers: SECURITY_HEADERS });
    case "/logout":
      return redirect("/", [clearCookie(SESSION_COOKIE)]);
    case "/login":
    case "/callback": {
      if (env.IDENTITY_HUB_CLIENT_ID === OFF_CLIENT_ID) {
        return page(503, "<p>Sign-in is not configured.</p>");
      }
      try {
        return pathname === "/login"
          ? await login(request, env, fetchHub)
          : await callback(request, env, fetchHub);
      } catch (error) {
        const { status, reason, category } = failure(error);
        console.error(`sign_in_failed ${JSON.stringify({ route: pathname, category })}`);
        return page(status, `<p>${escapeHtml(reason)}</p><p><a href="/">Back</a></p>`, [
          clearCookie(SIGN_IN_COOKIE),
        ]);
      }
    }
    default:
      return page(404, "<p>Not found.</p>");
  }
}
