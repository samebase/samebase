import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  makeConvexTest,
  MODERATION_KEY,
  postHubClient,
  PRODUCTION_CALLBACK,
  REPOSITORY_ID,
  signToken,
  stubProviders,
} from "./test.setup";

// The hub's own wiring: `convex/broker.ts` passes the policy and the registration config from the
// env, and `convex/http.ts` mounts its routes. The rules themselves are tested in
// @samebase/identity-broker.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the hub", () => {
  it("answers a production registration with the enrollment, the terms, and the app's initial access token", async () => {
    const t = makeConvexTest();
    stubProviders();

    const response = await postHubClient(t, await signToken());

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      connectors: ["github-apps", "google-apps"],
      terms: "https://samebase.com/terms",
      initial_access_token: expect.any(String),
    });
  });

  it("offers four connectors, and names the public pair to a registration that asks for another", async () => {
    const t = makeConvexTest();
    stubProviders();

    const discovery = await t.fetch("/.well-known/openid-configuration");
    const response = await postHubClient(t, await signToken(), { connectors: ["okta"] });

    expect((await discovery.json()).connectors_supported).toEqual([
      "google",
      "github",
      "google-apps",
      "github-apps",
    ]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_connectors",
      allowed: ["github-apps", "google-apps"],
    });
  });

  it("gives the operator every connector, and an app the private one that the admin grants it", async () => {
    const t = makeConvexTest();
    stubProviders();
    const moderation = (path: string, body?: unknown) =>
      t.fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${MODERATION_KEY}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const stranger = await postHubClient(t, await signToken(), { connectors: ["google"] });
    expect(stranger.status).toBe(400);
    expect(await stranger.json()).toEqual({
      error: "invalid_connectors",
      allowed: ["github-apps", "google-apps"],
    });
    stubProviders("1021726325");
    const operator = await postHubClient(
      t,
      await signToken({ repository_id: "1021726325", repository_owner_id: "285392744" }),
      { connectors: ["google", "github"] },
    );
    expect(operator.status).toBe(201);

    // The admin grants `google` to the stranger's repository from samebase.com's admin page.
    stubProviders();
    const granted = await moderation("/moderation/connector-grants", {
      repositoryId: REPOSITORY_ID,
      connector: "google",
      expectedOwnerId: "65",
      grant: true,
      reason: "A team we know",
      adminEmail: "nicu@samebase.com",
    });
    expect(await granted.json()).toEqual({ changed: true });
    const withGrant = await postHubClient(t, await signToken(), { connectors: ["google"] });
    expect(withGrant.status).toBe(201);
  });

  it("pauses every app but samebase.com's production with APPS_PAUSED", async () => {
    const t = makeConvexTest();
    vi.stubEnv("APPS_PAUSED", "true");
    stubProviders();

    const stranger = await postHubClient(t, await signToken());
    stubProviders("1021726325");
    const samebasePreview = await postHubClient(
      t,
      await signToken({
        repository_id: "1021726325",
        repository_owner_id: "285392744",
        event_name: "pull_request",
        ref: "refs/pull/12/merge",
      }),
    );
    const samebaseProduction = await postHubClient(
      t,
      await signToken({ repository_id: "1021726325", repository_owner_id: "285392744" }),
    );

    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: "not_allowed", reason: "paused" });
    expect(samebasePreview.status).toBe(403);
    expect(samebaseProduction.status).toBe(201);
  });

  it("shows the page to every app, samebase.com's production included, until the admin exempts it", async () => {
    const t = makeConvexTest();
    vi.stubEnv("GOOGLE_APPS_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_APPS_CLIENT_SECRET", "google-secret");
    stubProviders();
    const stranger: { client_id: string } = await (
      await postHubClient(t, await signToken())
    ).json();
    stubProviders("1021726325");
    const samebasePreview: { client_id: string } = await (
      await postHubClient(
        t,
        await signToken({
          repository_id: "1021726325",
          repository_owner_id: "285392744",
          event_name: "pull_request",
          ref: "refs/pull/12/merge",
        }),
      )
    ).json();
    const samebaseProduction: { client_id: string } = await (
      await postHubClient(
        t,
        await signToken({ repository_id: "1021726325", repository_owner_id: "285392744" }),
      )
    ).json();

    const signIn = async ({ client_id }: { client_id: string }) =>
      await t.fetch(
        // eslint-disable-next-line no-restricted-globals -- This test sends an OAuth authorize request.
        `/authorize?${new URLSearchParams({
          client_id,
          redirect_uri: PRODUCTION_CALLBACK,
          response_type: "code",
          scope: "openid email profile",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          connector: "google-apps",
        }).toString()}`,
      );
    // The connector's first hop reads Google's discovery document: its endpoints, read 2026-11-07.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          issuer: "https://accounts.google.com",
          authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
          token_endpoint: "https://oauth2.googleapis.com/token",
          jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        }),
      ),
    );
    const strangerPage = await signIn(stranger);
    expect(strangerPage.status).toBe(200);
    expect(await strangerPage.text()).toContain("Samebase has not reviewed this app.");
    expect((await signIn(samebasePreview)).status).toBe(200);
    expect((await signIn(samebaseProduction)).status).toBe(200);

    // The admin exempts samebase.com's repository from samebase.com's admin page.
    const exempt = await t.fetch("/moderation/sign-in-page", {
      method: "POST",
      headers: { Authorization: `Bearer ${MODERATION_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        target: { scope: "repository", repositoryId: "1021726325", expectedOwnerId: "285392744" },
        skip: true,
        reason: "samebase.com is Samebase",
        adminEmail: "nicu@samebase.com",
      }),
    });
    expect(await exempt.json()).toEqual({ changed: true });

    const direct = await signIn(samebaseProduction);
    expect(direct.status).toBe(302);
    expect(new URL(direct.headers.get("location") ?? "").origin).toBe(
      "https://accounts.google.com",
    );
    // The exemption covers every app and deployment of the repository.
    expect((await signIn(samebasePreview)).status).toBe(302);
    expect((await signIn(stranger)).status).toBe(200);
  });

  it("skips the page for a repository or every app that the admin exempts, and GitHub shows its account picker", async () => {
    const t = makeConvexTest();
    vi.stubEnv("GOOGLE_APPS_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_APPS_CLIENT_SECRET", "google-secret");
    vi.stubEnv("AUTH_GITHUB_APPS_CLIENT_ID", "github-client");
    vi.stubEnv("AUTH_GITHUB_APPS_CLIENT_SECRET", "github-secret");
    stubProviders();
    const trusted = await (await postHubClient(t, await signToken())).json();
    stubProviders("75");
    const other = await (await postHubClient(t, await signToken({ repository_id: "75" }))).json();
    const moderation = (path: string, body?: unknown) =>
      t.fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${MODERATION_KEY}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    // The admin page binds the row to the repository and the owner it shows.
    const exempt = await moderation("/moderation/sign-in-page", {
      target: { scope: "repository", repositoryId: REPOSITORY_ID, expectedOwnerId: "65" },
      skip: true,
      reason: "A team we know",
      adminEmail: "nicu@samebase.com",
    });
    expect(await exempt.json()).toEqual({ changed: true });

    const signIn = async (client: { client_id: string }, connector: string) =>
      await t.fetch(
        // eslint-disable-next-line no-restricted-globals -- This test sends an OAuth authorize request.
        `/authorize?${new URLSearchParams({
          client_id: client.client_id,
          redirect_uri: PRODUCTION_CALLBACK,
          response_type: "code",
          scope: "openid email profile",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          connector,
        }).toString()}`,
      );
    // Google's discovery document and GitHub's RFC 8414 metadata: their endpoints, read 2026-11-07.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(
          new Request(input).url.startsWith("https://github.com/")
            ? {
                issuer: "https://github.com/login/oauth",
                authorization_endpoint: "https://github.com/login/oauth/authorize",
                token_endpoint: "https://github.com/login/oauth/access_token",
              }
            : {
                issuer: "https://accounts.google.com",
                authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                token_endpoint: "https://oauth2.googleapis.com/token",
                jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
              },
        ),
      ),
    );

    // The page shows by default; the broker skips it for the exempt repository only.
    expect((await signIn(trusted, "google-apps")).status).toBe(302);
    expect((await signIn(other, "google-apps")).status).toBe(200);
    await moderation("/moderation/sign-in-page", {
      target: { scope: "every_app" },
      skip: true,
      reason: "Launch week",
      adminEmail: "nicu@samebase.com",
    });
    const github = await signIn(other, "github-apps");
    expect(github.status).toBe(302);
    const location = new URL(github.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("prompt")).toBe("select_account");
  });

  it("answers /moderation/counts only with IDENTITY_HUB_MODERATION_KEY", async () => {
    const t = makeConvexTest();

    const without = await t.fetch("/moderation/counts");
    const withKey = await t.fetch("/moderation/counts", {
      headers: { Authorization: `Bearer ${MODERATION_KEY}` },
    });

    expect(without.status).toBe(401);
    expect(withKey.status).toBe(200);
  });
});
