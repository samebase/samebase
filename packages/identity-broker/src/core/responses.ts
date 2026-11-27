/** Response helpers shared by the endpoints. */

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...headers,
    },
  });
}

/** An OAuth error body (RFC 6749 section 5.2), for the endpoints that answer the client directly. */
export function oauthError(
  status: number,
  error: string,
  description: string,
  headers: Record<string, string> = {},
): Response {
  return json({ error, error_description: description }, status, headers);
}

/**
 * The answer to a request with no Bearer token: a challenge with no error code (RFC 6750 section
 * 3.1), but with `realm`, because the scheme needs at least one parameter (section 3).
 */
export const noToken = (realm: "register" | "userinfo") =>
  new Response(null, {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer realm="${realm}"`, "Cache-Control": "no-store" },
  });

/** The answer to a refused Bearer token (RFC 6750 section 3.1). */
export const invalidToken = () =>
  json({ error: "invalid_token", error_description: "The token is invalid." }, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });

export function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/**
 * The authorization response (OAuth 2.1 section 4.1.2): parameters on the registered redirect URI,
 * with `iss` on every response (RFC 9207) and `state` when the client sent one.
 */
export function authorizationResponse(args: {
  redirectUri: string;
  issuer: string;
  state: string | undefined;
  /**
   * The Set-Cookie value that deletes the request's transaction cookie, when the browser holds
   * one: sending the browser back to the client ends the request there.
   */
  clearCookie: string | undefined;
  params: Record<string, string>;
}): Response {
  const url = new URL(args.redirectUri);
  for (const [key, value] of Object.entries(args.params)) {
    url.searchParams.set(key, value);
  }
  if (args.state !== undefined) {
    url.searchParams.set("state", args.state);
  }
  url.searchParams.set("iss", args.issuer);
  const response = redirect(url.toString());
  if (args.clearCookie !== undefined) {
    response.headers.append("Set-Cookie", args.clearCookie);
  }
  return response;
}

export function authorizationError(args: {
  redirectUri: string;
  issuer: string;
  state: string | undefined;
  clearCookie: string | undefined;
  error: string;
  description: string;
}): Response {
  return authorizationResponse({
    redirectUri: args.redirectUri,
    issuer: args.issuer,
    state: args.state,
    clearCookie: args.clearCookie,
    params: { error: args.error, error_description: args.description },
  });
}

/** The largest form body that the broker reads: far above any valid request. */
const MAX_FORM_BYTES = 16 * 1024;

/** The body as text, or undefined as soon as more than `MAX_FORM_BYTES` arrived. */
async function readCappedText(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_FORM_BYTES) {
    return undefined;
  }
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(read.value);
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The parameters of a GET query or a form POST. The authorization endpoint accepts both; the token
 * and revocation endpoints are routed for POST only. A parameter sent without a value counts as
 * omitted (RFC 6749 sections 3.1 and 3.2). The answer instead: `unsupported()` for a POST body of
 * another media type, and 413 for a body larger than `MAX_FORM_BYTES`.
 */
export async function readParameters(
  request: Request,
  unsupported: () => Response,
): Promise<URLSearchParams | Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (request.method !== "GET" && !contentType.startsWith("application/x-www-form-urlencoded")) {
    return unsupported();
  }
  const text =
    request.method === "GET" ? new URL(request.url).search : await readCappedText(request);
  if (text === undefined) {
    return oauthError(413, "invalid_request", "The body is larger than 16 KB.");
  }
  return new URLSearchParams([...new URLSearchParams(text)].filter(([, value]) => value !== ""));
}
