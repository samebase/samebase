import * as Credentials from "@distilled.cloud/cloudflare/Credentials";
import { CloudflareParseError } from "@distilled.cloud/cloudflare/Errors";
import type { CloudflareOpContext } from "@distilled.cloud/cloudflare/Protocol";
import * as Retry from "@distilled.cloud/cloudflare/Retry";
import { Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";

import { callCloudflareMcpTool } from "./cloudflareMcp";
import { toErrorMessage } from "./jsonUtils";
import { logProviderValidationFailure } from "./providerResponseValidation";

const API_PATH_PREFIX = "/client/v4";
const TIMEOUT = "30 seconds";

export type CloudflareApiTransport = "mcp" | "direct";
export type CloudflareApiAuthMethod = "api_key" | "oauth" | "mcp_oauth";

export function resolveCloudflareApiTransport(
  authMethod: CloudflareApiAuthMethod,
): CloudflareApiTransport {
  switch (authMethod) {
    case "oauth":
    case "api_key":
      return "direct";
    case "mcp_oauth":
      return "mcp";
    default:
      authMethod satisfies never;
      throw new Error("Unsupported Cloudflare auth method.");
  }
}

/**
Runs one `@distilled.cloud/cloudflare` operation with `token`, without retries: the default policy
retries "Authentication error" for about 25 seconds, and the access checks ask exactly whether
Cloudflare refuses the token. The callers are user actions that report a failure at once.
*/
export async function runCloudflare<A, E>(
  args: { token: string; transport: CloudflareApiTransport },
  operation: Effect.Effect<A, E, CloudflareOpContext>,
): Promise<A> {
  const token = args.token.trim();
  if (!token) throw new Error("Cloudflare token is required.");
  let request = { method: "GET", path: "" };
  const client = HttpClient.make((sent, url, signal) =>
    Effect.tryPromise({
      try: async () => {
        request = { method: sent.method, path: url.pathname.slice(API_PATH_PREFIX.length) };
        const body =
          sent.body._tag === "Uint8Array" ? new TextDecoder().decode(sent.body.body) : null;
        const response =
          args.transport === "mcp"
            ? await sendThroughMcp({
                token,
                method: sent.method,
                path: `${request.path}${url.search}`,
                body,
              })
            : await fetch(url, { method: sent.method, headers: sent.headers, body, signal });
        return HttpClientResponse.fromWeb(sent, response);
      },
      catch: (cause) =>
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request: sent, cause }),
        }),
    }),
  );
  return await operation.pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        if (!(error instanceof CloudflareParseError)) return;
        // The parse error quotes the provider body, so only the request is logged.
        logProviderValidationFailure({
          provider: "cloudflare",
          phase: "response",
          method: request.method,
          path: request.path,
          transport: args.transport,
          issues: [],
        });
      }),
    ),
    Retry.none,
    Effect.timeout(TIMEOUT),
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, client),
        Credentials.fromApiToken({ apiToken: Redacted.make(token) }),
      ),
    ),
    Effect.runPromise,
  );
}

/**
Sends the request through the `execute` tool of Cloudflare's MCP server, which an MCP OAuth token
can reach. The tool answers the v4 envelope as text. A Cloudflare error comes back as the message
"Cloudflare API error: <code>: <message>", which becomes an error envelope again, so distilled
returns its typed error.
*/
async function sendThroughMcp(args: {
  token: string;
  method: string;
  path: string;
  body: string | null;
}): Promise<Response> {
  const bodyPart = args.body === null ? "" : `, body: ${args.body}`;
  const code = `async () => {
  return await cloudflare.request({
    method: ${JSON.stringify(args.method)},
    path: ${JSON.stringify(args.path)}${bodyPart}
  });
}`;
  const headers = { "Content-Type": "application/json" };
  try {
    const text = await callCloudflareMcpTool({
      token: args.token,
      toolName: "execute",
      toolArgs: { code },
    });
    return new Response(text || null, { headers });
  } catch (error) {
    const detail = /Cloudflare API error: (\d+): (.+)$/s.exec(toErrorMessage(error));
    if (!detail) throw error;
    const errors = [{ code: Number(detail[1]), message: detail[2].trim() }];
    return new Response(JSON.stringify({ success: false, errors, messages: [], result: null }), {
      status: 400,
      headers,
    });
  }
}
