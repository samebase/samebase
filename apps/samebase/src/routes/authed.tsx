import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  RedirectWithoutSession,
  redirectWithoutSession,
} from "@samebase/convex-auth-tanstack-start";

export const Route = createFileRoute("/_authed")({
  // The layout only requires a session; each page under it declares its own access.
  staticData: { access: "access_public", pathSuggestion: "hidden" },
  // A server render without a session, such as a bookmark or a shared link, redirects to the
  // landing page, which signs in and returns to `next`. A block body: with `search`, the return type
  // of an expression body would depend on the route tree, which contains this route, and TypeScript
  // reports the cycle.
  beforeLoad: ({ serverContext, location }) => {
    redirectWithoutSession(serverContext, { to: "/", search: { next: location.href } });
  },
  // In the browser, the gate sees no session after a sign-out, here or in another tab, or on a link
  // inside the app while signed out. It goes to the landing page without `next`, so a sign-out does
  // not put `next` in the URL or in the history.
  component: () => (
    <RedirectWithoutSession to="/">
      <Outlet />
    </RedirectWithoutSession>
  ),
});
