import * as Credentials from "@distilled.cloud/cloudflare/Credentials";
import type { CloudflareOpContext } from "@distilled.cloud/cloudflare/Protocol";
import * as Retry from "@distilled.cloud/cloudflare/Retry";
import { ResponseValidation } from "@distilled.cloud/core";
import { Effect, Layer, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";

const API_PATH_PREFIX = "/client/v4";
const TIMEOUT = "30 seconds";

/** The request route with the account ID replaced, so errors hold no resource ID. */
function readRoute(input: string | URL | Request, init: RequestInit | undefined): string {
  const request = new Request(input, init);
  const path = new URL(request.url).pathname
    .slice(API_PATH_PREFIX.length)
    .replace(/^\/accounts\/[^/]+/, "/accounts/{account_id}");
  return `${request.method} ${path}`;
}

function isSuccessEnvelope(text: string): boolean {
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null && "success" in body && body.success === true;
  } catch {
    return false;
  }
}

/** The `_tag` and Cloudflare `code` of a distilled error, without the provider body it can quote. */
function describeError(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown error";
  const tag = "_tag" in error && typeof error._tag === "string" ? error._tag : "unknown error";
  const code = "code" in error && typeof error.code === "number" ? ` ${error.code}` : "";
  return `${tag}${code}`;
}

/**
Runs one `@distilled.cloud/cloudflare` operation with `token`, without retries: the default policy
retries "Authentication error" for about 25 seconds, and the access checks ask exactly whether
Cloudflare refuses the token. The callers are user actions that report a failure at once.

A 2xx answer must be a `success: true` envelope whose result matches the operation's schema.
distilled returns any 2xx body as read unless a validation mode is provided. A failure rejects with an Error that names
the route and the distilled error tag only: distilled errors can quote the provider body, and Convex
logs an exception that leaves an action.
*/
export async function runCloudflare<A, E>(
  token: string,
  operation: Effect.Effect<A, E, CloudflareOpContext>,
): Promise<A> {
  const apiToken = token.trim();
  if (!apiToken) throw new Error("Cloudflare token is required.");
  let route = "request";
  let envelopeFailure: string | null = null;
  // Read at call time: Effect caches its default fetch on first use, which would keep test stubs.
  const send = globalThis.fetch;
  const fetchSuccessEnvelope = async (input: string | URL | Request, init?: RequestInit) => {
    route = readRoute(input, init);
    const response = await send(input, init);
    if (!response.ok) return response;
    const text = await response.text();
    if (!isSuccessEnvelope(text)) {
      envelopeFailure = `Cloudflare ${route} answered ${response.status} without a success envelope.`;
      throw new Error(envelopeFailure);
    }
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
  return await operation.pipe(
    Retry.none,
    Effect.timeout(TIMEOUT),
    Effect.mapError(
      (error) =>
        new Error(envelopeFailure ?? `Cloudflare ${route} failed: ${describeError(error)}.`),
    ),
    Effect.provide(
      Layer.mergeAll(
        FetchHttpClient.layer,
        Layer.succeed(FetchHttpClient.Fetch, fetchSuccessEnvelope),
        Credentials.fromApiToken({ apiToken: Redacted.make(apiToken) }),
        ResponseValidation.additionalProperties,
      ),
    ),
    Effect.runPromise,
  );
}
