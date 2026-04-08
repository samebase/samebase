import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { AppRouterProvider } from "./lib/appRouter";
import { QueryProvider } from "./lib/providers/query-provider";
import { ensureWindowStorageAccess } from "./lib/storageAccess";
import { OptionalThemeProvider } from "./lib/themeStorageFallback";

export { client } from "./lib/convexClient";

let mounted = false;

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  ensureWindowStorageAccess("localStorage");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <OptionalThemeProvider>
        <ConvexAuthProvider client={client}>
          <QueryProvider>
            <AppRouterProvider />
          </QueryProvider>
        </ConvexAuthProvider>
      </OptionalThemeProvider>
    </React.StrictMode>,
  );
}

mountApp();
