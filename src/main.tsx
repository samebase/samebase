import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ConvexReactClient } from "convex/react";
import App from "./App.tsx";
import "./index.css";
import { QueryProvider } from "./lib/providers/query-provider";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider attribute="class">
        <ConvexAuthProvider client={convex}>
          <QueryProvider>
            <App />
          </QueryProvider>
        </ConvexAuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
