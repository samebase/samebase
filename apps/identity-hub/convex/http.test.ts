import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  makeConvexTest,
  MODERATION_KEY,
  postHubClient,
  PRODUCTION_CALLBACK,
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
      connectors: ["github", "google"],
      terms: "https://samebase.com/terms",
      initial_access_token: expect.any(String),
    });
  });

  it("offers google and github, and names them to a registration that asks for another", async () => {
    const t = makeConvexTest();
    stubProviders();

    const discovery = await t.fetch("/.well-known/openid-configuration");
    const response = await postHubClient(t, await signToken(), { connectors: ["okta"] });

    expect((await discovery.json()).connectors_supported).toEqual(["google", "github"]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_connectors",
      allowed: ["github", "google"],
    });
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

  it("shows the consent page to every app but samebase.com's production", async () => {
    const t = makeConvexTest();
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
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

    const signIn = async (registration: Response) => {
      const { client_id } = await registration.json();
      return await t.fetch(
        // eslint-disable-next-line no-restricted-globals -- This test sends an OAuth authorize request.
        `/authorize?${new URLSearchParams({
          client_id,
          redirect_uri: PRODUCTION_CALLBACK,
          response_type: "code",
          scope: "openid email profile",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          connector: "google",
        }).toString()}`,
      );
    };
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
    const previewPage = await signIn(samebasePreview);
    const production = await signIn(samebaseProduction);

    expect(strangerPage.status).toBe(200);
    expect(await strangerPage.text()).toContain("Samebase has not reviewed this app.");
    expect(previewPage.status).toBe(200);
    expect(production.status).toBe(302);
    expect(new URL(production.headers.get("location") ?? "").origin).toBe(
      "https://accounts.google.com",
    );
  });

  it("answers /moderation/counts only with HUB_MODERATION_KEY", async () => {
    const t = makeConvexTest();

    const without = await t.fetch("/moderation/counts");
    const withKey = await t.fetch("/moderation/counts", {
      headers: { Authorization: `Bearer ${MODERATION_KEY}` },
    });

    expect(without.status).toBe(401);
    expect(withKey.status).toBe(200);
  });
});
