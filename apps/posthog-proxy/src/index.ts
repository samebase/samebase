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

export function isPostHogAssetPath(pathname: string) {
  return pathname.startsWith("/static/") || pathname.startsWith("/array/");
}

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

export async function createPostHogOriginRequest(request: Request, pathWithSearch: string) {
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get("CF-Connecting-IP") || "";

  // Do not forward Samebase cookies to PostHog; the project token in the request
  // body/query is the only credential PostHog needs.
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
