import { describe, expect, it } from "vite-plus/test";

import { separateSessionCookiesByPort } from "./loopbackSessionCookies";

describe("separateSessionCookiesByPort", () => {
  it("gives a loopback port only its own session, under the plain names", async () => {
    let served: Request | undefined;
    await separateSessionCookiesByPort(
      new Request("http://localhost:5178/repo", {
        headers: {
          cookie:
            "__convexAuthJWT=other; __convexAuthJWT_5178=mine; theme=dark; __convexAuthRefreshToken_5179=next",
        },
      }),
      async (request) => {
        served = request;
        return new Response("page");
      },
    );

    // Convex Auth reads only the plain names, so another port's session stays unread.
    expect(served?.headers.get("cookie")).toBe(
      "__convexAuthJWT=mine; theme=dark; __convexAuthRefreshToken_5179=next",
    );
  });

  it("names the session cookies of a loopback response after the port", async () => {
    const response = await separateSessionCookiesByPort(
      new Request("http://127.0.0.1:5179/auth/signin", { method: "POST", body: "{}" }),
      async () => {
        const headers = new Headers();
        headers.append("set-cookie", "__convexAuthJWT=token; Path=/; HttpOnly");
        headers.append("set-cookie", "__convexAuthRefreshToken=refresh; Path=/; HttpOnly");
        headers.append("set-cookie", "theme=dark; Path=/");
        return new Response("{}", { status: 200, headers });
      },
    );

    expect(response.headers.getSetCookie()).toEqual([
      "__convexAuthJWT_5179=token; Path=/; HttpOnly",
      "__convexAuthRefreshToken_5179=refresh; Path=/; HttpOnly",
      "theme=dark; Path=/",
    ]);
  });

  it("passes another origin through unchanged", async () => {
    const request = new Request("https://samebase.com/repo", {
      headers: { cookie: "__convexAuthJWT=token" },
    });
    const page = new Response("page", { headers: { "set-cookie": "__convexAuthJWT=next" } });

    const response = await separateSessionCookiesByPort(request, async (served) => {
      expect(served).toBe(request);
      return page;
    });

    expect(response).toBe(page);
  });
});
