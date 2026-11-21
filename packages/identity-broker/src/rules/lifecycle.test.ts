// Port of src/component/lifecycle.test.ts of 0.34.0, on both hosts. A full batch
// answers `more`; the next call with the same arguments takes the rest.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import type { Doc } from "../store/tables.ts";
import { BATCH } from "./lifecycle.ts";
import { rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

/** A card; `layer` gives it fields of a layer beside the core's, which go with the row. */
const cardOf = (fields: {
  readonly clientId: string;
  readonly removeAt?: number;
  readonly layer?: true;
}): Doc<"clients"> => ({
  clientId: fields.clientId,
  redirectUris: ["https://app.test/callback"],
  tokenEndpointAuthMethod: "client_secret_post",
  secretHash: "hash",
  connectors: ["fake"],
  connections: [],
  gates: [],
  confirm: true,
  budget: "test:app",
  ref: "test:app",
  ...(fields.removeAt === undefined ? {} : { removeAt: fields.removeAt }),
  createdAt: 0,
  ...(fields.layer
    ? {
        github: {
          appId: "gh-1-app",
          app: "app",
          deploymentType: "development",
          clientName: "development",
          softwareVersion: "1",
          registrationTokenHash: "token-hash",
          renewedAt: 0,
          registeredBy: {
            kind: "initial_access_token",
            githubRepository: "octo-org/octo-repo",
            githubOwnerId: "65",
            issuedAt: 0,
          },
          enrollment: ["fake"],
        },
      }
    : {}),
});

describe.each(hosts)("%s", (_name, make) => {
  const remaining = (t: TestHost) =>
    rowsOf(t, "clients", "by_client_id")
      .map((client) => client.clientId)
      .sort();
  const cleanup = (t: TestHost) =>
    t.run("lifecycle.cleanup", { now: NOW, signInRetentionMs: 90 * DAY });

  describe("card cleanup", () => {
    test("a card past its removal date goes with its layer's fields, and a card without one stays", () => {
      const t = make();
      seed(t, "clients", [
        cardOf({ clientId: "layer-past", removeAt: NOW - 1, layer: true }),
        cardOf({ clientId: "past", removeAt: NOW - 1 }),
        cardOf({ clientId: "at-cutoff", removeAt: NOW }),
        cardOf({ clientId: "ahead", removeAt: NOW + 1, layer: true }),
        cardOf({ clientId: "undated", layer: true }),
      ]);
      expect(cleanup(t)).toMatchObject({ clients: 2, more: false });
      expect(remaining(t)).toEqual(["ahead", "at-cutoff", "undated"]);
      expect(
        rowsOf(t, "clients", "by_github_app_id_and_deployment_type").map((row) => row.clientId),
      ).toEqual(["at-cutoff", "ahead", "undated"]);
    });

    test("a full batch of expired cards leaves the rest to the next call", () => {
      const t = make();
      seed(
        t,
        "clients",
        Array.from({ length: BATCH + 1 }, (_, index) =>
          cardOf({ clientId: `past-${index}`, removeAt: NOW - 1 - index }),
        ),
      );
      expect(cleanup(t)).toMatchObject({ clients: BATCH, more: true });
      expect(remaining(t)).toHaveLength(1);
      expect(cleanup(t)).toMatchObject({ clients: 1, more: false });
      expect(remaining(t)).toEqual([]);
    });
  });

  test("expired requests and codes and old audit rows go, strictly before the cutoff", () => {
    const t = make();
    const request = {
      status: "pending",
      clientId: "c",
      redirectUri: "https://app.test/cb",
      scope: "openid",
      codeChallenge: "x",
      connectors: ["g"],
      confirm: true,
      freshLogin: false,
      txnCookieHash: "h",
      createdAt: 0,
    } as const;
    seed(t, "authRequests", [
      { ...request, requestId: "past", expiresAt: NOW - 1 },
      { ...request, requestId: "at-cutoff", expiresAt: NOW },
    ]);
    seed(t, "authorizationCodes", [
      { codeHash: "past", requestId: "past", clientId: "c", expiresAt: NOW - 1 },
      { codeHash: "at-cutoff", requestId: "at-cutoff", clientId: "c", expiresAt: NOW },
    ]);
    const signIn = { clientId: "c", ref: "test:app", connector: "g", sub: "s" };
    seed(t, "signIns", [
      { ...signIn, at: NOW - 90 * DAY - 1 },
      { ...signIn, at: NOW - 90 * DAY },
    ]);
    expect(cleanup(t)).toEqual({
      authRequests: 1,
      authorizationCodes: 1,
      clients: 0,
      signIns: 1,
      more: false,
    });
    expect(rowsOf(t, "authRequests", "by_request_id").map((row) => row.requestId)).toEqual([
      "at-cutoff",
    ]);
    expect(rowsOf(t, "authorizationCodes", "by_code_hash").map((row) => row.codeHash)).toEqual([
      "at-cutoff",
    ]);
    expect(rowsOf(t, "signIns", "by_at").map((row) => row.at)).toEqual([NOW - 90 * DAY]);
  });
});
