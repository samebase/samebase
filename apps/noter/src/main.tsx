import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import App from "./App.tsx";
import "@xyflow/react/dist/style.css";
import { QueryProvider } from "./lib/providers/query-provider";

const convexUrl = __DAYTONA_CONVEX_PROXY_PATH__
  ? new URL(__DAYTONA_CONVEX_PROXY_PATH__, window.location.origin).toString()
  : import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

export const client = new ConvexReactClient(convexUrl);

let mounted = false;

export function mountApp() {
  if (mounted) {
    return;
  }
  mounted = true;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <ThemeProvider attribute="class">
          <ConvexAuthProvider client={client}>
            <QueryProvider>
              <App />
            </QueryProvider>
          </ConvexAuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
