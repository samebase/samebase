import { Effect, Redacted } from "effect";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { readConnector } from "../../hosts/settings.ts";
import { createBroker, pkce, txnCookie } from "../testing/harness.ts";
import { githubIdentity } from "./github.ts";
import { github } from "./index.ts";

// GitHub's documented example responses for GET /user and GET /user/emails
// (docs.github.com/en/rest/users/users and docs.github.com/en/rest/users/emails), trimmed to the
// fields the connector reads plus a few it ignores.
const octocat = {
  login: "octocat",
  id: 1,
  node_id: "MDQ6VXNlcjE=",
  avatar_url: "https://github.com/images/error/octocat_happy.gif",
  type: "User",
  name: "monalisa octocat",
  company: "GitHub",
  email: "octocat@github.com",
  public_repos: 2,
};
const emails = [
  { email: "octocat@github.com", verified: true, primary: true, visibility: "public" },
  { email: "octocat-old@github.com", verified: false, primary: false, visibility: null },
];
// GitHub's RFC 8414 metadata as served on 2026-10-29 at
// https://github.com/.well-known/oauth-authorization-server/login/oauth.
const metadata = {
  issuer: "https://github.com/login/oauth",
  authorization_endpoint: "https://github.com/login/oauth/authorize",
  token_endpoint: "https://github.com/login/oauth/access_token",
  response_types_supported: ["code"],
  grant_types_supported: [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:device_code",
  ],
  service_documentation:
    "https://docs.github.com/apps/creating-github-apps/registering-a-github-app/registering-a-github-app",
  code_challenge_methods_supported: ["S256"],
  device_authorization_endpoint: "https://github.com/login/device/code",
  authorization_response_iss_parameter_supported: true,
  scopes_supported: ["offline_access"],
};
const TOKEN_URL = "https://github.com/login/oauth/access_token";

afterEach(() => {
  vi.restoreAllMocks();
});

/** GitHub on the core's `Fetch`: `seen` holds every request, in order. */
function stubGitHub(user: unknown, emailList: unknown) {
  const seen: Request[] = [];
  const fetch = async (request: Request) => {
    seen.push(request);
    if (request.url === "https://github.com/.well-known/oauth-authorization-server/login/oauth") {
      return Response.json(metadata);
    }
    if (request.url === TOKEN_URL) {
      // GitHub's documented JSON answer to the code exchange
      // (docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).
      return Response.json({
        access_token: "gho_token",
        scope: "read:user,user:email",
        token_type: "bearer",
      });
    }
    if (request.headers.get("authorization") !== "Bearer gho_token") {
      return new Response("Bad credentials", { status: 401 });
    }
    const path = new URL(request.url).pathname;
    if (path === "/user") return Response.json(user);
    if (path === "/user/emails") return Response.json(emailList);
    return new Response("not found", { status: 404 });
  };
  return { seen, fetch };
}

const connector = Effect.runSync(
  readConnector(
    github({
      clientId: Effect.succeed(Redacted.make("id")),
      clientSecret: Effect.succeed(Redacted.make("secret")),
      selectAccount: false,
    }),
  ),
);

test("the real payloads give the id, the name, the avatar and the verified primary email", async () => {
  const { seen, fetch } = stubGitHub(octocat, emails);
  const identity = await githubIdentity("gho_token", fetch);
  expect(identity).toEqual({
    upstreamId: "1",
    name: "monalisa octocat",
    picture: "https://github.com/images/error/octocat_happy.gif",
    email: "octocat@github.com",
    emailVerified: true,
  });
  expect(seen.map((request) => new URL(request.url).pathname)).toEqual(["/user", "/user/emails"]);
  expect(seen[0]?.headers.get("user-agent")).toBe("identity-broker");
});

test("no verified address means no email claim, whatever /user says", async () => {
  const { fetch } = stubGitHub(octocat, [
    { email: "octocat@github.com", verified: false, primary: true, visibility: "public" },
  ]);
  const identity = await githubIdentity("gho_token", fetch);
  expect(identity.email).toBeUndefined();
  expect(identity.emailVerified).toBeUndefined();
});

test("a user without a display name falls back to the login", async () => {
  const { fetch } = stubGitHub({ ...octocat, name: null }, emails);
  expect((await githubIdentity("gho_token", fetch)).name).toBe("octocat");
});

test("a /user response without an id is an error", async () => {
  const { fetch } = stubGitHub({ login: "octocat" }, emails);
  await expect(githubIdentity("gho_token", fetch)).rejects.toThrow(/no id/);
});

/**
 * A sign-in through the broker's GitHub callback. The query has the shape of a real GitHub
 * callback to the hub on 2026-10-29, `code`, then `iss` (RFC 9207), then `state`; the code and
 * the state are this test's own. An `iss` of `undefined` leaves the parameter out.
 */
async function signInWithIss(
  iss: string | undefined,
  github: (request: Request) => Promise<Response>,
) {
  const h = await createBroker({ config: { connectors: [connector] } });
  h.fetch.plan({ match: () => true, respond: github });
  const redirectUri = "https://app.test/oauth/hub/callback";
  const { clientId } = await h.registerClient({ appName: "My app", redirectUri });
  const { challenge } = await pkce();
  const authorize = new URL(`${h.issuer}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const started = await h.fetchBroker(authorize);
  const upstream = new URL(started.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "github-code");
  if (iss !== undefined) {
    callback.searchParams.set("iss", iss);
  }
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  return new URL(back.headers.get("location") ?? "");
}

test("a callback with GitHub's iss completes the sign-in", async () => {
  const { seen, fetch } = stubGitHub(octocat, emails);
  const back = await signInWithIss("https://github.com/login/oauth", fetch);
  expect(back.searchParams.get("code")).toBeTruthy();
  expect(seen.map((request) => request.url)).toContain(TOKEN_URL);
});

test("a callback whose iss names another issuer is refused before the code exchange", async () => {
  const { seen, fetch } = stubGitHub(octocat, emails);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const back = await signInWithIss("https://accounts.google.com", fetch);
  expect(back.searchParams.get("error")).toBe("server_error");
  expect(logged).toHaveBeenCalledWith('Connector "github" failed: OperationProcessingError');
  expect(seen.map((request) => request.url)).not.toContain(TOKEN_URL);
});

test("a callback without iss is refused before the code exchange: GitHub's metadata advertises it", async () => {
  const { seen, fetch } = stubGitHub(octocat, emails);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const back = await signInWithIss(undefined, fetch);
  expect(back.searchParams.get("error")).toBe("server_error");
  expect(logged).toHaveBeenCalledWith('Connector "github" failed: OperationProcessingError');
  expect(seen.map((request) => request.url)).not.toContain(TOKEN_URL);
});
