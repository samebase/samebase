// Port of packages/identity-broker/src/component/authRequests.test.ts, on both hosts. The core
// computes the S256 challenge of the verifier, so these tests pass challenges. Each step reads the
// client's card in its own transaction: these tests change the card or its stops between steps.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import type { Args } from "../store/commands.ts";
import type { Doc } from "../store/tables.ts";
import { LEASE_MS } from "./clients.ts";
import { patch, remove, rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const now = 1_700_000_000_000;
/** The S256 challenge stored at `/authorize`, and the core's challenge of the right verifier. */
const challenge = "challenge-of-verifier";
/** The hub's configured connectors, and the set of the card of "cl". */
const CONNECTORS = ["g", "github", "google"];
const GATES = ["layer:repository:1", "layer:owner:65"];

/** The client's credentials and the return address every request of these tests names. */
const cl = {
  clientId: "cl",
  clientSecretHash: "secret-hash",
  tokenEndpointAuthMethod: "client_secret_post",
  redirectUri: "https://app.test/cb",
} as const;

const card = (expires: boolean): Doc<"clients"> => ({
  clientId: cl.clientId,
  redirectUris: [cl.redirectUri, "https://app.test/other"],
  tokenEndpointAuthMethod: cl.tokenEndpointAuthMethod,
  secretHash: cl.clientSecretHash,
  connectors: CONNECTORS,
  gates: GATES,
  confirm: true,
  budget: "layer:1",
  ref: "layer:1",
  ...(expires ? { removeAt: now + LEASE_MS } : {}),
  createdAt: now,
});

describe.each(hosts)("%s", (_name, make) => {
  /** The card of client "cl", with or without a removal date. */
  const registered = (expires = false) => {
    const t = make({ now });
    seed(t, "clients", [card(expires)]);
    return t;
  };

  const editCard = (t: TestHost, change: (doc: Doc<"clients">) => Doc<"clients">) =>
    patch(t, "clients", "by_client_id", [cl.clientId], change);
  const stop = (t: TestHost, key: string) => seed(t, "stops", [{ key, at: now }]);

  const create = (t: TestHost, args: Partial<Args<"authRequests.create">> = {}) =>
    t.run("authRequests.create", {
      requestId: "r1",
      clientId: "cl",
      redirectUri: cl.redirectUri,
      scope: "openid",
      state: "s",
      codeChallenge: challenge,
      requested: [],
      configured: CONNECTORS,
      liveGates: [],
      freshLogin: false,
      txnCookieHash: "cookie-hash",
      createdAt: now,
      expiresAt: now + 600_000,
      ...args,
    });

  const pendingRequest = (requestId = "r1", given?: TestHost, requested: string[] = []) => {
    const t = given ?? registered();
    expect(create(t, { requestId, requested })).toEqual({
      ok: true,
      connectors: requested.length === 0 ? CONNECTORS : requested,
      confirm: true,
    });
    return t;
  };

  const start = (t: TestHost, args: Partial<Args<"authRequests.startUpstream">> = {}) =>
    t.run("authRequests.startUpstream", {
      requestId: "r1",
      connector: "g",
      upstreamStateHash: "sh",
      upstreamCodeVerifier: "v",
      configured: CONNECTORS,
      liveGates: [],
      now,
      ...args,
    });
  const claim = (t: TestHost, args: Partial<Args<"authRequests.claimUpstream">> = {}) =>
    t.run("authRequests.claimUpstream", {
      upstreamStateHash: "sh",
      connector: "g",
      txnCookieHashes: ["cookie-hash"],
      configured: CONNECTORS,
      liveGates: [],
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
      configured: CONNECTORS,
      liveGates: [],
      now,
      ...args,
    });
  const exchange = (t: TestHost, args: Partial<Args<"authRequests.exchangeCode">> = {}) =>
    t.run("authRequests.exchangeCode", {
      ...cl,
      codeHash: "ch",
      codeChallengeOfVerifier: challenge,
      configured: CONNECTORS,
      liveGates: [],
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
        clientId: "cl",
        ref: "layer:1",
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
      ) => exchange(t, { ...credentials });
      return { t, redeem };
    };

    const refused = {
      ok: false,
      error: "invalid_client",
      description: "Client authentication failed.",
    } as const;

    const unchanged = (t: TestHost) => {
      expect(codes(t).map((code) => [code.codeHash, code.usedAt])).toEqual([["ch", undefined]]);
      expect(get(t)).toMatchObject({ status: "completed" });
    };

    test("a client that fails authentication in the redemption leaves the code as it was", () => {
      const { t, redeem } = completedCode();
      for (const credentials of [
        { ...cl, clientSecretHash: "wrong-hash" },
        { ...cl, tokenEndpointAuthMethod: "client_secret_basic" as const },
        { ...cl, clientId: "cl_unknown" },
      ]) {
        expect(redeem(credentials)).toEqual(refused);
        unchanged(t);
      }
      // The layer deleted the card.
      remove(t, "clients", "by_client_id", [cl.clientId]);
      expect(redeem(cl)).toEqual(refused);
      unchanged(t);
    });

    test("a stop on either gate refuses the redemption and leaves the code; one of two going leaves the other", () => {
      const { t, redeem } = completedCode();
      stop(t, "layer:repository:1");
      stop(t, "layer:owner:65");
      expect(redeem(cl)).toEqual(refused);
      remove(t, "stops", "by_key", ["layer:repository:1"]);
      expect(redeem(cl)).toEqual(refused);
      unchanged(t);
      remove(t, "stops", "by_key", ["layer:owner:65"]);
      expect(redeem(cl)).toMatchObject({ ok: true });
    });

    test("a connector taken off the card after the callback refuses the redemption", () => {
      const { t, redeem } = completedCode();
      editCard(t, (doc) => ({ ...doc, connectors: ["github", "google"] }));
      expect(redeem(cl)).toEqual({
        ok: false,
        error: "invalid_grant",
        description: "This client cannot finish this sign-in now.",
      });
      unchanged(t);
    });

    test("a return address taken off the card after the callback refuses the redemption", () => {
      const { t, redeem } = completedCode();
      editCard(t, (doc) => ({ ...doc, redirectUris: ["https://app.test/other"] }));
      expect(redeem(cl)).toMatchObject({ ok: false, error: "invalid_grant" });
      unchanged(t);
    });

    test("a connector that leaves the configuration refuses the redemption", () => {
      const { t } = completedCode();
      expect(exchange(t, { configured: ["github", "google"] })).toMatchObject({
        ok: false,
        error: "invalid_grant",
      });
      unchanged(t);
    });

    test("a code redeems once, and a failed authentication does not revoke a used code", () => {
      const { t, redeem } = completedCode();
      expect(redeem(cl)).toMatchObject({ ok: true, ref: "layer:1" });
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

    test("a sign-in moves the removal date of a temporary card, and gives none to another", () => {
      for (const expires of [true, false]) {
        const { t, redeem } = completedCode(registered(expires));
        // The card was created at `now` too, so an older date shows that the sign-in moved it.
        if (expires) {
          editCard(t, (doc) => ({ ...doc, removeAt: 1 }));
        }
        expect(redeem(cl)).toMatchObject({ ok: true });
        const stored = rowsOf(t, "clients", "by_client_id").at(0);
        expect(stored?.lastSignInAt).toBe(now);
        expect(stored?.removeAt).toBe(expires ? now + LEASE_MS : undefined);
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
        t.run("lifecycle.cleanup", { now: at, signInRetentionMs: 90 * 86_400_000 });
      expect(cleanup(late + 59_000)).toMatchObject({ authRequests: 0 });
      expect(exchange(t, { now: late + 59_000 })).toMatchObject({ ok: true });
    });
  });

  describe("what a request may use", () => {
    test("create stores the card's set of its step, answers its confirm, and spends its budget", () => {
      const t = registered();
      editCard(t, (doc) => ({ ...doc, connectors: ["g", "github"], confirm: false }));
      expect(create(t, { requested: ["github", "google"] })).toEqual({
        ok: true,
        connectors: ["github"],
        confirm: false,
      });
      expect(get(t)).toMatchObject({ connectors: ["github"] });
      expect(rowsOf(t, "signInBudgets", "by_key")).toMatchObject([{ key: "layer:1" }]);
      // A connector that the hub no longer configures is not stored either.
      expect(create(t, { requestId: "r2", configured: ["g"] })).toMatchObject({
        ok: true,
        connectors: ["g"],
      });
      expect(create(t, { requestId: "r3", requested: ["google"] })).toEqual({
        ok: false,
        error: "off",
      });
    });

    test("a stopped card, a missing card or a return address that left the card stores no request", () => {
      const stopped = registered();
      stop(stopped, "layer:owner:65");
      expect(create(stopped)).toEqual({ ok: false, error: "stopped" });
      const gone = registered();
      remove(gone, "clients", "by_client_id", [cl.clientId]);
      expect(create(gone)).toEqual({ ok: false, error: "unknown_client" });
      const moved = registered();
      editCard(moved, (doc) => ({ ...doc, redirectUris: ["https://app.test/other"] }));
      expect(create(moved)).toEqual({ ok: false, error: "redirect_uri" });
      for (const t of [stopped, gone, moved]) {
        expect(get(t)).toBeNull();
        expect(rowsOf(t, "signInBudgets", "by_key")).toEqual([]);
      }
    });

    test("a connector outside the request's set, the card, or the configuration does not start", () => {
      const t = pendingRequest("r1", undefined, ["g", "github"]);
      const startWith = (connector: string, configured = CONNECTORS) =>
        start(t, { connector, upstreamStateHash: `sh-${connector}`, configured });
      const refused = {
        ok: false,
        error: "refused",
        redirectUri: "https://app.test/cb",
        state: "s",
      };
      // On the card, but not in the request's set.
      expect(startWith("google")).toEqual(refused);
      // In the set and configured, but taken off the card since the request was stored.
      editCard(t, (doc) => ({ ...doc, connectors: ["g", "google"] }));
      expect(startWith("github")).toEqual(refused);
      editCard(t, (doc) => ({ ...doc, connectors: CONNECTORS }));
      // In the set and on the card, but no longer configured.
      expect(startWith("github", ["g"])).toEqual(refused);
      expect(get(t)).toMatchObject({ status: "pending" });
      expect(startWith("github")).toMatchObject({ ok: true });
    });

    test("a connector added to the card after the request was stored does not start", () => {
      const t = registered();
      editCard(t, (doc) => ({ ...doc, connectors: ["g"] }));
      pendingRequest("r1", t, ["g"]);
      editCard(t, (doc) => ({ ...doc, connectors: CONNECTORS }));
      expect(start(t, { connector: "github" })).toMatchObject({ ok: false, error: "refused" });
      expect(start(t, { connector: "g" })).toMatchObject({ ok: true });
    });

    test("a callback after a stop, a withdrawn connector or a moved return address is refused and deleted", () => {
      for (const landed of [
        (t: TestHost) => stop(t, "layer:repository:1"),
        (t: TestHost) => editCard(t, (doc) => ({ ...doc, connectors: ["g", "google"] })),
        (t: TestHost) => editCard(t, (doc) => ({ ...doc, redirectUris: ["https://app.test/x"] })),
      ]) {
        const t = pendingRequest();
        start(t, { connector: "github" });
        landed(t);
        expect(claim(t, { connector: "github" })).toEqual({
          status: "refused",
          requestId: "r1",
          redirectUri: "https://app.test/cb",
          state: "s",
        });
        expect(get(t)).toBeNull();
      }
    });

    test("a stop, a withdrawn connector or a moved return address that landed while the provider answered refuses the completion", () => {
      for (const landed of [
        (t: TestHost) => stop(t, "layer:owner:65"),
        (t: TestHost) => editCard(t, (doc) => ({ ...doc, connectors: ["g", "google"] })),
        (t: TestHost) => editCard(t, (doc) => ({ ...doc, redirectUris: ["https://app.test/x"] })),
        (t: TestHost) => remove(t, "clients", "by_client_id", [cl.clientId]),
      ]) {
        const t = pendingRequest();
        start(t, { connector: "github" });
        claim(t, { connector: "github" });
        landed(t);
        expect(complete(t, { identity: { connector: "github", upstreamId: "42" } })).toEqual({
          ok: false,
          error: "refused",
          redirectUri: "https://app.test/cb",
          state: "s",
        });
        expect(get(t)).toBeNull();
        expect(codes(t)).toEqual([]);
      }
    });
  });

  // Rules that mutation testing found no test for: each test fails when the rule is weakened, such
  // as `<=` turned into `<` at an expiry.
  describe("fences at the edges", () => {
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
