import { hsalsa, xsalsa20poly1305 } from "@noble/ciphers/salsa.js";
import { u32 } from "@noble/ciphers/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";

import type { ProviderApiCallRecorder } from "./providerApiLog";

/*
GitHub Actions secrets and variables of one repository. GitHub accepts a secret only as a libsodium
sealed box (crypto_box_seal) for the repository's public key. The sealing below is pure JavaScript
on audited @noble primitives (X25519, HSalsa20, XSalsa20-Poly1305, BLAKE2b), so it runs in the
default Convex runtime: no WebAssembly and no Node built-in.
*/

/** "expand 32-byte k" as little-endian words: the HSalsa20 constant of crypto_box_beforenm. */
const SALSA20_SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
const CURVE25519_KEY_BYTES = 32;
const SEALED_BOX_NONCE_BYTES = 24;

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(left.length + right.length);
  bytes.set(left);
  bytes.set(right, left.length);
  return bytes;
}

/**
libsodium's crypto_box_seal: an ephemeral X25519 key pair, the nonce BLAKE2b-192(ephemeral public
key || recipient public key), and crypto_box (HSalsa20 of the X25519 shared secret as the
XSalsa20-Poly1305 key). The result is the ephemeral public key followed by the box, in base64.
*/
export function sealGitHubActionsSecret(args: { publicKey: string; value: string }): string {
  const recipientPublicKey = decodeBase64(args.publicKey);
  if (recipientPublicKey.length !== CURVE25519_KEY_BYTES) {
    throw new Error("GitHub returned an invalid Actions public key.");
  }
  const ephemeralSecretKey = crypto.getRandomValues(new Uint8Array(CURVE25519_KEY_BYTES));
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralSecretKey);
  const sharedSecret = x25519.getSharedSecret(ephemeralSecretKey, recipientPublicKey);
  const boxKey = new Uint8Array(CURVE25519_KEY_BYTES);
  // hsalsa writes the derived key through the word view of boxKey.
  hsalsa(SALSA20_SIGMA, u32(sharedSecret), new Uint32Array(4), u32(boxKey));
  const nonce = blake2b(concatBytes(ephemeralPublicKey, recipientPublicKey), {
    dkLen: SEALED_BOX_NONCE_BYTES,
  });
  const box = xsalsa20poly1305(boxKey, nonce).encrypt(new TextEncoder().encode(args.value));
  ephemeralSecretKey.fill(0);
  boxKey.fill(0);
  return encodeBase64(concatBytes(ephemeralPublicKey, box));
}

/**
The refusal of a GitHub App installation that lacks Secrets or Variables write access. Changing the
App's permissions does not reach an installation until its owner accepts them.
*/
export function formatMissingGitHubAppPermissionMessage(args: {
  permission: "Secrets" | "Variables";
  repositoryFullName: string;
}): string {
  return `The Samebase GitHub App is missing the ${args.permission} repository permission (read and write) on ${args.repositoryFullName}. Accept the new permissions on the Samebase GitHub App installation in GitHub, then retry.`;
}

async function withPermissionRefusal<Result>(
  args: { permission: "Secrets" | "Variables"; repositoryFullName: string },
  request: () => Promise<Result>,
): Promise<Result> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof RequestError && error.status === 403) {
      throw new Error(formatMissingGitHubAppPermissionMessage(args));
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof RequestError && error.status === 404;
}

/**
Writes Actions secrets and variables into one repository. Every write is an upsert (PUT for a
secret; GET, then PATCH or POST for a variable), so a retry after a partial write is safe.
*/
export async function writeGitHubActionsSecrets(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  secrets: ReadonlyArray<{ name: string; value: string }>;
  variables: ReadonlyArray<{ name: string; value: string }>;
  recordApiCall: ProviderApiCallRecorder;
}): Promise<void> {
  const { octokit, owner, repo } = args;
  const repositoryFullName = `${owner}/${repo}`;
  const secretsAccess = { permission: "Secrets", repositoryFullName } as const;
  const variablesAccess = { permission: "Variables", repositoryFullName } as const;

  await args.recordApiCall({
    provider: "GitHub",
    method: "GET",
    endpoint: "/repos/{owner}/{repo}/actions/secrets/public-key",
    values: { params: { path: { owner, repo } } },
  });
  const publicKey = await withPermissionRefusal(secretsAccess, async () =>
    octokit.rest.actions.getRepoPublicKey({ owner, repo }),
  );
  for (const secret of args.secrets) {
    await args.recordApiCall({
      provider: "GitHub",
      method: "PUT",
      endpoint: "/repos/{owner}/{repo}/actions/secrets/{secret_name}",
      values: { params: { path: { owner, repo, secret_name: secret.name } } },
    });
    await withPermissionRefusal(secretsAccess, async () =>
      octokit.rest.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: secret.name,
        key_id: publicKey.data.key_id,
        encrypted_value: sealGitHubActionsSecret({
          publicKey: publicKey.data.key,
          value: secret.value,
        }),
      }),
    );
  }

  for (const variable of args.variables) {
    await args.recordApiCall({
      provider: "GitHub",
      method: "GET",
      endpoint: "/repos/{owner}/{repo}/actions/variables/{name}",
      values: { params: { path: { owner, repo, name: variable.name } } },
    });
    const exists = await withPermissionRefusal(variablesAccess, async () =>
      octokit.rest.actions.getRepoVariable({ owner, repo, name: variable.name }).then(
        () => true,
        (error: unknown) => {
          if (isNotFound(error)) {
            return false;
          }
          throw error;
        },
      ),
    );
    await args.recordApiCall({
      provider: "GitHub",
      method: exists ? "PATCH" : "POST",
      endpoint: exists
        ? "/repos/{owner}/{repo}/actions/variables/{name}"
        : "/repos/{owner}/{repo}/actions/variables",
      values: { params: { path: { owner, repo, name: variable.name } } },
    });
    await withPermissionRefusal(variablesAccess, async () =>
      exists
        ? octokit.rest.actions.updateRepoVariable({
            owner,
            repo,
            name: variable.name,
            value: variable.value,
          })
        : octokit.rest.actions.createRepoVariable({
            owner,
            repo,
            name: variable.name,
            value: variable.value,
          }),
    );
  }
}
