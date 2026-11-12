import { isRecord, notEmpty } from "@samebase/dependent/main";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { parseWithoutSecretValues, readDeployedStacks } from "../../shared/alchemyState";
import type { AlchemyStack, CloudflareStacksRead } from "../../shared/alchemyStateModel";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery, type ActionCtx } from "../_generated/server";
import type { ResolvedCloudflareConnection } from "../cloudflareOAuth";
import { organizationProviderCredentialAad } from "../organization/providerCredentialModel";
import { openSecret } from "../sealedSecret";
import { requireLiveRepositoryForUser } from "./convexDeploymentInspection";

const { array, id, number, object, optional, string } = v;

/** The read of the store for one repository, before the Convex metadata of its deployments. */
type CloudflareStoreRead =
  | Exclude<CloudflareStacksRead, { state: "found" }>
  | { state: "found"; stacks: AlchemyStack[] };

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
/**
The Worker of `Cloudflare.state()` with its default name, on the account's workers.dev subdomain. A
store with another `workerName` or a custom `domain` is not found.
*/
const STORE_WORKER_NAME = "alchemy-state-store";
/** The Secrets Store secret that holds the bearer token of the default store's HTTP API. */
const STORE_TOKEN_SECRET_NAME = "AlchemyStateStoreToken";
/** Store versions whose read routes this reader uses. Version 8 changed no read route. */
const SUPPORTED_STORE_VERSIONS: readonly number[] = [7, 8];
/**
The stack that older Alchemy versions deployed the store with. Store version 8 refuses every read of
it with 409, so it is not listed.
*/
const LEGACY_BOOTSTRAP_STACK = "CloudflareStateStore";
const REQUEST_TIMEOUT_MS = 15_000;
/**
The edge preview often fails for a few seconds while Cloudflare routes it, so the token read starts
again, as Alchemy does. A refused token or a missing store ends it at once.
*/
const TOKEN_READ_ATTEMPTS = 10;
const TOKEN_READ_RETRY_MS = 1_000;
/** The store's HTTP API has one request per resource. This bounds the requests that run at once. */
const STORE_REQUEST_LIMIT = 16;
/** The preview Worker answers with the value of the bound secret. */
const TOKEN_PROBE_SOURCE = `export default { async fetch(_request, env) { return new Response(await env.SECRET.get()); } };`;

const vSubdomain = object({ subdomain: string() });
const vVersion = object({ version: number() });
const vSecretsStores = array(object({ id: string() }));
const vEdgePreviewSession = object({ token: string(), exchange_url: optional(string()) });
const vExchangedToken = object({ token: string() });
const vEdgePreview = object({ preview_token: string() });
const vNames = array(string());

/**
Parses a JSON text of a Cloudflare reply. A text that is not JSON gives undefined: the error of
`JSON.parse` can quote the text, and the text can hold a token.
*/
function parseStoreJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
Ends the read with `state`. The message names the request and its status, never a body: a body can
hold a token or a secret value.
*/
class StoreReadStop extends Error {
  readonly state: "reconnect" | "no_store" | "failed";

  constructor(state: StoreReadStop["state"], message: string) {
    super(message);
    this.state = state;
  }
}

async function fetchText(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timeout);
  }
}

/**
The `result` of a Cloudflare API reply. Cloudflare answers 401 or 403 when the token is refused or
lacks a permission, such as Secrets Store Edit, which binding the secret needs. It answers 404 when
the subdomain or the store Worker is missing.
*/
async function cloudflareResult(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const { status, text } = await fetchText(`${CLOUDFLARE_API_URL}${path}`, { ...init, headers });
  const body = parseStoreJson(text);
  if (status === 200 && isRecord(body)) {
    return body["result"];
  }
  const state =
    status === 401 || status === 403 ? "reconnect" : status === 404 ? "no_store" : "failed";
  throw new StoreReadStop(state, `${init.method ?? "GET"} ${path}: ${status}`);
}

/**
Reads the store's bearer token: Cloudflare never returns a secret value, so this uploads a preview
of the store Worker that binds the secret and answers with it. The preview is not deployed or billed,
and it stops soon. Alchemy does the same on each run.

@see https://github.com/alchemy-run/alchemy/blob/2.0.0-beta.85/packages/cloudflare/src/StateStore/State.ts
*/
async function readStoreTokenOnce(args: {
  token: string;
  accountId: string;
  secretsStoreId: string;
  storeUrl: string;
}) {
  const session = await cloudflareResult(
    args.token,
    `/accounts/${args.accountId}/workers/subdomain/edge-preview`,
  );
  if (!validate(vEdgePreviewSession, session, { allowUnknownFields: true })) {
    throw new StoreReadStop("failed", "edge-preview session: unexpected reply");
  }
  // Some accounts get an `exchange_url` that swaps the session token for an upload token. The
  // session token still works when the exchange fails.
  const exchanged =
    session.exchange_url === undefined
      ? undefined
      : parseStoreJson(
          await fetchText(session.exchange_url).then(
            ({ text }) => text,
            () => "",
          ),
        );
  const uploadToken = validate(vExchangedToken, exchanged, { allowUnknownFields: true })
    ? exchanged.token
    : session.token;

  // The body is built here, not with `FormData`: the Convex runtime sends a `Blob` part as
  // `application/octet-stream`, and Cloudflare then refuses the upload with 10021, "Main module
  // must be an ES module".
  const boundary = `samebase-${crypto.randomUUID()}`;
  const part = (headers: string, content: string) =>
    `--${boundary}\r\n${headers}\r\n\r\n${content}\r\n`;
  const metadata = JSON.stringify({
    main_module: "probe.js",
    compatibility_date: "2026-08-31",
    bindings: [
      {
        type: "secrets_store_secret",
        name: "SECRET",
        secret_name: STORE_TOKEN_SECRET_NAME,
        store_id: args.secretsStoreId,
      },
    ],
  });
  const body = `${part('Content-Disposition: form-data; name="metadata"', metadata)}${part(
    'Content-Disposition: form-data; name="wrangler-session-config"',
    JSON.stringify({ workers_dev: true, minimal_mode: true }),
  )}${part(
    'Content-Disposition: form-data; name="probe.js"; filename="probe.js"\r\nContent-Type: application/javascript+module',
    TOKEN_PROBE_SOURCE,
  )}--${boundary}--\r\n`;
  const preview = await cloudflareResult(
    args.token,
    `/accounts/${args.accountId}/workers/scripts/${STORE_WORKER_NAME}/edge-preview`,
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "cf-preview-upload-config-token": uploadToken,
      },
    },
  );
  if (!validate(vEdgePreview, preview, { allowUnknownFields: true })) {
    throw new StoreReadStop("failed", "edge-preview upload: unexpected reply");
  }
  const probe = await fetchText(args.storeUrl, {
    headers: { "cf-workers-preview-token": preview.preview_token },
  });
  const bearer = probe.text.trim();
  // While the preview is not routed yet, workers.dev answers with an HTML error page.
  if (probe.status !== 200 || bearer.length === 0 || bearer.startsWith("<")) {
    throw new StoreReadStop("failed", `token probe: ${probe.status}`);
  }
  return bearer;
}

async function readStoreToken(args: Parameters<typeof readStoreTokenOnce>[0]) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await readStoreTokenOnce(args);
    } catch (error) {
      const final = error instanceof StoreReadStop && error.state !== "failed";
      if (final || attempt === TOKEN_READ_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, TOKEN_READ_RETRY_MS));
    }
  }
}

/** Runs at most `limit` calls at once. A finished call hands its place to the next waiting one. */
function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <Result>(run: () => Promise<Result>) => {
    if (active < limit) {
      active++;
    } else {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

/**
The stacks of `repository` in the store, as `readDeployedStacks` keeps them: the stack name does not
count, only the run record in the output of a stage. Stacks and stages are in name order, resources
in fqn order. The resources of a stage are read only when its run record names the repository, and
a resource that a deploy removed during the read is left out. Each row and output has its secret
values removed as soon as it arrives, the same as a read of the Convex store, so no secret value
leaves this function. A request that fails stops the whole read: a partial read could hide a stack.
*/
async function readStacks(
  storeUrl: string,
  bearer: string,
  repository: string,
): Promise<AlchemyStack[]> {
  const limited = limiter(STORE_REQUEST_LIMIT);
  const get = async (path: string) =>
    await limited(async () => {
      const { status, text } = await fetchText(`${storeUrl}${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (status !== 200) {
        throw new StoreReadStop("failed", `store ${path}: ${status}`);
      }
      return text;
    });
  const names = async (path: string) => {
    const reply = parseStoreJson(await get(path));
    if (!validate(vNames, reply)) {
      throw new StoreReadStop("failed", `store ${path}: unexpected reply`);
    }
    return [...reply].sort();
  };
  /** The JSON text of a row or an output without its secret values, null when the store has none. */
  const state = async (path: string) => {
    const text = await get(path);
    if (text.length === 0) {
      return null;
    }
    try {
      return JSON.stringify(parseWithoutSecretValues(text));
    } catch {
      throw new StoreReadStop("failed", `store ${path}: not JSON`);
    }
  };

  const stacks = await Promise.all(
    (await names("/state/stacks"))
      .filter((name) => name !== LEGACY_BOOTSTRAP_STACK)
      .map(async (name) => {
        const stackPath = `/state/stacks/${encodeURIComponent(name)}/stages`;
        const stages = await Promise.all(
          (await names(stackPath)).map(async (stage) => {
            const stagePath = `${stackPath}/${encodeURIComponent(stage)}`;
            const output = await state(`${stagePath}/output`);
            const deployed = readDeployedStacks(
              [{ name, stages: [{ name: stage, resources: [], output }] }],
              repository,
            )
              .at(0)
              ?.stages.at(0);
            if (!deployed) {
              return null;
            }
            const resources = await Promise.all(
              (await names(`${stagePath}/resources`)).map(async (fqn) => {
                const value = await state(`${stagePath}/resources/${encodeURIComponent(fqn)}`);
                return value === null ? null : { fqn, value };
              }),
            );
            return { ...deployed, resources: resources.filter(notEmpty) };
          }),
        );
        const kept = stages.filter(notEmpty);
        return kept.length === 0 ? null : { name, stages: kept };
      }),
  );
  return stacks.filter(notEmpty);
}

/**
Reads the stacks of `repository` (GitHub `owner/name`) from the Alchemy state store of a Cloudflare
account with an API token or an OAuth access token. It needs Workers Scripts Edit and Secrets Store
Edit: Cloudflare binds a Secrets Store secret only with Edit. The store token stays in this function.
*/
export async function readCloudflareStateStore(args: {
  token: string;
  accountId: string;
  repository: string;
}): Promise<CloudflareStoreRead> {
  try {
    const subdomain = await cloudflareResult(
      args.token,
      `/accounts/${args.accountId}/workers/subdomain`,
    );
    if (!validate(vSubdomain, subdomain, { allowUnknownFields: true })) {
      return { state: "no_store" };
    }
    const storeUrl = `https://${STORE_WORKER_NAME}.${subdomain.subdomain}.workers.dev`;
    // `/version` needs no token, so an account without a store gets no preview upload.
    const version = await fetchText(`${storeUrl}/version`);
    if (version.status === 404) {
      return { state: "no_store" };
    }
    const versionReply = parseStoreJson(version.text);
    if (version.status !== 200 || !validate(vVersion, versionReply)) {
      throw new StoreReadStop("failed", `store /version: ${version.status}`);
    }
    if (!SUPPORTED_STORE_VERSIONS.includes(versionReply.version)) {
      return { state: "unsupported_version", version: versionReply.version };
    }

    // An account has at most one Secrets Store, and the store's secrets are in it.
    const secretsStores = await cloudflareResult(
      args.token,
      `/accounts/${args.accountId}/secrets_store/stores`,
    );
    if (!validate(vSecretsStores, secretsStores, { allowUnknownFields: true })) {
      throw new StoreReadStop("failed", "secrets_store/stores: unexpected reply");
    }
    const secretsStore = secretsStores.at(0);
    if (secretsStore === undefined) {
      return { state: "no_store" };
    }
    const bearer = await readStoreToken({
      token: args.token,
      accountId: args.accountId,
      secretsStoreId: secretsStore.id,
      storeUrl,
    });
    return { state: "found", stacks: await readStacks(storeUrl, bearer, args.repository) };
  } catch (error) {
    if (error instanceof StoreReadStop) {
      console.warn("cloudflare_state_store:read_stopped", {
        state: error.state,
        message: error.message,
      });
      return { state: error.state };
    }
    // Only the name: a fetch error can quote its URL, and the exchange URL can hold a token.
    console.warn("cloudflare_state_store:read_failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return { state: "failed" };
  }
}

/** The organization and GitHub `owner/name` of a repository that the user can read. */
export const readTarget = internalQuery({
  args: { repositoryId: id("repositories"), userId: id("users") },
  returns: object({ organizationId: id("organizations"), githubRepositoryFullName: string() }),
  handler: async (ctx, args) => {
    const { repository, githubRepositoryFullName } = await requireLiveRepositoryForUser(
      ctx.db,
      args,
    );
    return { organizationId: repository.organizationId, githubRepositoryFullName };
  },
});

/**
The stacks of a repository in the Alchemy state store of its organization's Cloudflare account. It
checks the user's access to the repository and needs no Convex connection.
*/
export async function readRepositoryCloudflareStacks(
  ctx: Pick<ActionCtx, "runAction" | "runQuery">,
  args: { repositoryId: Id<"repositories">; userId: Id<"users"> },
): Promise<CloudflareStoreRead> {
  const { organizationId, githubRepositoryFullName } = await ctx.runQuery(
    internal.repository.cloudflareStateStore.readTarget,
    { repositoryId: args.repositoryId, userId: args.userId },
  );
  let connection: ResolvedCloudflareConnection | null;
  try {
    connection = await ctx.runAction(internal.cloudflareOAuth.resolveConnectionForOrganization, {
      organizationId,
      userId: args.userId,
    });
  } catch {
    // The resolver records a grant that the hub refused to refresh. Only a reconnect repairs it.
    const current = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForProviderStatus,
      { organizationId, userId: args.userId },
    );
    return {
      state:
        current.cloudflareCredential?.tokenHealth?.status === "invalid" ? "reconnect" : "failed",
    };
  }
  if (connection === null) {
    return { state: "not_connected" };
  }
  // An MCP connection reaches the API only through Cloudflare's MCP server, which cannot upload
  // the preview Worker that reads the store token.
  if (connection.auth.method === "mcp_oauth") {
    return { state: "unsupported_connection" };
  }
  const token = (
    await openSecret({
      sealed: connection.auth.credential,
      aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.credential"),
    })
  ).trim();
  return await readCloudflareStateStore({
    token,
    accountId: connection.account.accountId,
    repository: githubRepositoryFullName,
  });
}
