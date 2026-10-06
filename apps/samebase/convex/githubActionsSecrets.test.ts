import { Octokit } from "@octokit/rest";
import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vite-plus/test";

import {
  formatMissingGitHubAppPermissionMessage,
  sealGitHubActionsSecret,
  writeGitHubActionsSecrets,
} from "./githubActionsSecrets";

const RECIPIENT_SEED = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

beforeAll(async () => {
  await sodium.ready;
});

function recipientKeyPair() {
  return sodium.crypto_box_seed_keypair(RECIPIENT_SEED);
}

function toBase64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function openSealedSecret(sealed: string): string {
  const keyPair = recipientKeyPair();
  return sodium.crypto_box_seal_open(
    sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL),
    keyPair.publicKey,
    keyPair.privateKey,
    "text",
  );
}

type FakeGitHubResponse = { status: number; body?: unknown };
type FakeGitHubRequest = { method: string; path: string; body: unknown };

/** An Octokit whose fetch answers from `respond`, the GitHub REST shapes of these endpoints. */
function createFakeGitHub(respond: (request: FakeGitHubRequest) => FakeGitHubResponse) {
  const requests: FakeGitHubRequest[] = [];
  const octokit = new Octokit({
    request: {
      fetch: async (url: string, init: RequestInit) => {
        const request = {
          method: init.method ?? "GET",
          path: new URL(url).pathname,
          body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        };
        requests.push(request);
        const response = respond(request);
        return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
          status: response.status,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  return { octokit, requests };
}

function respondAsRepository(variableExists: boolean) {
  return (request: FakeGitHubRequest): FakeGitHubResponse => {
    if (request.path.endsWith("/actions/secrets/public-key")) {
      return {
        status: 200,
        body: { key_id: "test-key-id", key: toBase64(recipientKeyPair().publicKey) },
      };
    }
    if (request.method === "PUT") {
      return { status: 201, body: {} };
    }
    if (request.method === "GET" && request.path.includes("/actions/variables/")) {
      return variableExists
        ? { status: 200, body: { name: "CONVEX_TEAM_ID", value: "1" } }
        : { status: 404, body: { message: "Not Found" } };
    }
    return { status: request.method === "POST" ? 201 : 204 };
  };
}

function readEncryptedValue(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "encrypted_value" in body &&
    typeof body.encrypted_value === "string"
  ) {
    return body.encrypted_value;
  }
  throw new Error("The secret write carried no encrypted value.");
}

const noApiCallLog = async () => {};

describe("sealGitHubActionsSecret", () => {
  it("seals a value that libsodium opens with the matching secret key", () => {
    const publicKey = toBase64(recipientKeyPair().publicKey);

    const sealed = sealGitHubActionsSecret({ publicKey, value: "cloudflare-ci-test-token" });

    expect(openSealedSecret(sealed)).toBe("cloudflare-ci-test-token");
    expect(sealGitHubActionsSecret({ publicKey, value: "cloudflare-ci-test-token" })).not.toBe(
      sealed,
    );
  });

  it("rejects a public key that is not 32 bytes", () => {
    expect(() =>
      sealGitHubActionsSecret({ publicKey: toBase64(new Uint8Array(16)), value: "value" }),
    ).toThrow("GitHub returned an invalid Actions public key.");
  });
});

describe("writeGitHubActionsSecrets", () => {
  it("puts sealed secrets and creates a missing variable", async () => {
    const github = createFakeGitHub(respondAsRepository(false));

    await writeGitHubActionsSecrets({
      octokit: github.octokit,
      owner: "samebase",
      repo: "new-app",
      secrets: [{ name: "CLOUDFLARE_API_TOKEN", value: "cloudflare-ci-test-token" }],
      variables: [{ name: "CONVEX_TEAM_ID", value: "41" }],
      recordApiCall: noApiCallLog,
    });

    expect(github.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /repos/samebase/new-app/actions/secrets/public-key",
      "PUT /repos/samebase/new-app/actions/secrets/CLOUDFLARE_API_TOKEN",
      "GET /repos/samebase/new-app/actions/variables/CONVEX_TEAM_ID",
      "POST /repos/samebase/new-app/actions/variables",
    ]);
    const [, secretWrite, , variableWrite] = github.requests;
    expect(secretWrite.body).toMatchObject({ key_id: "test-key-id" });
    expect(openSealedSecret(readEncryptedValue(secretWrite.body))).toBe("cloudflare-ci-test-token");
    expect(variableWrite.body).toEqual({ name: "CONVEX_TEAM_ID", value: "41" });
  });

  it("updates an existing variable, so a retry is an upsert", async () => {
    const github = createFakeGitHub(respondAsRepository(true));

    await writeGitHubActionsSecrets({
      octokit: github.octokit,
      owner: "samebase",
      repo: "new-app",
      secrets: [],
      variables: [{ name: "CONVEX_TEAM_ID", value: "41" }],
      recordApiCall: noApiCallLog,
    });

    expect(github.requests.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/repos/samebase/new-app/actions/variables/CONVEX_TEAM_ID",
      body: { value: "41" },
    });
  });

  it.each([
    { permission: "Secrets" as const, deniedPath: "/actions/secrets/public-key" },
    { permission: "Variables" as const, deniedPath: "/actions/variables/CONVEX_TEAM_ID" },
  ])("names the missing $permission permission on a 403", async ({ permission, deniedPath }) => {
    const respond = respondAsRepository(false);
    const github = createFakeGitHub((request) =>
      request.path.endsWith(deniedPath)
        ? { status: 403, body: { message: "Resource not accessible by integration" } }
        : respond(request),
    );

    await expect(
      writeGitHubActionsSecrets({
        octokit: github.octokit,
        owner: "samebase",
        repo: "new-app",
        secrets: [{ name: "CONVEX_ACCESS_TOKEN", value: "convex-ci-test-token" }],
        variables: [{ name: "CONVEX_TEAM_ID", value: "41" }],
        recordApiCall: noApiCallLog,
      }),
    ).rejects.toThrow(
      formatMissingGitHubAppPermissionMessage({
        permission,
        repositoryFullName: "samebase/new-app",
      }),
    );
  });
});
