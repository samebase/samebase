/**
A Cloudflare account with the Alchemy state store of `Cloudflare.state()`, for tests. The replies
have the shapes that Cloudflare and a version 7 store gave on 2026-11-12 (keys only were recorded).
Names and values are made up.
*/
export const cloudflareAccountId = "a".repeat(32);
export const cloudflareApi = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}`;
export const cloudflareStore = "https://alchemy-state-store.example.workers.dev";
const storeToken = "store-bearer-token";

function cloudflare(result: unknown) {
  return Response.json({ result, success: true, errors: [], messages: [] });
}

/**
The answer to a request of the Cloudflare API, the token probe, or the store, or undefined for any
other URL. `storeReplies` maps a store path to its JSON body; a string body is sent as it is, and a
path that it does not hold answers 500.
*/
export function answerCloudflareRequest(
  storeReplies: Record<string, unknown>,
  url: string,
  init?: RequestInit,
): Response | undefined {
  switch (`${init?.method ?? "GET"} ${url}`) {
    case `GET ${cloudflareApi}/workers/subdomain`:
      return cloudflare({ subdomain: "example" });
    case `GET ${cloudflareStore}/version`:
      return Response.json({ version: 7 });
    case `GET ${cloudflareApi}/secrets_store/stores`:
      return cloudflare([
        { id: "secrets-store", account_id: cloudflareAccountId, name: "default" },
      ]);
    case `GET ${cloudflareApi}/workers/subdomain/edge-preview`:
      return cloudflare({ token: "session-token", exchange_url: "https://exchange.example/x" });
    case "GET https://exchange.example/x":
      return Response.json({ token: "upload-token" });
    case `POST ${cloudflareApi}/workers/scripts/alchemy-state-store/edge-preview`:
      // Cloudflare runs the part as a module only with this type; else it answers 400 with 10021.
      return new Headers(init?.headers).get("cf-preview-upload-config-token") === "upload-token" &&
        typeof init?.body === "string" &&
        init.body.includes('filename="probe.js"\r\nContent-Type: application/javascript+module')
        ? cloudflare({ preview_token: "preview-token" })
        : new Response(null, { status: 400 });
    case `GET ${cloudflareStore}`:
      return new Headers(init?.headers).get("cf-workers-preview-token") === "preview-token"
        ? new Response(`${storeToken}\n`)
        : new Response("<html>", { status: 400 });
  }
  if (!url.startsWith(cloudflareStore)) {
    return undefined;
  }
  if (new Headers(init?.headers).get("Authorization") !== `Bearer ${storeToken}`) {
    return new Response(null, { status: 401 });
  }
  const path = url.slice(cloudflareStore.length);
  if (!(path in storeReplies)) {
    return new Response(null, { status: 500 });
  }
  const reply = storeReplies[path];
  return typeof reply === "string" ? new Response(reply) : Response.json(reply);
}
