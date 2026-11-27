import * as Credentials from "@distilled.cloud/cloudflare/Credentials";
import { CloudflareParseError } from "@distilled.cloud/cloudflare/Errors";
import type { CloudflareOpContext } from "@distilled.cloud/cloudflare/Protocol";
import * as Retry from "@distilled.cloud/cloudflare/Retry";
import { Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";

import { logProviderValidationFailure } from "./providerResponseValidation";

const API_PATH_PREFIX = "/client/v4";
const TIMEOUT = "30 seconds";

/**
Runs one `@distilled.cloud/cloudflare` operation with `token`, without retries: the default policy
retries "Authentication error" for about 25 seconds, and the access checks ask exactly whether
Cloudflare refuses the token. The callers are user actions that report a failure at once.
*/
export async function runCloudflare<A, E>(
  token: string,
  operation: Effect.Effect<A, E, CloudflareOpContext>,
): Promise<A> {
  const apiToken = token.trim();
  if (!apiToken) throw new Error("Cloudflare token is required.");
  let request = { method: "GET", path: "" };
  const client = HttpClient.make((sent, url, signal) =>
    Effect.tryPromise({
      try: async () => {
        request = { method: sent.method, path: url.pathname.slice(API_PATH_PREFIX.length) };
        const body =
          sent.body._tag === "Uint8Array" ? new TextDecoder().decode(sent.body.body) : null;
        const response = await fetch(url, {
          method: sent.method,
          headers: sent.headers,
          body,
          signal,
        });
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
          issues: [],
        });
      }),
    ),
    Retry.none,
    Effect.timeout(TIMEOUT),
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(HttpClient.HttpClient, client),
        Credentials.fromApiToken({ apiToken: Redacted.make(apiToken) }),
      ),
    ),
    Effect.runPromise,
  );
}
