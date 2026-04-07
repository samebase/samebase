import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
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
