import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
// Keep the client entry importing Tailwind for browser-only dev and hydration
// paths; the root route imports the same stylesheet for prerendered HTML.
import "./index.css";
import { initializeAppBootRecovery } from "@/lib/appBootRecovery";

function hydrateApp() {
  initializeAppBootRecovery();

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

hydrateApp();
