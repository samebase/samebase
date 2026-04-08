import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { AppRouterProvider } from "./lib/appRouter";
import { QueryProvider } from "./lib/providers/query-provider";

export { client } from "./lib/convexClient";

let mounted = false;

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider attribute="class">
        <ConvexAuthProvider client={client}>
          <QueryProvider>
            <AppRouterProvider />
          </QueryProvider>
        </ConvexAuthProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}
