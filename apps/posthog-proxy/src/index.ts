/**
 * Samebase's EU-region variant of PostHog's Cloudflare Worker reverse-proxy
 * example. Keep routing and forwarding behavior aligned with PostHog's guide
 * unless we intentionally diverge:
 * https://posthog.com/docs/advanced/proxy/cloudflare#add-the-proxy-code
 */
const POSTHOG_API_HOST = "eu.i.posthog.com";
const POSTHOG_ASSET_HOST = "eu-assets.i.posthog.com";

export default {
  fetch(request: Request, _env: unknown, ctx: ExecutionContext) {
    return handleRequest(request, ctx);
  },
};

export function handleRequest(request: Request, ctx: ExecutionContext) {
  const requestUrl = new URL(request.url);
  const pathWithSearch = requestUrl.pathname + requestUrl.search;

  if (isPostHogAssetPath(requestUrl.pathname)) {
    return retrievePostHogAsset(request, pathWithSearch, ctx);
  }

  return forwardPostHogRequest(request, pathWithSearch);
}

/**
 * PostHog's proxy implementation routes `/static/*` and `/array/*` to the
 * asset host. `/static/*` serves SDK/static files, and `/array/*` is PostHog's
 * remote-config asset path. Everything else goes to the ingest/API host.
 *
 * The asset host split matters because PostHog says it preserves the correct
 * cache-control headers for SDK and remote-config responses.
 * https://posthog.com/docs/advanced/proxy/cloudflare#add-the-proxy-code
 */
export function isPostHogAssetPath(pathname: string) {
  return pathname.startsWith("/static/") || pathname.startsWith("/array/");
}

/**
 * Follow PostHog's example by caching asset-origin responses in Cloudflare's
 * default cache. Event ingestion is intentionally not cached and uses the API
 * forwarding path instead.
 */
async function retrievePostHogAsset(
  request: Request,
  pathWithSearch: string,
  ctx: ExecutionContext,
) {
  const cachedResponse = await caches.default.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(`https://${POSTHOG_ASSET_HOST}${pathWithSearch}`);
  ctx.waitUntil(caches.default.put(request, response.clone()));
  return response;
}

export async function forwardPostHogRequest(request: Request, pathWithSearch: string) {
  return await fetch(await createPostHogOriginRequest(request, pathWithSearch));
}

/**
 * Mirrors PostHog's Cloudflare Worker forwarding logic:
 * - remove app cookies before sending the request to PostHog
 * - preserve the real client IP from Cloudflare's `CF-Connecting-IP` header
 * - buffer non-GET/HEAD bodies as binary data before forwarding
 *
 * PostHog documents the body buffering specifically for encoded capture/custom
 * event requests, where forwarding the Worker `ReadableStream` directly can
 * cause POST payloads to be lost.
 * https://posthog.com/docs/advanced/proxy/cloudflare#custom-events-or-post-requests-not-reaching-posthog
 */
export async function createPostHogOriginRequest(request: Request, pathWithSearch: string) {
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("CF-Connecting-IP") || "";

  headers.delete("cookie");
  headers.set("X-Forwarded-For", clientIp);

  return new Request(`https://${POSTHOG_API_HOST}${pathWithSearch}`, {
    body:
      request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer(),
    headers,
    method: request.method,
    redirect: request.redirect,
  });
}
