import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { AppRouterProvider } from "./lib/appRouter";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { initializeAppBootRecovery } from "@/lib/appBootRecovery";
import { STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE } from "@/lib/staticPublicLandingShared";
import { QueryProvider } from "./lib/providers/query-provider";
import { OptionalThemeProvider } from "./lib/themeStorageFallback";

let mounted = false;

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  initializeAppBootRecovery();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Missing root element");
  }

  const appTree = (
    <React.StrictMode>
      <AppBootErrorBoundary>
        <OptionalThemeProvider>
          <ConvexAuthProvider client={client}>
            <QueryProvider>
              <AppRouterProvider />
            </QueryProvider>
          </ConvexAuthProvider>
        </OptionalThemeProvider>
      </AppBootErrorBoundary>
    </React.StrictMode>
  );

  if (
    rootElement.getAttribute(STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE) === "true"
  ) {
    ReactDOM.hydrateRoot(rootElement, appTree);
    return;
  }

  ReactDOM.createRoot(rootElement).render(appTree);
}
