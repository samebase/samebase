import { AUTH_JWT_COOKIE, AUTH_REFRESH_COOKIE } from "@convex-dev/auth/ssr";

const SESSION_COOKIES = [AUTH_JWT_COOKIE, AUTH_REFRESH_COOKIE];
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
Browsers keep one cookie jar per host, whatever the port, so the local dev servers of two worktrees
would read each other's session, which the other backend rejects. On a loopback origin with a port,
the session cookies carry the port in their names: Convex Auth reads and writes the plain names, the
request brings it only this port's session, and the response's session cookies leave with the port.
Other origins pass through unchanged.
*/
export async function separateSessionCookiesByPort(
  request: Request,
  serve: (request: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  if (!LOOPBACK_HOSTNAMES.has(url.hostname) || url.port === "") {
    return await serve(request);
  }
  const suffix = `_${url.port}`;

  const requestHeaders = new Headers(request.headers);
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader !== null) {
    requestHeaders.set("cookie", readPortSessionCookies(cookieHeader, suffix));
  }
  // The dev server's request is not the global Request class, whose constructor then cannot copy
  // it, so the copy takes its parts.
  const response = await serve(
    new Request(request.url, {
      method: request.method,
      headers: requestHeaders,
      body:
        request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer(),
    }),
  );

  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) {
    return response;
  }
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("set-cookie");
  for (const cookie of setCookies) {
    const name = SESSION_COOKIES.find((sessionCookie) => cookie.startsWith(`${sessionCookie}=`));
    responseHeaders.append(
      "set-cookie",
      name === undefined ? cookie : `${name}${suffix}${cookie.slice(name.length)}`,
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

/** The cookies of the request with this port's session under the plain names, and no other session. */
function readPortSessionCookies(cookieHeader: string, suffix: string): string {
  return cookieHeader
    .split(/;\s*/)
    .flatMap((pair) => {
      const separator = pair.indexOf("=");
      const name = separator === -1 ? pair : pair.slice(0, separator);
      if (SESSION_COOKIES.includes(name)) {
        return [];
      }
      const sessionCookie = SESSION_COOKIES.find((cookie) => name === `${cookie}${suffix}`);
      return [sessionCookie === undefined ? pair : `${sessionCookie}${pair.slice(name.length)}`];
    })
    .join("; ");
}
