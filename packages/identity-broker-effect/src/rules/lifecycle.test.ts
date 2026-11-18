// Port of packages/identity-broker/src/component/lifecycle.test.ts, on both hosts. A full batch
// answers `more`; the next call with the same arguments takes the rest.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vite-plus/test";
import type { Doc } from "../store/tables.ts";
import { BATCH } from "./lifecycle.ts";
import { rowsOf, seed, testHosts, type TestHost } from "./testing.ts";

const hosts = testHosts(() => new DatabaseSync(":memory:"));

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;
const MAX_AGE = 30 * DAY;

interface Fields {
  readonly clientId: string;
  readonly deploymentType: "production" | "development" | "preview";
  readonly createdAt: number;
  readonly lastSignInAt?: number;
  readonly removeAt?: number;
}

const clientOf = (fields: Fields): Doc<"clients"> => ({
  appId: "app",
  secretHash: "hash",
  tokenEndpointAuthMethod: "client_secret_post",
  redirectUris: ["https://app.test/callback"],
  clientName: "test",
  softwareVersion: "test",
  registrationTokenHash: "token-hash",
  renewedAt: fields.createdAt,
  app: "my-app",
  registeredBy: {
    kind: "github",
    githubRepository: "octo-org/octo-repo",
    githubOwnerId: "65",
    githubActorId: "12",
    githubActorLogin: "octocat",
    commitSha: "example-sha",
  },
  connectors: ["fake"],
  ...fields,
});

describe.each(hosts)("%s", (_name, make) => {
  const remaining = (t: TestHost) =>
    rowsOf(t, "clients", "by_client_id")
      .map((client) => client.clientId)
      .sort();
  const cleanup = (t: TestHost) =>
    t.run("lifecycle.cleanup", {
      now: NOW,
      previewClientMaxAgeMs: MAX_AGE,
      signInRetentionMs: 90 * DAY,
    });

  describe("client cleanup", () => {
    test("idle counts from the last sign-in, or from creation for a client never used", () => {
      const t = make();
      const old = NOW - MAX_AGE - DAY;
      const recent = NOW - DAY;
      seed(
        t,
        "clients",
        (
          [
            { clientId: "never-used-old", deploymentType: "preview", createdAt: old },
            { clientId: "never-used-recent", deploymentType: "preview", createdAt: recent },
            {
              clientId: "used-long-ago",
              deploymentType: "preview",
              createdAt: old,
              lastSignInAt: old,
            },
            {
              clientId: "used-recently",
              deploymentType: "preview",
              createdAt: old,
              lastSignInAt: recent,
            },
            {
              clientId: "used-at-zero",
              deploymentType: "preview",
              createdAt: old,
              lastSignInAt: 0,
            },
            {
              clientId: "used-before-1970",
              deploymentType: "preview",
              createdAt: old,
              lastSignInAt: -1,
            },
            { clientId: "production", deploymentType: "production", createdAt: old },
          ] satisfies ReadonlyArray<Fields>
        ).map(clientOf),
      );
      expect(cleanup(t)).toMatchObject({ previewClients: 4, more: false });
      expect(remaining(t)).toEqual(["never-used-recent", "production", "used-recently"]);
    });

    test("a client past its removal date goes, and a client without one stays", () => {
      const t = make();
      const old = NOW - MAX_AGE - DAY;
      seed(
        t,
        "clients",
        (
          [
            {
              clientId: "development-past",
              deploymentType: "development",
              createdAt: old,
              removeAt: NOW - 1,
            },
            {
              clientId: "preview-past",
              deploymentType: "preview",
              createdAt: NOW,
              removeAt: NOW - 1,
            },
            {
              clientId: "development-ahead",
              deploymentType: "development",
              createdAt: old,
              removeAt: NOW + 1,
            },
            { clientId: "development-undated", deploymentType: "development", createdAt: old },
            { clientId: "production", deploymentType: "production", createdAt: old },
          ] satisfies ReadonlyArray<Fields>
        ).map(clientOf),
      );
      expect(t.run("lifecycle.cleanup", { now: NOW, signInRetentionMs: 90 * DAY })).toMatchObject({
        expiredClients: 2,
        previewClients: 0,
      });
      expect(remaining(t)).toEqual(["development-ahead", "development-undated", "production"]);
    });

    test("recent clients in front of the idle ones do not hide them", () => {
      const t = make();
      const old = NOW - MAX_AGE - DAY;
      seed(t, "clients", [
        // More than a batch of live clients: a read that filtered after its limit would stop here.
        ...Array.from({ length: BATCH + 5 }, (_, index) =>
          clientOf({ clientId: `live-${index}`, deploymentType: "preview", createdAt: NOW - DAY }),
        ),
        clientOf({
          clientId: "idle",
          deploymentType: "preview",
          createdAt: old,
          lastSignInAt: old,
        }),
      ]);
      expect(cleanup(t)).toMatchObject({ previewClients: 1 });
      expect(remaining(t)).not.toContain("idle");
    });

    test("a batch that spans both reads leaves the rest to the next call", () => {
      const t = make();
      const old = NOW - MAX_AGE - DAY;
      seed(t, "clients", [
        ...Array.from({ length: BATCH - 1 }, (_, index) =>
          clientOf({ clientId: `never-${index}`, deploymentType: "preview", createdAt: old }),
        ),
        ...Array.from({ length: 2 }, (_, index) =>
          clientOf({
            clientId: `used-${index}`,
            deploymentType: "preview",
            createdAt: old,
            lastSignInAt: old,
          }),
        ),
      ]);
      expect(cleanup(t)).toMatchObject({ previewClients: BATCH, more: true });
      expect(remaining(t)).toHaveLength(1);
      expect(cleanup(t)).toMatchObject({ previewClients: 1, more: false });
      expect(remaining(t)).toEqual([]);
    });
  });

  test("expired requests and codes and old audit rows go, strictly before the cutoff", () => {
    const t = make();
    const request = {
      status: "pending",
      appId: "app",
      clientId: "c",
      redirectUri: "https://app.test/cb",
      scope: "openid",
      codeChallenge: "x",
      connectors: ["g"],
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
    const signIn = { appId: "app", clientId: "c", connector: "g", sub: "s" };
    seed(t, "signIns", [
      { ...signIn, at: NOW - 90 * DAY - 1 },
      { ...signIn, at: NOW - 90 * DAY },
    ]);
    expect(cleanup(t)).toEqual({
      authRequests: 1,
      authorizationCodes: 1,
      previewClients: 0,
      expiredClients: 0,
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
