import { httpCookies, ServerAuthSession, setupConvexAuthServer } from "@convex-dev/auth/ssr";
import handler from "@samebase/convex-hosting-tanstack-start/server";
import { ConvexHttpClient } from "convex/browser";
import { convexUrl } from "@/lib/convexUrl";
import { api } from "../convex/_generated/api";

const convex = new ConvexHttpClient(convexUrl);

/**
Old addresses that the site still answers, with the status each one had in Cloudflare's
`_redirects`. `/favicon.ico` was a 200 rewrite there; a server cannot answer with a file of the
build, so it redirects.
*/
const ADDRESS_ALIASES = new Map([
  ["/favicon.ico", { location: "/favicon.png", status: 301 }],
  ["/home", { location: "/repo", status: 302 }],
  ["/home/", { location: "/repo", status: 302 }],
  ["/home/index.html", { location: "/repo", status: 302 }],
  ["/landing", { location: "/", status: 301 }],
  ["/landing/", { location: "/", status: 301 }],
  ["/landing/index.html", { location: "/", status: 301 }],
  ["/landing-preview", { location: "/", status: 301 }],
  ["/landing-preview/", { location: "/", status: 301 }],
  ["/landing-preview/index.html", { location: "/", status: 301 }],
]);

// Answers every request that no file and no exact route of convex/http.ts answers: on Convex,
// convex/http.ts calls it; in development and in `vp preview`, Vite does. TanStack Start renders the
// page, including its own 404 page.
const server = {
  async fetch(request: Request) {
    const url = new URL(request.url);
    // `Secure` when the browser reached the site over HTTPS. A local backend and Vite's dev server
    // serve plain HTTP, so the request decides, not the build or the backend URL.
    const cookieOptions = { secure: url.protocol === "https:" };
    if (request.method === "POST") {
      // The browser signs in, refreshes, and signs out through these routes, and the refresh token
      // stays in an httpOnly cookie on this origin. Every mutation that mints a session is listed in
      // `signIn`; the route answers 403 for any other function.
      const auth = setupConvexAuthServer({
        convexUrl,
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
        signIn: [
          api.auth.completeSignInWithGithub,
          api.auth.completeSignInWithGoogle,
          api.auth.signInWithPassword,
          api.auth.signUpWithPassword,
          api.agentBrowserHandoff.signInWithAgentBrowserHandoff,
        ],
        cookieOptions,
      });
      switch (url.pathname) {
        case "/auth/signin":
          return auth.convexProxyHandler(request);
        case "/auth/refresh":
          return auth.refreshHandler(request);
        case "/auth/signout":
          return auth.signOutHandler(request);
      }
    }

    const alias = ADDRESS_ALIASES.get(url.pathname);
    if (alias) {
      return new Response(null, {
        status: alias.status,
        headers: { Location: `${alias.location}${url.search}` },
      });
    }

    const cookies = httpCookies(request);
    const session = new ServerAuthSession({
      refreshSession: (refreshToken) => convex.mutation(api.auth.refreshSession, { refreshToken }),
      cookies,
      cookieOptions,
    });
    // The build's prerender renders the public pages without a visitor, and every visitor gets
    // them, so their render must not say signed out: vite.config.ts marks its requests, and they
    // get no token at all.
    const token = request.headers.has("x-prerender") ? undefined : await session.getToken();
    const page = await handler.fetch(request, { context: { token } });
    const headers = new Headers(page.headers);
    cookies.applyTo(headers);
    return new Response(page.body, { status: page.status, headers });
  },
};

export default server;
