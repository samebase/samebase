import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { AppRouterProvider } from "./lib/appRouter";
import { AppBootErrorBoundary } from "@/components/AppBootErrorBoundary";
import { initializeAppBootRecovery } from "@/lib/appBootRecovery";
import { QueryProvider } from "./lib/providers/query-provider";
import { ensureWindowStorageAccess } from "./lib/storageAccess";
import { OptionalThemeProvider } from "./lib/themeStorageFallback";

let mounted = false;

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  ensureWindowStorageAccess("localStorage");
  ensureWindowStorageAccess("sessionStorage");
  initializeAppBootRecovery();

  ReactDOM.createRoot(document.getElementById("root")!).render(
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
    </React.StrictMode>,
  );
}
