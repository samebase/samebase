import { PostHogProvider } from "@posthog/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import posthog from "posthog-js";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { isPostHogEnabled, posthogConfig, posthogToken } from "./lib/posthog";
import { QueryProvider } from "./lib/providers/query-provider";

export { client } from "./lib/convexClient";

let mounted = false;

if (isPostHogEnabled) {
  posthog.init(posthogToken, posthogConfig);
}

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {isPostHogEnabled ? (
        <PostHogProvider client={posthog}>
          <BrowserRouter>
            <ThemeProvider attribute="class">
              <ConvexAuthProvider client={client}>
                <QueryProvider>
                  <App />
                </QueryProvider>
              </ConvexAuthProvider>
            </ThemeProvider>
          </BrowserRouter>
        </PostHogProvider>
      ) : (
        <BrowserRouter>
          <ThemeProvider attribute="class">
            <ConvexAuthProvider client={client}>
              <QueryProvider>
                <App />
              </QueryProvider>
            </ConvexAuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      )}
    </React.StrictMode>,
  );
}
