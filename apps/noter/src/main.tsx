import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { QueryProvider } from "./lib/providers/query-provider";

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => void registration.update(), 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          void registration.update();
        }
      });
    }
  },
});

export const client = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
);

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
