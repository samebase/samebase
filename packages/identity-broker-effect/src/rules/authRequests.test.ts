// Port of packages/identity-broker/src/component/authRequests.test.ts, on both hosts. The core
// computes the S256 challenge of the verifier, so these tests pass challenges.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import type { Args } from "../store/Store.ts";
import type { Doc } from "../store/tables.ts";
import { LEASE_MS } from "./registration.ts";
import type { PolicyDecision } from "./schemas.ts";
import { patch, remove, rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const now = 1_700_000_000_000;
/** The S256 challenge stored at `/authorize`, and the core's challenge of the right verifier. */
const challenge = "challenge-of-verifier";
/** The enrollment of client "cl", and the set of every request of it. */
const CONNECTORS = ["g", "github", "google"];

/** The client's credentials and the return address every request of these tests names. */
const cl = {
  clientId: "cl",
  clientSecretHash: "secret-hash",
  tokenEndpointAuthMethod: "client_secret_post",
  redirectUri: "https://app.test/cb",
} as const;

/** The host's decision for "cl" when its policy allows everything it enrolled in. */
const policy: PolicyDecision = {
  ownerId: "65",
  paused: false,
  connectors: CONNECTORS,
  configured: CONNECTORS,
};

const testClientRecord = {
  app: "my-app",
  registeredBy: {
    kind: "github",
    githubRepository: "octo-org/octo-repo",
    githubOwnerId: "65",
    githubActorId: "12",
    githubActorLogin: "octocat",
    commitSha: "example-sha",
  },
} as const;

const ownerBlock: Doc<"blocks"> = {
  kind: "owner",
  githubId: "65",
  reason: "Phishing page",
  adminEmail: "admin@example.com",
  at: now,
};

describe.each(hosts)("%s", (_name, make) => {
  /** App "app" of the repository `gh-1` of owner 65, with its preview client "cl", with or without a removal date. */
  const registered = (expires = false) => {
    const t = make({ now });
    seed(t, "tenants", [{ tenantId: "gh-1", ownerId: "65" }]);
    seed(t, "apps", [{ appId: "app", name: "App", tenantId: "gh-1", createdAt: now }]);
    seed(t, "clients", [
      {
        clientId: cl.clientId,
        appId: "app",
        secretHash: cl.clientSecretHash,
        registrationTokenHash: "token-hash",
        tokenEndpointAuthMethod: cl.tokenEndpointAuthMethod,
        redirectUris: ["https://app.test/cb"],
        deploymentType: "preview",
        clientName: "App preview",
        softwareVersion: "v1",
        createdAt: now,
        renewedAt: now,
        ...testClientRecord,
        connectors: CONNECTORS,
        ...(expires ? { removeAt: now + LEASE_MS } : {}),
      },
    ]);
    return t;
  };

  const pendingRequest = (requestId = "r1", given?: TestHost, connectors = CONNECTORS) => {
    const t = given ?? registered();
    const created = t.run("authRequests.create", {
      tenantId: "gh-1",
      requestId,
      appId: "app",
      clientId: "cl",
      redirectUri: "https://app.test/cb",
      scope: "openid",
      state: "s",
      codeChallenge: challenge,
      connectors,
      policy,
      freshLogin: false,
      txnCookieHash: "cookie-hash",
      createdAt: now,
      expiresAt: now + 600_000,
    });
    expect(created).toEqual({ ok: true, connectors });
    return t;
  };

  const start = (t: TestHost, args: Partial<Args<"authRequests.startUpstream">> = {}) =>
    t.run("authRequests.startUpstream", {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      policy,
      now,
      ...args,
    });
  const claim = (t: TestHost, args: Partial<Args<"authRequests.claimUpstream">> = {}) =>
    t.run("authRequests.claimUpstream", {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      policy,
      now,
      ...args,
    });
  const complete = (t: TestHost, args: Partial<Args<"authRequests.complete">> = {}) =>
    t.run("authRequests.complete", {
      requestId: "r1",
      identity: { connector: "g", upstreamId: "1" },
      authTime: now,
      codeHash: "ch",
      codeExpiresAt: now + 60_000,
      policy,
      now,
      ...args,
    });
  const exchange = (t: TestHost, args: Partial<Args<"authRequests.exchangeCode">> = {}) =>
    t.run("authRequests.exchangeCode", {
      ...cl,
      codeHash: "ch",
      codeChallengeOfVerifier: challenge,
      policy,
      now,
      ...args,
    });
  const get = (t: TestHost) => t.run("authRequests.get", { requestId: "r1" });
  const codes = (t: TestHost) => rowsOf(t, "authorizationCodes", "by_code_hash");

  describe("upstream path", () => {
    test("pending, upstream, claimed, completed, exchanged", () => {
      const t = pendingRequest();
      expect(start(t, { connector: "github" })).toEqual({
        ok: true,
        redirectUri: "https://app.test/cb",
        state: "s",
      });
      expect(claim(t, { connector: "github" }).status).toBe("claimed");
      // The claim is single use.
      expect(claim(t, { connector: "github" })).toEqual({ status: "missing" });
      // A claimed request cannot restart.
      expect(start(t, { connector: "github", upstreamStateHash: "x" })).toMatchObject({
        ok: false,
        error: "wrong_status",
      });
      expect(
        complete(t, {
          identity: { connector: "github", upstreamId: "42", email: "a@b.co", emailVerified: true },
        }).ok,
      ).toBe(true);
      expect(
        exchange(t, { codeChallengeOfVerifier: "challenge-of-another-verifier" }),
      ).toMatchObject({
        ok: false,
        description: expect.stringMatching(/code_verifier/),
      });
      const exchanged = exchange(t);
      expect(exchanged).toMatchObject({
        ok: true,
        appId: "app",
        identity: { upstreamId: "42" },
      });
      // The request asked for no fresh login, so the exchange names no login time.
      expect(exchanged).not.toHaveProperty("authTime");
      expect(get(t)).toBeNull();
      expect(exchange(t)).toMatchObject({
        ok: false,
        description: expect.stringMatching(/already used/),
      });
    });

    /** A request completed through the upstream path, with code hash "ch" issued to client "cl". */
    const completedCode = (given?: TestHost) => {
      const t = pendingRequest("r1", given);
      start(t);
      claim(t);
      complete(t);
      const redeem = (
        credentials: Pick<
          Args<"authRequests.exchangeCode">,
          "clientId" | "clientSecretHash" | "tokenEndpointAuthMethod"
        >,
        decision = policy,
      ) => exchange(t, { ...credentials, policy: decision });
      return { t, redeem };
    };

    const refused = {
      ok: false,
      error: "invalid_client",
      description: "Client authentication failed.",
    } as const;

    test("a client that fails authentication in the redemption leaves the code as it was", () => {
      const { t, redeem } = completedCode();
      const unchanged = () => {
        expect(codes(t).map((code) => [code.codeHash, code.usedAt])).toEqual([["ch", undefined]]);
        expect(get(t)).toMatchObject({ status: "completed" });
      };
      for (const credentials of [
        { ...cl, clientSecretHash: "wrong-hash" },
        { ...cl, tokenEndpointAuthMethod: "client_secret_basic" as const },
        { ...cl, clientId: "cl_unknown" },
      ]) {
        expect(redeem(credentials)).toEqual(refused);
        unchanged();
      }
      // deleteApp deletes the app row first and the app's clients in later batches.
      remove(t, "apps", "by_app_id", ["app"]);
      expect(redeem(cl)).toEqual(refused);
      unchanged();
    });

    test("the policy's pause and a stale owner refuse the redemption and leave the code", () => {
      const { t, redeem } = completedCode();
      expect(redeem(cl, { ...policy, paused: true })).toEqual({
        ok: false,
        error: "invalid_client",
        description: "This client is paused.",
      });
      // The tenant's owner is no longer the one the policy decided on.
      expect(redeem(cl, { ...policy, ownerId: "66" })).toEqual(refused);
      expect(codes(t).map((code) => code.usedAt)).toEqual([undefined]);
      expect(get(t)).toMatchObject({ status: "completed" });
      expect(redeem(cl)).toMatchObject({ ok: true });
    });

    test("a connector that the policy withdrew after the callback refuses the redemption", () => {
      const { redeem } = completedCode();
      expect(redeem(cl, { ...policy, connectors: ["github", "google"] })).toEqual({
        ok: false,
        error: "invalid_grant",
        description: "This client cannot sign in through that connector.",
      });
    });

    test("a code redeems once, and a failed authentication does not revoke a used code", () => {
      const { t, redeem } = completedCode();
      expect(redeem(cl)).toMatchObject({ ok: true, appId: "app" });
      expect(codes(t)).toMatchObject([{ codeHash: "ch", usedAt: now }]);
      expect(redeem({ ...cl, clientSecretHash: "wrong-hash" })).toEqual(refused);
      expect(codes(t)).toMatchObject([{ codeHash: "ch", usedAt: now }]);
      // The client's own replay revokes the code (RFC 9700 section 4.5.3).
      expect(redeem(cl)).toMatchObject({
        ok: false,
        error: "invalid_grant",
        description: "The authorization code was already used.",
      });
      expect(codes(t)).toEqual([]);
    });

    test("a sign-in moves the removal date of a client that expires, and gives none to another", () => {
      for (const expires of [true, false]) {
        const { t, redeem } = completedCode(registered(expires));
        // The client was created at `now` too, so an older date shows that the sign-in moved it.
        if (expires) {
          patch(t, "clients", "by_client_id", [cl.clientId], (client) => ({
            ...client,
            removeAt: 1,
          }));
        }
        expect(redeem(cl)).toMatchObject({ ok: true });
        const client = t.run("clients.get", { clientId: cl.clientId });
        expect(client?.lastSignInAt).toBe(now);
        expect(client?.removeAt).toBe(expires ? now + LEASE_MS : undefined);
      }
    });

    test("expiry at every step", () => {
      const t = pendingRequest();
      const late = now + 600_001;
      expect(start(t, { now: late })).toMatchObject({ ok: false, error: "expired" });
      start(t);
      expect(claim(t, { now: late })).toEqual({
        status: "expired",
        requestId: "r1",
        redirectUri: "https://app.test/cb",
        state: "s",
      });
      expect(get(t)).toBeNull();
    });

    test("another connector's callback cannot claim the request", () => {
      const t = pendingRequest();
      start(t, { connector: "google", upstreamNonce: "n" });
      expect(claim(t, { connector: "github" })).toEqual({ status: "missing" });
      expect(get(t)).toMatchObject({ status: "upstream" });
      expect(claim(t, { connector: "google" })).toMatchObject({
        status: "claimed",
        connector: "google",
        upstreamNonce: "n",
      });
    });

    test("a completed request outlives its code, so cleanup keeps it until the code is gone", () => {
      const t = pendingRequest();
      // The request expires at now + 600_000; the user finishes just before that.
      const late = now + 599_000;
      start(t, { now: late });
      claim(t, { now: late });
      complete(t, { authTime: late, codeExpiresAt: late + 60_000, now: late });
      const cleanup = (at: number) =>
        t.run("lifecycle.cleanup", {
          now: at,
          previewClientMaxAgeMs: 30 * 86_400_000,
          signInRetentionMs: 90 * 86_400_000,
        });
      expect(cleanup(late + 59_000)).toMatchObject({ authRequests: 0 });
      expect(exchange(t, { now: late + 59_000 })).toMatchObject({ ok: true });
    });
  });

  describe("what a request may use", () => {
    test("a connector outside the request's set, the enrollment, or the policy does not start", () => {
      const t = pendingRequest("r1", undefined, ["g", "github"]);
      const startWith = (connector: string, decision = policy) =>
        start(t, { connector, upstreamStateHash: `sh-${connector}`, policy: decision });
      const refused = {
        ok: false,
        error: "refused",
        redirectUri: "https://app.test/cb",
        state: "s",
      };
      // Enrolled and allowed, but not in the request's set.
      expect(startWith("google")).toEqual(refused);
      // In the set, but withdrawn by the policy since the request was stored.
      expect(startWith("github", { ...policy, connectors: ["g"] })).toEqual(refused);
      // In the set and allowed, but the policy decided on another owner, or paused the client.
      expect(startWith("github", { ...policy, ownerId: "66" })).toEqual(refused);
      expect(startWith("github", { ...policy, paused: true })).toEqual(refused);
      expect(get(t)).toMatchObject({ status: "pending" });
      expect(startWith("github")).toMatchObject({ ok: true });
    });

    test("a callback whose connector the policy withdrew, or that is paused, is refused and deleted", () => {
      for (const decision of [
        { ...policy, connectors: ["g", "google"] },
        { ...policy, paused: true },
        { ...policy, ownerId: "66" },
      ]) {
        const t = pendingRequest();
        start(t, { connector: "github" });
        expect(claim(t, { connector: "github", policy: decision })).toEqual({
          status: "refused",
          requestId: "r1",
          redirectUri: "https://app.test/cb",
          state: "s",
        });
        expect(get(t)).toBeNull();
      }
    });

    test("a block, a changed owner, a pause, or a withdrawn connector that landed while the provider answered refuses the completion", () => {
      const block = (t: TestHost) => {
        seed(t, "blocks", [ownerBlock]);
        return policy;
      };
      for (const landed of [
        block,
        () => ({ ...policy, ownerId: "66" }),
        () => ({ ...policy, paused: true }),
        () => ({ ...policy, connectors: ["g", "google"] }),
      ]) {
        const t = pendingRequest();
        start(t, { connector: "github" });
        claim(t, { connector: "github" });
        const decision = landed(t);
        expect(
          complete(t, { identity: { connector: "github", upstreamId: "42" }, policy: decision }),
        ).toEqual({ ok: false, error: "refused", redirectUri: "https://app.test/cb", state: "s" });
        expect(get(t)).toBeNull();
        expect(codes(t)).toEqual([]);
      }
    });

    test("a request of a blocked tenant is not stored", () => {
      const t = registered();
      seed(t, "blocks", [{ ...ownerBlock, kind: "repository", githubId: "1" }]);
      expect(
        t.run("authRequests.create", {
          tenantId: "gh-1",
          requestId: "r1",
          appId: "app",
          clientId: "cl",
          redirectUri: "https://app.test/cb",
          scope: "openid",
          codeChallenge: "c",
          connectors: CONNECTORS,
          policy,
          freshLogin: false,
          txnCookieHash: "cookie-hash",
          createdAt: now,
          expiresAt: now + 600_000,
        }),
      ).toEqual({ ok: false, error: "suspended" });
      expect(get(t)).toBeNull();
    });
  });

  // Rules that mutation testing found no test for: each test fails when the rule is weakened, such
  // as `<=` turned into `<` at an expiry or a fence dropped from the host's decision.
  describe("fences at the edges", () => {
    test("a decision made before the repository changed owner starts no upstream hop", () => {
      const t = pendingRequest();
      // The host decided for owner 65; the tenant's recorded owner moves before the step runs.
      patch(t, "tenants", "by_tenant_id", ["gh-1"], (tenant) => ({ ...tenant, ownerId: "66" }));
      expect(start(t)).toMatchObject({ ok: false, error: "refused" });
    });

    test.each(["start", "claim", "complete"] as const)(
      "a request refuses to %s at the very millisecond it expires",
      (step) => {
        const t = pendingRequest();
        const expiry = now + 600_000;
        const started = start(t, { now: step === "start" ? expiry : now });
        if (step === "start") {
          expect(started).toMatchObject({ ok: false, error: "expired" });
          return;
        }
        const claimed = claim(t, { now: step === "claim" ? expiry : now });
        if (step === "claim") {
          expect(claimed).toMatchObject({ status: "expired" });
          return;
        }
        expect(complete(t, { codeExpiresAt: expiry + 60_000, now: expiry })).toMatchObject({
          ok: false,
          error: "expired",
        });
      },
    );

    test("a code refuses redemption at the very millisecond it expires", () => {
      const t = pendingRequest();
      start(t);
      claim(t);
      complete(t);
      expect(exchange(t, { now: now + 60_000 })).toMatchObject({
        ok: false,
        error: "invalid_grant",
      });
    });

    test("a sign-in code refuses a resource parameter", () => {
      const t = pendingRequest();
      start(t);
      claim(t);
      complete(t);
      expect(exchange(t, { resource: "https://api.example.test/" })).toMatchObject({
        ok: false,
        error: "invalid_target",
      });
    });
  });
});
