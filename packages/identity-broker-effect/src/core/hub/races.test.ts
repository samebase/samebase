// The registration tests that design section 12 adds: a development registration that waits on its
// verification file while the repository moves to another owner, proofs of another owner that are
// not newer, and credentials that never reach a log line or an error body.
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createClient,
  createHub,
  createInitialAccessToken,
  EPOCH,
  jsonResponse,
  JWKS_URL,
  LOOPBACK_CALLBACK,
  OWNER_ID,
  postHubClient,
  pullRequestClaims,
  readNewClient,
  REPOSITORY_ID,
  signToken,
  stubProviders,
  testPolicy,
  type Hub,
} from "./testing/hub.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A promise that the test settles from outside. */
function deferred() {
  let settle = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: () => settle() };
}

/** The rows that a refused registration must leave as they were. */
const durableRows = (h: Hub) => {
  const rows = h.rows();
  return {
    tenants: rows.tenants,
    apps: rows.apps,
    clients: rows.clients,
    events: rows.events,
    initialAccessTokens: rows.initialAccessTokens,
  };
};

describe("a development registration held while the repository moves", () => {
  it("creates no client when a newer proof of another owner registers during its file fetch", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    // The first accepted proof recorded its time on the tenant.
    expect(h.rows().tenants).toEqual([
      { tenantId: `gh-${REPOSITORY_ID}`, ownerId: OWNER_ID, ownerProofIssuedAt: EPOCH / 1_000 },
    ]);
    const reached = deferred();
    const release = deferred();
    let held = false;
    await stubProviders(h, async () => {
      if (!held) {
        held = true;
        reached.settle();
        await release.promise;
      }
      return jsonResponse({ repository: REPOSITORY_ID });
    });

    // The development server's request passes the token lookup and `admit`, then waits on its file.
    const pending = postHubClient(h, token, {
      redirect_uris: ["https://dev.example.com/auth/hub/callback"],
    });
    await reached.promise;
    // The repository moves to owner 66, whose run registers with a newer proof.
    h.clock.advance(1_000);
    const transferred = await postHubClient(
      h,
      await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" }),
    );
    expect(transferred.status).toBe(201);
    expect(h.rows().initialAccessTokens).toEqual([]);
    const before = durableRows(h);
    release.settle();
    const response = await pending;

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "invalid_token",
      error_description: "The token is invalid.",
    });
    expect(durableRows(h)).toEqual(before);
    expect(h.rows().clients.map((row) => row.deploymentType)).toEqual(["production", "preview"]);
    expect(h.rows().tenants).toEqual([
      { tenantId: `gh-${REPOSITORY_ID}`, ownerId: "66", ownerProofIssuedAt: EPOCH / 1_000 + 1 },
    ]);
  });

  it("creates no client when the old owner's token is rotated away by its own production run during the fetch", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    const reached = deferred();
    const release = deferred();
    let held = false;
    await stubProviders(h, async () => {
      if (!held) {
        held = true;
        reached.settle();
        await release.promise;
      }
      return jsonResponse({ repository: REPOSITORY_ID });
    });

    const pending = postHubClient(h, token, {
      redirect_uris: ["https://dev.example.com/auth/hub/callback"],
    });
    await reached.promise;
    const rotated = await postHubClient(h, await signToken(h));
    expect(rotated.status).toBe(201);
    release.settle();

    expect((await pending).status).toBe(401);
    expect(h.rows().clients.map((row) => row.deploymentType)).toEqual(["production", "production"]);
  });
});

describe("a proof of another owner that is not newer", () => {
  it.each([
    ["of the same second", 0],
    ["older", -5_000],
  ])("is refused when it is %s, and writes nothing but the request counts", async (_, offset) => {
    const h = await createHub();
    h.clock.set(EPOCH + 10_000);
    await createClient(h);
    h.clock.set(EPOCH + 10_000 + offset);
    const stale = await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" });
    h.clock.set(EPOCH + 11_000);
    await stubProviders(h);
    const before = durableRows(h);
    const windows = h.rows().rateLimits;

    const response = await postHubClient(h, stale);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "stale_proof" });
    expect(durableRows(h)).toEqual(before);
    // `admit` counted the request in the windows of the repository and of owner 66; the creating
    // command wrote nothing, also no new-owner count.
    expect(h.rows().rateLimits).toEqual([
      ...windows.map((row) => (row.scope === "repository" ? { ...row, count: 2 } : row)),
      { scope: "owner", githubId: "66", startedAt: EPOCH + 11_000, count: 1 },
    ]);
  });

  it("is accepted one second later, and moves the owner and the proof time", async () => {
    const h = await createHub();
    await createClient(h);
    h.clock.advance(1_000);
    await stubProviders(h);

    const response = await postHubClient(
      h,
      await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" }),
    );

    expect(response.status).toBe(201);
    expect(h.rows().tenants).toEqual([
      { tenantId: `gh-${REPOSITORY_ID}`, ownerId: "66", ownerProofIssuedAt: EPOCH / 1_000 + 1 },
    ]);
  });
});

describe("credentials in logs and error bodies", () => {
  /**
   * Runs `scenario` with every console method recorded, and answers what the hub wrote there
   * with the text of every answer the scenario collected.
   */
  async function observe(scenario: (answers: Response[]) => Promise<void>) {
    const logs = (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const answers: Response[] = [];
    await scenario(answers);
    const bodies = await Promise.all(answers.map(async (answer) => await answer.text()));
    return `${JSON.stringify(logs.map((log) => log.mock.calls))}\n${bodies.join("\n")}`;
  }

  it("never shows a proof token, an initial access token, a client secret, or a registration token", async () => {
    const SENTINEL = "SENTINEL7c1e";
    const sentinels: string[] = [];
    const h = await createHub({
      policy: (registration) => {
        if (registration.app === "throwing-app") {
          throw new Error(`policy failed for ${SENTINEL}`);
        }
        return testPolicy();
      },
    });
    const text = await observe(async (answers) => {
      // A good registration, whose credentials must not show anywhere afterwards.
      const production = await createClient(h);
      sentinels.push(
        production.client_secret,
        production.registration_access_token,
        production.initial_access_token ?? "missing",
      );
      await stubProviders(h);
      // Malformed input: a body that quotes a credential, a bad proof, an unknown token.
      const goodProof = await signToken(h, { sha: SENTINEL });
      sentinels.push(goodProof);
      answers.push(
        await postHubClient(h, goodProof, {
          software_id: `gh-75/${SENTINEL}`,
          redirect_uris: [`https://${SENTINEL}.example/#${production.client_secret}`],
        }),
      );
      const foreignProof = await signToken(h, { sha: SENTINEL }, { foreign: true });
      sentinels.push(foreignProof);
      answers.push(await postHubClient(h, foreignProof));
      const unknownToken = `${SENTINEL}-unknown-initial-access-token`;
      sentinels.push(unknownToken);
      answers.push(await postHubClient(h, unknownToken, { redirect_uris: [LOOPBACK_CALLBACK] }));
      // The policy throws with a credential in its message.
      answers.push(await postHubClient(h, goodProof, { software_id: "throwing-app" }));
      // A host whose file quotes a credential.
      await stubProviders(h, () =>
        jsonResponse({ repository: "999", note: production.client_secret }),
      );
      answers.push(await postHubClient(h, goodProof));
      // A management request with a wrong token, and with the right one.
      const wrongToken = `${SENTINEL}-registration-token`;
      sentinels.push(wrongToken);
      answers.push(
        await h.fetchBroker(production.registration_client_uri, {
          headers: { Authorization: `Bearer ${wrongToken}` },
        }),
      );
      // GitHub's keys cannot be read.
      h.fetch.plan({
        match: (request) => request.url === JWKS_URL,
        respond: () => new Response(`no keys for ${goodProof}`, { status: 503 }),
      });
      answers.push(await postHubClient(h, goodProof));
      // Command failures: every command of the store fails.
      h.failCommands(() => true);
      answers.push(
        await postHubClient(h, production.initial_access_token ?? "", {
          redirect_uris: [LOOPBACK_CALLBACK],
        }),
      );
      answers.push(
        await h.fetchBroker(production.registration_client_uri, {
          headers: { Authorization: `Bearer ${production.registration_access_token}` },
        }),
      );
      answers.push(
        await h.fetchBroker(production.registration_client_uri, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${production.registration_access_token}` },
        }),
      );
      h.failCommands(null);
      // The development client: its own answer holds its credentials once, and nothing else does.
      const development = await postHubClient(h, production.initial_access_token ?? "", {
        redirect_uris: [LOOPBACK_CALLBACK],
      });
      expect(development.status).toBe(201);
      const developmentClient = await readNewClient(development);
      sentinels.push(developmentClient.client_secret, developmentClient.registration_access_token);
    });

    expect(sentinels).toHaveLength(9);
    for (const sentinel of [...sentinels, SENTINEL]) {
      expect(text).not.toContain(sentinel);
    }
  });

  it("answers a failed command with a bare 500", async () => {
    const h = await createHub();
    const production = await createClient(h);
    h.failCommands((name) => name === "hubClients.createDevelopmentClient");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await postHubClient(h, production.initial_access_token ?? "", {
      redirect_uris: [LOOPBACK_CALLBACK],
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });
});
